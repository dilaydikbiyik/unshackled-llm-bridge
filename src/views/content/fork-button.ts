import type { PlatformAdapter } from '@adapters/types';
import { resolveSelectorAll } from '@models/config/selector-config';
import { BASE_STYLES, createShadowHost } from './shadow-host';

const HOST_ID = 'ulb-fork-button-host';

/**
 * Per-message fork affordance. A single floating button is repositioned onto
 * whichever message the pointer is over, rather than injecting a button into
 * every message node — one element to keep alive, and nothing added to the
 * platform's own DOM tree.
 */
export interface ForkButtonOptions {
  adapter: PlatformAdapter;
  messageSelectors: string[] | undefined;
  onFork: (messageIndex: number) => void;
}

export function mountForkButtons(options: ForkButtonOptions): () => void {
  const shadow = createShadowHost(HOST_ID);
  shadow.innerHTML = `
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
  `;

  const button = shadow.getElementById('fork') as HTMLButtonElement;
  let currentIndex = -1;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  const messageNodes = () => resolveSelectorAll(document, options.messageSelectors);

  const onPointerOver = (event: Event) => {
    const nodes = messageNodes();
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
    // Grace period so moving the pointer onto the button itself doesn't hide it.
    hideTimer = setTimeout(() => {
      button.style.display = 'none';
    }, 400);
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
