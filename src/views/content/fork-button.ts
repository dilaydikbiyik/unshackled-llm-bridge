import { html, setHtml } from '@views/html';
import { setDragPayload, type DraggedConversation } from './drag-out';
import { BASE_STYLES, createShadowHost } from './shadow-host';

export const FORK_BUTTON_HOST_ID = 'ulb-fork-button-host';

/** Grace period so moving the pointer from a message onto the button doesn't hide it. */
export const HIDE_DELAY_MS = 400;

/** Space between the handle and the message it belongs to. */
const GAP = 8;
/** Used until the button has been laid out and can report its own width. */
const FALLBACK_WIDTH = 96;
/** Less of a message than this on screen is not worth a handle beside it. */
const MIN_VISIBLE = 24;

export interface ForkButtonOptions {
  /**
   * Injected by the controller. The view must not know how a message node is
   * found — that is selector knowledge, and it belongs to the data layer.
   */
  locateMessages: () => Element[];
  onFork: (messageIndex: number) => void;
  /**
   * Prepares the conversation for dragging out of the page. Called when the
   * affordance appears, so the payload is ready by the time a drag starts —
   * `dragstart` cannot wait for a promise.
   */
  prepareDrag?: () => Promise<DraggedConversation | null>;
  /** Tooltip telling the user the affordance can be dragged, not only clicked. */
  hint?: string;
  /**
   * True for a turn whose own action bar already carries the fork control;
   * the floating handle stays out of its way.
   */
  hasNative?: (turn: Element) => boolean;
}

/**
 * Per-message fork affordance. A single floating button is repositioned onto
 * whichever message the pointer is over, rather than injecting a button into
 * every message — one element to keep alive, and nothing added to the
 * platform's own DOM tree.
 */
/**
 * Where a site's own top bars are likely to be. Kept broad on purpose: a
 * candidate only counts if it is actually fixed or sticky and actually pinned
 * to the top of the window over the handle's column.
 */
const OVERLAY_CANDIDATES =
  'header, [role="banner"], nav, [class*="header" i], [class*="toolbar" i], [class*="sticky" i]';

/**
 * The bottom edge of whatever the site has pinned over the top of the window
 * at this column — its header, a toolbar — or 0 when nothing is.
 *
 * Measured, not hit-tested. ChatGPT's header is fixed over the conversation
 * with `pointer-events: none`, so asking the page what is drawn at a point
 * passes straight through it between its buttons and answers "the
 * conversation"; the handle then landed on the header strip beside the site's
 * own controls. A layer's box does not lie about where it is.
 */
function overlayFloor(x: number, message: Element): number {
  let floor = 0;
  for (const layer of document.querySelectorAll<HTMLElement>(OVERLAY_CANDIDATES)) {
    // The message itself may be sticky while it is being answered.
    if (layer === message || layer.contains(message) || message.contains(layer)) continue;
    const position = getComputedStyle(layer).position;
    if (position !== 'fixed' && position !== 'sticky') continue;
    const box = layer.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) continue;
    // Pinned to the top of the window, across the handle's column.
    if (box.top > 1 || x < box.left || x > box.right) continue;
    floor = Math.max(floor, box.bottom);
  }
  return floor;
}

/**
 * The highest point beside a message where the handle can sit uncovered: the
 * top of the visible message, but never above a pinned top bar. Null when the
 * visible part of the message is too small to put anything beside.
 */
function freeTop(rect: DOMRect, x: number, message: Element): number | null {
  const from = Math.max(rect.top, overlayFloor(x, message), 0);
  const to = Math.min(rect.bottom, innerHeight);
  // A message shorter than the threshold is still a message: a one-line "ok"
  // used to get no handle at all. The threshold is for a message mostly
  // scrolled out of sight, so a fully visible one always qualifies.
  if (to - from <= 0 || to - from < Math.min(MIN_VISIBLE, rect.height)) return null;
  return from + GAP;
}

