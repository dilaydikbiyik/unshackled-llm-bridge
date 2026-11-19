import { setDragPayload, type DraggedConversation } from './drag-out';

/**
 * Fork as one of the site's own message actions.
 *
 * The floating handle works on any site, but it is visibly something laid
 * over the page. Where the site has an action bar under each message — copy,
 * share, "⋯" — the fork control goes into it, styled by copying the classes
 * and data attributes of the site's own button beside it, so it looks and
 * behaves like part of the site: it appears when the site's actions appear,
 * and follows the site's theme.
 *
 * The site re-renders its turns (ChatGPT recreates them as a long
 * conversation scrolls), so the bars are re-decorated whenever the page
 * changes. A turn whose bar cannot be found keeps the floating handle.
 */

export const NATIVE_FORK_CLASS = 'ulb-native-fork';

/** Attributes the site's buttons are styled by. Copied, never invented. */
const STYLE_ATTRIBUTES = ['class', 'data-color', 'data-variant', 'data-size', 'data-icon-size', 'data-uniform'];

/** How often, at most, the page is re-decorated while it is changing. */
const DECORATE_INTERVAL_MS = 300;

export interface NativeForkOptions {
  locateMessages: () => Element[];
  locateActionBar: (turn: Element) => Element | null;
  onFork: (messageIndex: number) => void;
  prepareDrag?: () => Promise<DraggedConversation | null>;
  /** Accessible name and tooltip. */
  label: string;
  hint?: string;
}

export interface NativeForks {
  /** Whether this turn has a fork control in its own action bar. */
  has: (turn: Element) => boolean;
  unmount: () => void;
}

export function mountNativeForks(options: NativeForkOptions): NativeForks {
  const indexOf = (bar: Element): number =>
    options.locateMessages().findIndex((turn) => options.locateActionBar(turn) === bar);

  const decorate = (): void => {
    for (const turn of options.locateMessages()) {
      const bar = options.locateActionBar(turn);
      if (!bar) continue;
      if (!bar.querySelector(`.${NATIVE_FORK_CLASS}`)) insert(bar, createButton(bar));
    }
  };

  function createButton(bar: Element): HTMLButtonElement {
    const template = [...bar.querySelectorAll('button')].filter((b) => !b.classList.contains(NATIVE_FORK_CLASS)).at(-1);
    const button = document.createElement('button');
    button.type = 'button';
    for (const name of STYLE_ATTRIBUTES) {
      const value = template?.getAttribute(name);
      if (value !== null && value !== undefined) button.setAttribute(name, value);
    }
    button.classList.add(NATIVE_FORK_CLASS);
    button.setAttribute('aria-label', options.label);
    button.title = options.hint ?? options.label;
    button.draggable = true;
    // The site's own icons are 16–20px and take their colour from the text.
    const size = template?.querySelector('svg')?.getAttribute('width') ?? '16';
    button.append(forkIcon(size));
    if (!template) {
      button.style.cssText =
        'background:none;border:0;padding:4px;border-radius:6px;cursor:pointer;color:inherit;opacity:.75;display:inline-flex';
    }
    wire(button, bar);
    return button;
  }

  /**
   * Right after the site's last button, inside the same group: the bar may
   * nest its buttons in an inner row, and each button in a wrapper of its own
   * (ChatGPT puts its menu buttons in a span). The fork control gets the same
   * wrapper, so spacing and alignment come from the site's own rules.
   */
  function insert(bar: Element, button: HTMLButtonElement): void {
    const last = [...bar.querySelectorAll('button')].filter((b) => !b.classList.contains(NATIVE_FORK_CLASS)).at(-1);
    if (!last) {
      bar.append(button);
      return;
    }
    // The outermost wrapper that holds only this button.
    let item: Element = last;
    while (item.parentElement && item.parentElement !== bar && item.parentElement.children.length === 1) {
      item = item.parentElement;
    }
    let node: Element = button;
    if (item !== last) {
      const shell = document.createElement(item.tagName);
      shell.className = item.className;
      shell.append(button);
      node = shell;
    }
    item.after(node);
  }

  let payload: DraggedConversation | null = null;
  let preparing = false;
  let draggedUrl: string | null = null;

  function wire(button: HTMLButtonElement, bar: Element): void {
    button.addEventListener('mouseenter', () => {
      if (!options.prepareDrag || preparing) return;
      preparing = true;
      void options
        .prepareDrag()
        .then((ready) => (payload = ready))
        .catch(() => (payload = null))
        .finally(() => (preparing = false));
    });
    button.addEventListener('dragstart', (event) => {
      if (!payload || !event.dataTransfer) {
        event.preventDefault();
        return;
      }
      draggedUrl = setDragPayload(event.dataTransfer, payload);
    });
    button.addEventListener('dragend', () => {
      if (draggedUrl) URL.revokeObjectURL(draggedUrl);
      draggedUrl = null;
    });
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const index = indexOf(bar);
      if (index >= 0) options.onFork(index);
    });
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const observer = new MutationObserver(() => {
    if (timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      decorate();
    }, DECORATE_INTERVAL_MS);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  decorate();

  return {
    has: (turn) => {
      const bar = options.locateActionBar(turn);
      return bar !== null && bar.querySelector(`.${NATIVE_FORK_CLASS}`) !== null;
    },
    unmount: () => {
      observer.disconnect();
      clearTimeout(timer);
      document.querySelectorAll(`.${NATIVE_FORK_CLASS}`).forEach((el) => {
        const shell = el.parentElement;
        el.remove();
        if (shell && shell.childElementCount === 0 && shell.classList.length > 0) shell.remove();
      });
    },
  };
}

/** A branching arrow: one line splitting in two, drawn in the text colour. */
function forkIcon(size: string): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of ['M6 3v12', 'M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M18 9a9 9 0 0 1-9 9']) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}
