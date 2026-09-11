import { html, setHtml } from '@views/html';
import { BASE_STYLES, copyText, createShadowHost } from './shadow-host';

export const TOAST_HOST_ID = 'ulb-toast-host';

/** Long enough to read and act on; short enough not to linger over the page. */
export const TOAST_DURATION_MS = 15_000;

/**
 * The clipboard fallback surface: when injection fails the package is never
 * lost — the user is told, and can copy it in one click.
 */
export function showToast(message: string, copyPayload?: { label: string; text: string }): void {
  const shadow = createShadowHost(TOAST_HOST_ID);
  setHtml(
    shadow,
    html`
      <style>
        ${BASE_STYLES}
        .toast {
          position: fixed; bottom: 20px; right: 20px; z-index: 2147483647;
          max-width: 340px; padding: 12px 14px; border-radius: 12px;
          background: #ffffff; color: #1f1e1c;
          border: 1px solid rgba(0,0,0,0.1);
          box-shadow: 0 8px 28px rgba(0,0,0,0.16);
          display: flex; flex-direction: column; gap: 8px;
        }
        @media (prefers-color-scheme: dark) {
          .toast { background: #262624; color: #f1efe8; border-color: rgba(255,255,255,0.14); }
        }
        .row { display: flex; gap: 8px; justify-content: flex-end; }
        button {
          font: inherit; padding: 5px 10px; border-radius: 8px; cursor: pointer;
          border: 1px solid currentColor; background: transparent; color: inherit;
        }
        button.primary { background: #534ab7; border-color: #534ab7; color: #fff; }
      </style>
      <div class="ulb toast" role="alert">
        <div>${message}</div>
        <div class="row">
          ${copyPayload && html`<button class="primary" id="copy">${copyPayload.label}</button>`}
          <button id="close" aria-label="Close">×</button>
        </div>
      </div>
    `,
  );

  const dismiss = () => shadow.host.remove();
  shadow.getElementById('close')?.addEventListener('click', dismiss);
  if (copyPayload) {
    shadow.getElementById('copy')?.addEventListener('click', () => {
      void copyText(copyPayload.text).then(dismiss);
    });
  }
  setTimeout(dismiss, TOAST_DURATION_MS);
}