export function mountForkButtons(options: ForkButtonOptions): () => void {
  const shadow = createShadowHost(FORK_BUTTON_HOST_ID);
  setHtml(
    shadow,
    html`
      <style>
        ${BASE_STYLES}
        button {
          /* Fixed, not absolute: these sites scroll an inner container, so the
             page's own scroll offset is zero and a document-space position
             lands nowhere. See place(). */
          position: fixed; z-index: 2147483646; display: none;
          font: 500 12px/1 ui-sans-serif, system-ui, sans-serif;
          padding: 5px 9px; border-radius: 999px; cursor: grab;
          background: #534ab7; color: #fff; border: none;
          box-shadow: 0 2px 10px rgba(0,0,0,0.22);
        }
        button:hover { background: #3C3489; }
        button:active { cursor: grabbing; }
      </style>
      <button id="fork" type="button" draggable="true" aria-label="Fork" title="${options.hint ?? ''}">
        ⠿ ⑂ Fork
      </button>
    `,
  );

  const button = shadow.getElementById('fork') as HTMLButtonElement;
  let currentIndex = -1;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  /** Kept so the button can follow its message while the page scrolls. */
  let currentNode: Element | null = null;

  /**
   * Puts the button on the message, in viewport coordinates.
   *
   * It used to be placed in document space, as `rect.top + scrollY`. Every one
   * of these sites scrolls an inner container rather than the window, so
   * `scrollY` is zero however far down the conversation is — and the button was
   * placed by a negative `rect.top` alone, thousands of pixels above the
   * screen. It was only ever in the right place on a conversation scrolled to
   * the very top.
   */
  const place = (node: Element): void => {
    const rect = node.getBoundingClientRect();
    const width = button.offsetWidth || FALLBACK_WIDTH;

    // Beside the message, never on it. Placed inside the message's top-right
    // corner the handle sat on the first line of text and hid the words under
    // it. These sites centre the conversation in a column with room on either
    // side, so the handle goes in that margin; only on a window too narrow for
    // a margin does it fall back to the corner.
    let left: number;
    if (rect.right + GAP + width <= innerWidth - GAP) left = rect.right + GAP;
    else if (rect.left - GAP - width >= GAP) left = rect.left - GAP - width;
    else left = Math.max(GAP, rect.right - width - GAP);

    const top = freeTop(rect, left + width / 2, node);
    if (top === null) {
      button.style.display = 'none';
      return;
    }

    button.style.display = 'block';
    button.style.top = `${String(Math.min(top, innerHeight - 40))}px`;
    button.style.left = `${String(left)}px`;
  };

  const onPointerOver = (event: Event) => {
    const nodes = options.locateMessages();
    const target = event.target as Node;
    const index = nodes.findIndex((node) => node === target || node.contains(target));
    if (index < 0) return;
    if (options.hasNative?.(nodes[index]!)) {
      button.style.display = 'none';
      currentIndex = -1;
      currentNode = null;
      return;
    }

    clearTimeout(hideTimer);
    if (index !== currentIndex) dragPayload = null;
    currentIndex = index;
    currentNode = nodes[index] ?? null;
    if (currentNode) place(currentNode);
  };

  /** The message moves under the button as the conversation scrolls. */
  const onScroll = () => {
    if (currentNode && button.style.display === 'block') place(currentNode);
  };

  const onPointerOut = () => {
    hideTimer = setTimeout(() => {
      button.style.display = 'none';
    }, HIDE_DELAY_MS);
  };

  // The conversation is prepared while the pointer rests on the affordance, so
  // that a drag can hand it over synchronously.
  let dragPayload: DraggedConversation | null = null;
  let draggedUrl: string | null = null;
  let preparing: Promise<void> | null = null;

  const prepare = (): void => {
    if (!options.prepareDrag || preparing) return;
    preparing = options.prepareDrag()
      .then((payload) => {
        dragPayload = payload;
      })
      .catch(() => {
        dragPayload = null;
      })
      .finally(() => {
        preparing = null;
      });
  };

  button.addEventListener('mouseenter', () => {
    clearTimeout(hideTimer);
    prepare();
  });
  button.addEventListener('dragstart', (event) => {
    // Nothing prepared yet: let the click path handle it rather than dragging
    // an empty payload across the screen.
    if (!dragPayload || !event.dataTransfer) {
      event.preventDefault();
      return;
    }
    draggedUrl = setDragPayload(event.dataTransfer, dragPayload);
  });
  button.addEventListener('dragend', () => {
    button.style.display = 'none';
    if (draggedUrl) URL.revokeObjectURL(draggedUrl);
    draggedUrl = null;
  });
  button.addEventListener('click', () => {
    button.style.display = 'none';
    if (currentIndex >= 0) options.onFork(currentIndex);
  });

  document.addEventListener('pointerover', onPointerOver, true);
  document.addEventListener('pointerleave', onPointerOut, true);
  // Capture, because the element that scrolls is inside the page, not the
  // window: a bubbling listener on document never hears it.
  document.addEventListener('scroll', onScroll, { capture: true, passive: true });
  window.addEventListener('resize', onScroll, { passive: true });

  return () => {
    document.removeEventListener('pointerover', onPointerOver, true);
    document.removeEventListener('pointerleave', onPointerOut, true);
    document.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', onScroll);
    clearTimeout(hideTimer);
    shadow.host.remove();
  };
}
