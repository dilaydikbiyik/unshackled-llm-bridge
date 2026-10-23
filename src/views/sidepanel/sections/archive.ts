import { platformLabel } from '@domain/platforms';
import { t, type Lang } from '@shared/i18n';
import { sendToBackground, type ArchiveHit, type ExportFormat } from '@shared/messages';
import { updateSettings, type Settings } from '@shared/settings';
import { html, setHtml, type SafeHtml } from '@views/html';
import { downloadText, el, flash } from '../dom';

/**
 * Universal archive: adapters can already read a conversation, so visited chats
 * can be indexed locally to answer "did I discuss this on ChatGPT or Claude?".
 * Opt-in — nothing is archived until the user says so.
 */
export function renderArchive(settings: Settings, hits: ArchiveHit[]): SafeHtml {
  const lang: Lang = settings.language;
  return html`
    <section>
      <h2>${t(lang, 'archiveSection')}</h2>
      <label class="row" style="font-weight:400">
        <input type="checkbox" id="archive-toggle" ${settings.archiveEnabled ? 'checked' : ''} />
        <span>${t(lang, 'archiveToggle')}</span>
      </label>
      ${settings.archiveEnabled
        ? html`<div class="field" style="margin-top:8px">
              <input type="search" id="archive-search" placeholder="${t(lang, 'archiveSearchPlaceholder')}" />
            </div>
            <ul class="archive-list" id="archive-results">
              ${hits.length > 0 ? renderHits(lang, hits) : html`<li class="hint">${t(lang, 'archiveNothingYet')}</li>`}
            </ul>`
        : // A search box over a store the user has not opted into is furniture:
          // it can only ever return nothing, and says nothing about why.
          html`<p class="hint">${t(lang, 'archiveOffHint')}</p>`}
    </section>
  `;
}

/** Debounce for the search box: one query per pause, not one per keystroke. */
export const SEARCH_DEBOUNCE_MS = 250;

export function bindArchive(root: ParentNode, settings: Settings, onChanged: () => void): void {
  const lang = settings.language;

  el<HTMLInputElement>(root, '#archive-toggle').addEventListener('change', (event) => {
    const archiveEnabled = (event.target as HTMLInputElement).checked;
    void updateSettings({ archiveEnabled }).then(onChanged);
  });

  // Absent while archiving is off: there is nothing to search, so the box is
  // not rendered at all rather than sitting there able only to return nothing.
  const search = root.querySelector<HTMLInputElement>('#archive-search');
  const results = root.querySelector<HTMLUListElement>('#archive-results');
  if (!search || !results) return;
  let debounce: ReturnType<typeof setTimeout> | undefined;

  search.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      void searchArchive(search.value).then((hits) => {
        setHtml(results, renderHits(lang, hits));
        bindExports(results, lang);
      });
    }, SEARCH_DEBOUNCE_MS);
  });

  bindExports(results, lang);
}

export async function searchArchive(query: string): Promise<ArchiveHit[]> {
  try {
    return await sendToBackground({ type: 'archive/search', query });
  } catch {
    return [];
  }
}

function bindExports(root: ParentNode, lang: Lang): void {
  root.querySelectorAll<HTMLButtonElement>('[data-export]').forEach((button) => {
    button.addEventListener('click', () => {
      const format = button.dataset['export'] as ExportFormat;
      const id = button.dataset['id'];
      if (!id) return;
      // A click that does nothing is worse than a failure that says so — and
      // an uncaught rejection here is invisible until it takes something else
      // down with it.
      void sendToBackground({ type: 'archive/export', id, format })
        .then((file) => {
          if (!file) {
            flash(button, t(lang, 'archiveExportFailed'), 2600);
            return;
          }
          downloadText(
            file.filename,
            file.content,
            format === 'markdown' ? 'text/markdown' : 'application/json',
          );
        })
        .catch(() => flash(button, t(lang, 'archiveExportFailed'), 2600));
    });
  });
}

export function renderHits(lang: Lang, hits: ArchiveHit[]): SafeHtml {
  if (hits.length === 0) return html`<li class="muted">${t(lang, 'archiveEmpty')}</li>`;
  return html`${hits.map(
    (hit) => html`
      <li class="archive-item">
        <div class="archive-title">${hit.title}</div>
        <div class="archive-snippet">
          ${platformLabel(hit.sourcePlatform)} · ${hit.updatedAt.slice(0, 10)}
          ${hit.snippet && `— ${hit.snippet}`}
        </div>
        <div class="row">
          <button class="link" data-export="markdown" data-id="${hit.id}">
            ${t(lang, 'archiveExportMd')}
          </button>
          <button class="link" data-export="json" data-id="${hit.id}">
            ${t(lang, 'archiveExportJson')}
          </button>
        </div>
      </li>
    `,
  )}`;
}
