import type { BridgeConversation } from '@domain/conversation/schema';
import type { TransferMode, TransferPackageBuilder } from '@domain/transfer';
import { t, type Lang } from '@shared/i18n';
import type { CapturedAttachmentMeta } from '@shared/messages';
import { activePersona, type Settings } from '@shared/settings';
import { PLATFORMS, type PlatformId } from '@domain/platforms';
import { BASE_STYLES, copyText, createShadowHost, escapeHtml } from './shadow-host';

const HOST_ID = 'ulb-fork-dialog-host';

export interface ForkDialogOptions {
  conversation: BridgeConversation;
  settings: Settings;
  attachments: CapturedAttachmentMeta[];
  /** Injected by the controller — the view never builds packages itself. */
  buildPackage: TransferPackageBuilder;
  /** Precomputed by the controller so the view holds no sizing policy. */
  showLengthWarning: boolean;
  onTransfer: (result: {
    target: PlatformId;
    text: string;
    attachmentIds: string[];
  }) => Promise<void>;
}

/**
 * The transfer preview screen (in-page rather than side panel, so it sits next
 * to the message the user forked from). The package is always editable and
 * always copyable — the clipboard escape hatch is never more than one click away.
 */
export function openForkDialog(options: ForkDialogOptions): void {
  const { conversation, settings, attachments } = options;
  const lang: Lang = settings.language;
  const persona = activePersona(settings);
  const canSummarize = settings.anthropicApiKey.length > 0;

  const targets = (Object.keys(PLATFORMS) as PlatformId[]).filter(
    (p) => p !== conversation.sourcePlatform,
  );

  const state = {
    target: targets[0]!,
    mode: 'full' as TransferMode,
    includePersona: false,
    attachmentIds: attachments.map((a) => a.id),
    text: '',
  };

  const shadow = createShadowHost(HOST_ID);
  shadow.innerHTML = `
    <style>
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
      .warn {
        padding: 8px 10px; border-radius: 8px; font-size: 12px;
        background: #FAEEDA; color: #854F0B;
      }
      .err { background: #FCEBEB; color: #A32D2D; }
      .muted { opacity: 0.7; font-size: 12px; }
      .row { display: flex; gap: 8px; justify-content: flex-end; align-items: center; }
      button {
        font: inherit; padding: 7px 13px; border-radius: 8px; cursor: pointer;
        border: 1px solid rgba(0,0,0,0.2); background: transparent; color: inherit;
      }
      button.primary { background: #534ab7; border-color: #534ab7; color: #fff; }
      button[disabled] { opacity: 0.55; cursor: default; }
    </style>
    <div class="ulb backdrop">
      <div class="panel" role="dialog" aria-modal="true">
        <h2>${escapeHtml(t(lang, 'forkTitle'))}</h2>

        <div class="field">
          <label for="target">${escapeHtml(t(lang, 'forkTarget'))}</label>
          <select id="target">
            ${targets.map((p) => `<option value="${p}">${escapeHtml(PLATFORMS[p].label)}</option>`).join('')}
          </select>
        </div>

        <div class="field">
          <label for="mode">${escapeHtml(t(lang, 'forkMode'))}</label>
          <select id="mode">
            <option value="full">${escapeHtml(t(lang, 'forkModeFull'))}</option>
            <option value="trimmed">${escapeHtml(t(lang, 'forkModeTrimmed'))}</option>
            <option value="summary" ${canSummarize ? '' : 'disabled'}>
              ${escapeHtml(t(lang, 'forkModeSummary'))}
            </option>
          </select>
        </div>

        <div id="notice"></div>

        <div class="checks">
          ${
            persona
              ? `<label class="check"><input type="checkbox" id="persona" />
                 <span>${escapeHtml(t(lang, 'forkPersonaInclude'))} — ${escapeHtml(persona.name)}</span></label>`
              : ''
          }
          ${
            attachments.length
              ? `<div><div class="muted">${escapeHtml(t(lang, 'forkAttachments'))}</div>
                 ${attachments
                   .map(
                     (a) =>
                       `<label class="check"><input type="checkbox" class="att" value="${a.id}" checked />
                        <span>${escapeHtml(a.name)} <span class="muted">(${formatSize(a.size)})</span></span></label>`,
                   )
                   .join('')}</div>`
              : ''
          }
        </div>

        <div class="field">
          <label for="preview">${escapeHtml(t(lang, 'forkPreview'))}</label>
          <textarea id="preview" spellcheck="false"></textarea>
          <div class="muted" id="tokens"></div>
        </div>

        <div class="row">
          <button id="cancel">${escapeHtml(t(lang, 'forkCancel'))}</button>
          <button id="copy">${escapeHtml(t(lang, 'forkCopy'))}</button>
          <button class="primary" id="transfer">${escapeHtml(t(lang, 'forkTransfer'))}</button>
        </div>
      </div>
    </div>
  `;

  const $ = <T extends HTMLElement>(id: string) => shadow.getElementById(id) as T;
  const preview = $<HTMLTextAreaElement>('preview');
  const notice = $<HTMLDivElement>('notice');
  const tokens = $<HTMLDivElement>('tokens');
  const transferBtn = $<HTMLButtonElement>('transfer');

  const close = () => shadow.host.remove();

  async function rebuild(): Promise<void> {
    transferBtn.disabled = true;
    notice.innerHTML =
      state.mode === 'summary' ? `<div class="warn">${escapeHtml(t(lang, 'forkSummaryLoading'))}</div>` : '';

    const built = await options.buildPackage({
      target: state.target,
      mode: state.mode,
      ...(state.includePersona && persona ? { personaText: persona.text } : {}),
    });

    state.text = built.text;
    preview.value = built.text;
    tokens.textContent = `~${built.estimatedTokens.toLocaleString()} tokens`;

    const notes: string[] = [];
    if (built.summaryError) {
      notes.push(`<div class="warn err">${escapeHtml(t(lang, 'forkSummaryError'))}</div>`);
    }
    if (state.mode === 'full' && options.showLengthWarning) {
      notes.push(`<div class="warn">${escapeHtml(t(lang, 'forkLengthWarning'))}</div>`);
    }
    notice.innerHTML = notes.join('');
    transferBtn.disabled = false;
  }

  $<HTMLSelectElement>('target').addEventListener('change', (e) => {
    state.target = (e.target as HTMLSelectElement).value as PlatformId;
    void rebuild();
  });
  $<HTMLSelectElement>('mode').addEventListener('change', (e) => {
    state.mode = (e.target as HTMLSelectElement).value as TransferMode;
    void rebuild();
  });
  shadow.getElementById('persona')?.addEventListener('change', (e) => {
    state.includePersona = (e.target as HTMLInputElement).checked;
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
  $<HTMLButtonElement>('transfer').addEventListener('click', () => {
    close();
    void options.onTransfer({
      target: state.target,
      text: state.text,
      attachmentIds: state.attachmentIds,
    });
  });
  shadow.querySelector('.backdrop')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) close();
  });

  void rebuild();
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
