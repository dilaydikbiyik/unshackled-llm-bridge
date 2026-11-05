import { html, setHtml } from '@views/html';
import { setDragPayload, type DraggedConversation } from './drag-out';
import { BASE_STYLES, createShadowHost } from './shadow-host';

export const FORK_BUTTON_HOST_ID = 'ulb-fork-button-host';

/** Grace period so moving the pointer from a message onto the button doesn't hide it. */
export const HIDE_DELAY_MS = 400;

/** Distance from the message's edges, and how far the button reaches inward. */
const MARGIN = 6;
const BUTTON_INSET = 84;

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
}

/**
 * Per-message fork affordance. A single floating button is repositioned onto
 * whichever message the pointer is over, rather than injecting a button into
 * every message — one element to keep alive, and nothing added to the
 * platform's own DOM tree.
 */
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
    // Scrolled out of view: there is nothing to attach to.
    if (rect.bottom < 0 || rect.top > innerHeight) {
      button.style.display = 'none';
      return;
    }
    button.style.display = 'block';
    // A long answer can start above the viewport; the handle stays reachable
    // at the top of what is actually on screen.
    button.style.top = `${String(Math.max(MARGIN, Math.min(rect.top + MARGIN, innerHeight - 40)))}px`;
    button.style.left = `${String(Math.max(MARGIN, rect.right - BUTTON_INSET))}px`;
  };

  const onPointerOver = (event: Event) => {
    const nodes = options.locateMessages();
    const target = event.target as Node;
    const index = nodes.findIndex((node) => node === target || node.contains(target));
    if (index < 0) return;

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
