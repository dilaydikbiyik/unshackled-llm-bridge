import { t, type Lang } from '@shared/i18n';
import { PLATFORMS } from '@shared/platforms';
import {
  sendToBackground,
  type ArchiveExportResponse,
  type ArchiveHit,
  type ArchiveSearchResponse,
} from '@shared/messages';
import { updateSettings, type Settings } from '@shared/settings';
import { downloadText, el, escapeHtml } from '../dom';

/**
 * Universal archive: since adapters can already read a conversation, the
 * extension can index visited chats locally and answer "did I discuss this on
 * ChatGPT or Claude?". Opt-in — nothing is archived until the user says so.
 */
export function renderArchive(settings: Settings, hits: ArchiveHit[]): string {
  const lang: Lang = settings.language;
  return `
    <section>
      <h2>${escapeHtml(t(lang, 'archiveSection'))}</h2>
      <label class="row" style="font-weight:400">
        <input type="checkbox" id="archive-toggle" ${settings.archiveEnabled ? 'checked' : ''} />
        <span>${escapeHtml(t(lang, 'archiveToggle'))}</span>
      </label>
      <div class="field" style="margin-top:8px">
        <input type="search" id="archive-search"
               placeholder="${escapeHtml(t(lang, 'archiveSearchPlaceholder'))}" />
      </div>
      <ul class="archive-list" id="archive-results">${renderHits(lang, hits)}</ul>
    </section>
  `;
}

export function bindArchive(root: ParentNode, settings: Settings, onChanged: () => void): void {
  const lang = settings.language;

  el<HTMLInputElement>(root, '#archive-toggle').addEventListener('change', (event) => {
    void updateSettings({ archiveEnabled: (event.target as HTMLInputElement).checked }).then(
      onChanged,
    );
  });

  const search = el<HTMLInputElement>(root, '#archive-search');
  const results = el<HTMLUListElement>(root, '#archive-results');
  let debounce: ReturnType<typeof setTimeout>;

  search.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      void searchArchive(search.value).then((hits) => {
        results.innerHTML = renderHits(lang, hits);
        bindExports(results, lang);
      });
    }, 250);
  });

  bindExports(results, lang);
}

export async function searchArchive(query: string): Promise<ArchiveHit[]> {
  try {
    return await sendToBackground<ArchiveSearchResponse>({ type: 'archive/search', query });
  } catch {
    return [];
  }
}

function bindExports(root: ParentNode, lang: Lang): void {
  void lang;
  root.querySelectorAll<HTMLButtonElement>('[data-export]').forEach((button) => {
    button.addEventListener('click', () => {
      const format = button.dataset['export'] as 'markdown' | 'json';
      void sendToBackground<ArchiveExportResponse>({
        type: 'archive/export',
        id: button.dataset['id']!,
        format,
      }).then((result) => {
        if (!result) return;
        downloadText(
          result.filename,
          result.content,
          format === 'markdown' ? 'text/markdown' : 'application/json',
        );
      });
    });
  });
}

function renderHits(lang: Lang, hits: ArchiveHit[]): string {
  if (hits.length === 0) return `<li class="muted">${escapeHtml(t(lang, 'archiveEmpty'))}</li>`;
  return hits
    .map(
      (hit) => `
        <li class="archive-item">
          <div class="archive-title">${escapeHtml(hit.title)}</div>
          <div class="archive-snippet">
            ${escapeHtml(PLATFORMS[hit.sourcePlatform].label)} · ${escapeHtml(hit.updatedAt.slice(0, 10))}
            ${hit.snippet ? `— ${escapeHtml(hit.snippet)}` : ''}
          </div>
          <div class="row">
            <button class="link" data-export="markdown" data-id="${hit.id}">
              ${escapeHtml(t(lang, 'archiveExportMd'))}
            </button>
            <button class="link" data-export="json" data-id="${hit.id}">
              ${escapeHtml(t(lang, 'archiveExportJson'))}
            </button>
          </div>
        </li>
      `,
    )
    .join('');
}
