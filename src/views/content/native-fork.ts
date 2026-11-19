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

/** Icons in message action bars are 16–20px; anything larger is not one. */
const MAX_ICON_PX = 24;

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
    // As large as the site's own icons, and in their colour (the text colour).
    // The bar's main icon size: its largest icon, since a "⋯" or a menu
    // trigger is often drawn smaller than the icons beside it (ChatGPT draws
    // copy at 20px and "⋯" at 16px). Capped, so a stray large control in the
    // bar cannot blow the icon up.
    const siblings = [...bar.querySelectorAll('button')].filter((b) => !b.classList.contains(NATIVE_FORK_CLASS));
    const sizes = siblings.map(iconSize).filter((s) => s <= MAX_ICON_PX);
    button.append(forkIcon(String(sizes.length > 0 ? Math.max(...sizes) : iconSize(template))));
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
    // Each wrapper between that outermost one and the button, rebuilt around
    // the fork button: Gemini nests its "⋯" two deep.
    let node: Element = button;
    for (let wrapper = last.parentElement; wrapper && item !== last; wrapper = wrapper.parentElement) {
      const shell = document.createElement(wrapper.tagName);
      shell.className = wrapper.className;
      shell.setAttribute('data-ulb-shell', '');
      shell.append(node);
      node = shell;
      if (wrapper === item) break;
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
        // The button and the wrappers built for it, which hold nothing else.
        let outer: Element = el;
        while (outer.parentElement && outer.parentElement.childElementCount === 1 && outer.parentElement.hasAttribute('data-ulb-shell')) {
          outer = outer.parentElement;
        }
        outer.remove();
      });
    },
  };
}

/**
 * The size the site draws its icons at. Measured where possible: Claude sizes
 * its icons in CSS and gives the SVG no width, so reading the attribute fell
 * back to a default and the fork icon came out larger than its neighbours.
 */
function iconSize(template: Element | undefined): number {
  if (!template) return 18;
  const svg = template.querySelector('svg');
  const drawn = svg?.getBoundingClientRect().width ?? 0;
  if (drawn > 0) return Math.round(drawn);
  const declared = Number(svg?.getAttribute('width'));
  if (declared > 0) return declared;
  // An icon drawn some other way (a mask, an icon font) is the largest box
  // inside the button that is smaller than the button.
  const outer = template.getBoundingClientRect().width;
  const inner = [...template.querySelectorAll('*')]
    .map((el) => el.getBoundingClientRect().width)
    .filter((w) => w > 0 && w < outer);
  return inner.length > 0 ? Math.round(Math.max(...inner)) : 18;
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
  // Thinner than the default 2: the sites' own line icons are drawn light.
  svg.setAttribute('stroke-width', '1.75');
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
