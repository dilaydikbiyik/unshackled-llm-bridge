import type { BridgeConversation } from '@domain/conversation/schema';
import { knownPlatforms, platformInfo, platformLabel, type PlatformId } from '@domain/platforms';
import type {
  TransferDelivery,
  TransferMode,
  TransferPackageBuilder,
  TransferScope,
} from '@domain/transfer';
import { t, type Lang } from '@shared/i18n';
import type { CapturedAttachmentMeta } from '@shared/messages';
import { activePersona, type Settings } from '@shared/settings';
import { html, setHtml, type SafeHtml } from '@views/html';
import { BASE_STYLES, copyText, createShadowHost } from './shadow-host';

export const FORK_DIALOG_HOST_ID = 'ulb-fork-dialog-host';

/** Sentinel for the "back where this came from" option in the target list. */
export const RETURN_TARGET = 'origin';

export interface ForkDialogOptions {
  conversation: BridgeConversation;
  settings: Settings;
  attachments: CapturedAttachmentMeta[];
  /** Injected by the controller — the view never builds packages itself. */
  buildPackage: TransferPackageBuilder;
  /** Precomputed by the controller so the view holds no sizing policy. */
  showLengthWarning: boolean;
  /** How many messages each scope covers, so the view does no index math. */
  scopeCounts: Record<TransferScope, number>;
  /**
   * Set when this conversation began as a fork of another. Offered as a target
   * of its own: the answer goes back to the chat that asked for it, rather
   * than starting a third conversation nobody wanted.
   */
  origin?: { platform: PlatformId; label: string; url: string };
  onTransfer: (result: {
    target: PlatformId;
    text: string;
    scope: TransferScope;
    /** Present when the context travels as a file the controller must store. */
    contextFile?: { name: string; text: string };
    /** Set when the package is going back to the conversation it came from. */
    returnUrl?: string;
    attachmentIds: string[];
  }) => Promise<void>;
}

const STYLES = html`<style>
  ${BASE_STYLES}
  .backdrop {
    position: fixed; inset: 0; z-index: 2147483647;
    background: rgba(0,0,0,0.45);
    display: flex; align-items: center; justify-content: center; padding: 24px;
  }
  .panel {
    width: min(640px, 100%); max-height: 88vh; overflow: auto;
    background: #ffffff; color: #1f1e1c; border-radius: 14px; padding: 20px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    display: flex; flex-direction: column; gap: 14px;
  }
  @media (prefers-color-scheme: dark) {
    .panel { background: #262624; color: #f1efe8; }
    textarea, select { background: #1f1e1c; color: #f1efe8; border-color: rgba(255,255,255,0.18); }
  }
  h2 { margin: 0; font-size: 16px; font-weight: 500; }
  label { display: block; font-weight: 500; margin-bottom: 4px; }
  .field { display: flex; flex-direction: column; gap: 4px; }
  select, textarea {
    font: inherit; width: 100%; padding: 7px 9px; border-radius: 8px;
    border: 1px solid rgba(0,0,0,0.18); background: transparent; color: inherit;
  }
  textarea { min-height: 190px; font-family: ui-monospace, monospace; font-size: 12px; resize: vertical; }
  .checks { display: flex; flex-direction: column; gap: 6px; }
  .check { display: flex; gap: 7px; align-items: flex-start; font-weight: 400; }
  .warn { padding: 8px 10px; border-radius: 8px; font-size: 12px; background: #FAEEDA; color: #854F0B; }
  .err { background: #FCEBEB; color: #A32D2D; }
  .muted { opacity: 0.7; font-size: 12px; }
  .row { display: flex; gap: 8px; justify-content: flex-end; align-items: center; }
  button {
    font: inherit; padding: 7px 13px; border-radius: 8px; cursor: pointer;
    border: 1px solid rgba(0,0,0,0.2); background: transparent; color: inherit;
  }
  button.primary { background: #534ab7; border-color: #534ab7; color: #fff; }
  button[disabled] { opacity: 0.55; cursor: default; }
</style>`;

/**
 * The transfer preview (in-page rather than in the side panel, so it sits next
 * to the message being forked). The package is always editable and always
 * copyable — the clipboard escape hatch is never more than one click away.
 * Returns a function that closes the dialog.
 */
