/**
 * All in-page UI lives inside a shadow root so host-page styles cannot leak in
 * and ours cannot leak out — the platforms restyle aggressively and a plain
 * div would be unreadable within a release or two.
 */
export function createShadowHost(id: string): ShadowRoot {
  document.getElementById(id)?.remove();
  const host = document.createElement('div');
  host.id = id;
  host.style.cssText = 'all: initial; position: static;';
  document.documentElement.appendChild(host);
  return host.attachShadow({ mode: 'open' });
}

export const BASE_STYLES = `
  :host, * { box-sizing: border-box; }
  .ulb {
    font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
    font-size: 13px;
    line-height: 1.5;
    color: #1f1e1c;
  }
  @media (prefers-color-scheme: dark) {
    .ulb { color: #f1efe8; }
  }
`;

export { escapeHtml } from '../escape';

/** Clipboard with a fallback for pages that block the async API. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.cssText = 'position:fixed;opacity:0;';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}
