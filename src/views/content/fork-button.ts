import { html, setHtml } from '@views/html';
import { setDragPayload, type DraggedConversation } from './drag-out';
import { BASE_STYLES, createShadowHost } from './shadow-host';

export const FORK_BUTTON_HOST_ID = 'ulb-fork-button-host';

/** Grace period so moving the pointer from a message onto the button doesn't hide it. */
export const HIDE_DELAY_MS = 400;

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
          position: absolute; z-index: 2147483646; display: none;
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

  const onPointerOver = (event: Event) => {
    const nodes = options.locateMessages();
    const target = event.target as Node;
    const index = nodes.findIndex((node) => node === target || node.contains(target));
    if (index < 0) return;

    clearTimeout(hideTimer);
    if (index !== currentIndex) dragPayload = null;
    currentIndex = index;
    const rect = nodes[index]!.getBoundingClientRect();
    button.style.display = 'block';
    button.style.top = `${rect.top + scrollY + 6}px`;
    button.style.left = `${rect.right + scrollX - 74}px`;
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

  return () => {
    document.removeEventListener('pointerover', onPointerOver, true);
    document.removeEventListener('pointerleave', onPointerOut, true);
    clearTimeout(hideTimer);
    shadow.host.remove();
  };
}