export function openForkDialog(options: ForkDialogOptions): () => void {
  const { conversation, settings, attachments } = options;
  const lang: Lang = settings.language;
  const persona = activePersona(settings);
  const canSummarize = settings.anthropicApiKey.length > 0;
  const targets = knownPlatforms()
    .map((site) => site.id)
    .filter((p) => p !== conversation.sourcePlatform);

  // A conversation that came from somewhere defaults to going back there: the
  // round trip is the reason to have forked in the first place.
  const state = {
    target: (options.origin ? options.origin.platform : targets[0]) as PlatformId,
    returning: options.origin !== undefined,
    // Whole conversation by default: moving a chat is the common case, and
    // forking one message was never worth opening a dialog for.
    scope: 'whole' as TransferScope,
    // Attached by default where the target accepts files: continuing a
    // conversation means the history is context, not the user's next message.
    delivery: (platformInfo(targets[0] as PlatformId).acceptsFileUpload
      ? 'attachment'
      : 'inline') as TransferDelivery,
    mode: 'full' as TransferMode,
    includePersona: false,
    attachmentIds: attachments.map((a) => a.id),
    text: '',
    contextFile: undefined as { name: string; text: string } | undefined,
  };

  const shadow = createShadowHost(FORK_DIALOG_HOST_ID);
  setHtml(
    shadow,
    html`
      ${STYLES}
      <div class="ulb backdrop">
        <div class="panel" role="dialog" aria-modal="true" aria-labelledby="ulb-fork-title">
          <h2 id="ulb-fork-title">${t(lang, 'forkTitle')}</h2>

          <div class="field">
            <label for="target">${t(lang, 'forkTarget')}</label>
            <select id="target">
              ${options.origin &&
              html`<option value="${RETURN_TARGET}">
                ⤺ ${t(lang, 'forkReturnTo').replace('{name}', options.origin.label)}
              </option>`}
              ${targets.map((p) => html`<option value="${p}">${platformLabel(p)}</option>`)}
            </select>
            ${options.origin && html`<span class="muted">${t(lang, 'forkReturnHint')}</span>`}
          </div>

          <div class="field">
            <label for="scope">${t(lang, 'forkScope')}</label>
            <select id="scope">
              <option value="whole">
                ${t(lang, 'forkScopeWhole')} (${String(options.scopeCounts.whole)})
              </option>
              <option value="upToMessage">
                ${t(lang, 'forkScopeUpTo')} (${String(options.scopeCounts.upToMessage)})
              </option>
            </select>
          </div>

          <div class="field">
            <label for="delivery">${t(lang, 'forkDelivery')}</label>
            <select id="delivery">
              <option value="attachment">${t(lang, 'forkDeliveryAttachment')}</option>
              <option value="inline">${t(lang, 'forkDeliveryInline')}</option>
            </select>
            <span class="muted" id="delivery-hint"></span>
          </div>

          <div class="field">
            <label for="mode">${t(lang, 'forkMode')}</label>
            <select id="mode">
              <option value="full">${t(lang, 'forkModeFull')}</option>
              <option value="trimmed">${t(lang, 'forkModeTrimmed')}</option>
              <option value="summary" ${canSummarize ? '' : 'disabled'}>
                ${t(lang, 'forkModeSummary')}
              </option>
            </select>
          </div>

          <div id="notice"></div>

          <div class="checks">
            ${persona &&
            html`<label class="check">
              <input type="checkbox" id="persona" />
              <span>${t(lang, 'forkPersonaInclude')} — ${persona.name}</span>
            </label>`}
            ${attachments.length > 0 &&
            html`<div>
              <div class="muted">${t(lang, 'forkAttachments')}</div>
              ${attachments.map(
                (a) => html`<label class="check">
                  <input type="checkbox" class="att" value="${a.id}" checked />
                  <span>${a.name} <span class="muted">(${formatSize(a.size)})</span></span>
                </label>`,
              )}
            </div>`}
          </div>

          <div class="field">
            <label for="preview">${t(lang, 'forkPreview')}</label>
            <textarea id="preview" spellcheck="false"></textarea>
            <div class="muted" id="tokens"></div>
          </div>

          <div class="row">
            <button id="cancel">${t(lang, 'forkCancel')}</button>
            <button id="copy">${t(lang, 'forkCopy')}</button>
            <button class="primary" id="transfer">${t(lang, 'forkTransfer')}</button>
          </div>
        </div>
      </div>
    `,
  );

  const $ = <T extends HTMLElement>(id: string) => shadow.getElementById(id) as T;
  const preview = $<HTMLTextAreaElement>('preview');
  const notice = $<HTMLDivElement>('notice');
  const tokens = $<HTMLDivElement>('tokens');
  const transferButton = $<HTMLButtonElement>('transfer');
  const close = () => shadow.host.remove();

  async function rebuild(): Promise<void> {
    transferButton.disabled = true;
    setHtml(
      notice,
      html`${state.mode === 'summary' && html`<div class="warn">${t(lang, 'forkSummaryLoading')}</div>`}`,
    );

    const built = await options.buildPackage({
      target: state.target,
      mode: state.mode,
      scope: state.scope,
      delivery: state.delivery,
      ...(state.includePersona && persona ? { personaText: persona.text } : {}),
    });

    state.text = built.text;
    state.contextFile = built.contextFile;
    preview.value = built.text;
    tokens.textContent = `~${built.estimatedTokens.toLocaleString()} tokens`;
    // The composer shows one sentence, so say where the rest of it went.
    $('delivery-hint').textContent = built.contextFile
      ? t(lang, 'forkDeliveryFile').replace(
          '{file}',
          `${built.contextFile.name} (${formatSize(built.contextFile.text.length)})`,
        )
      : '';

    const notes: SafeHtml[] = [];
    if (built.summaryError) {
      notes.push(html`<div class="warn err">${t(lang, 'forkSummaryError')}</div>`);
    }
    if (state.mode === 'full' && options.showLengthWarning) {
      notes.push(html`<div class="warn">${t(lang, 'forkLengthWarning')}</div>`);
    }
    setHtml(notice, html`${notes}`);
    transferButton.disabled = false;
  }

  const deliverySelect = $<HTMLSelectElement>('delivery');
  $<HTMLSelectElement>('target').addEventListener('change', (event) => {
    const value = (event.target as HTMLSelectElement).value;
    state.returning = value === RETURN_TARGET;
    state.target = state.returning
      ? (options.origin?.platform as PlatformId)
      : (value as PlatformId);
    // A target that takes no uploads cannot receive the context as a file.
    const canAttach = platformInfo(state.target).acceptsFileUpload;
    deliverySelect.disabled = !canAttach;
    if (!canAttach) {
      state.delivery = 'inline';
      deliverySelect.value = 'inline';
    }
    void rebuild();
  });
  $<HTMLSelectElement>('delivery').addEventListener('change', (event) => {
    state.delivery = (event.target as HTMLSelectElement).value as TransferDelivery;
    void rebuild();
  });
  $<HTMLSelectElement>('scope').addEventListener('change', (event) => {
    state.scope = (event.target as HTMLSelectElement).value as TransferScope;
    void rebuild();
  });
  $<HTMLSelectElement>('mode').addEventListener('change', (event) => {
    state.mode = (event.target as HTMLSelectElement).value as TransferMode;
    void rebuild();
  });
  shadow.getElementById('persona')?.addEventListener('change', (event) => {
    state.includePersona = (event.target as HTMLInputElement).checked;
    void rebuild();
  });
  shadow.querySelectorAll<HTMLInputElement>('.att').forEach((box) => {
    box.addEventListener('change', () => {
      state.attachmentIds = [...shadow.querySelectorAll<HTMLInputElement>('.att')]
        .filter((b) => b.checked)
        .map((b) => b.value);
    });
  });
  preview.addEventListener('input', () => {
    state.text = preview.value;
  });

  $<HTMLButtonElement>('cancel').addEventListener('click', close);
  $<HTMLButtonElement>('copy').addEventListener('click', () => {
    void copyText(state.text).then((ok) => {
      if (ok) $<HTMLButtonElement>('copy').textContent = t(lang, 'forkCopied');
    });
  });
  transferButton.addEventListener('click', () => {
    close();
    void options.onTransfer({
      target: state.target,
      text: state.text,
      scope: state.scope,
      ...(state.returning && options.origin ? { returnUrl: options.origin.url } : {}),
      ...(state.contextFile ? { contextFile: state.contextFile } : {}),
      attachmentIds: state.attachmentIds,
    });
  });
  shadow.querySelector('.backdrop')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) close();
  });

  void rebuild();
  return close;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
