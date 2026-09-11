import { html, setHtml } from '@views/html';
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
          padding: 5px 9px; border-radius: 999px; cursor: pointer;
          background: #534ab7; color: #fff; border: none;
          box-shadow: 0 2px 10px rgba(0,0,0,0.22);
        }
        button:hover { background: #3C3489; }
      </style>
      <button id="fork" type="button" aria-label="Fork">⑂ Fork</button>
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

  button.addEventListener('mouseenter', () => clearTimeout(hideTimer));
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
