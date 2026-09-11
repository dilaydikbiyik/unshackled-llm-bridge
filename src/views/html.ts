import { escapeHtml } from './escape';

/**
 * HTML that is safe to insert, by construction.
 *
 * Every view builds markup with the `html` tag. Interpolated values are
 * escaped unless they are themselves SafeHtml — so escaping is the default,
 * and forgetting it is impossible rather than merely discouraged. The only
 * ways to produce SafeHtml are the `html` tag and `trusted()`, and the only
 * way to insert markup is `setHtml()`; a lint rule forbids assigning
 * `innerHTML` anywhere else.
 */
const SAFE = Symbol('SafeHtml');

export interface SafeHtml {
  readonly [SAFE]: true;
  readonly value: string;
}

export type HtmlValue =
  | SafeHtml
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly HtmlValue[];

function safe(value: string): SafeHtml {
  return { [SAFE]: true, value };
}

export function isSafeHtml(value: unknown): value is SafeHtml {
  return typeof value === 'object' && value !== null && SAFE in value;
}

function render(value: HtmlValue): string {
  // `false`, `null` and `undefined` render as nothing, so `${cond && html`…`}` works.
  if (value === null || value === undefined || value === false) return '';
  if (Array.isArray(value)) return value.map(render).join('');
  if (isSafeHtml(value)) return value.value;
  return escapeHtml(String(value));
}

export function html(strings: TemplateStringsArray, ...values: HtmlValue[]): SafeHtml {
  let out = strings[0] ?? '';
  values.forEach((value, i) => {
    out += render(value) + (strings[i + 1] ?? '');
  });
  return safe(out);
}

/**
 * Static markup authored in this codebase, such as a stylesheet constant.
 * Never pass a value that came from a page, a conversation or a user.
 */
export function trusted(markup: string): SafeHtml {
  return safe(markup);
}

/** The single place markup enters the DOM. */
export function setHtml(target: Element | ShadowRoot, content: SafeHtml): void {
  target.innerHTML = content.value;
}
