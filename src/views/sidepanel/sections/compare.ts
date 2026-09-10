import { t, type Lang } from '@shared/i18n';
import { PLATFORMS, type PlatformId } from '@shared/platforms';
import { sendToBackground, type ComparisonState } from '@shared/messages';
import { el, escapeHtml } from '../dom';

const COMPARISONS_KEY = 'comparisons';

/**
 * Parallel comparison: compose once, inject into several platforms, read the
 * answers side by side. Injection is still per-tab and the user still presses
 * send — nothing is dispatched on our own initiative.
 */
export function renderCompare(lang: Lang, comparisons: ComparisonState[]): string {
  const platforms = Object.keys(PLATFORMS) as PlatformId[];
  return `
    <section>
      <h2>${escapeHtml(t(lang, 'compareSection'))}</h2>
      <p class="hint">${escapeHtml(t(lang, 'compareHint'))}</p>
      <div class="field">
        <textarea id="compare-text" placeholder="${escapeHtml(t(lang, 'comparePlaceholder'))}"></textarea>
      </div>
      <div class="compare-targets">
        ${platforms
          .map(
            (p) =>
              `<label><input type="checkbox" class="compare-target" value="${p}" checked />
               ${escapeHtml(PLATFORMS[p].label)}</label>`,
          )
          .join('')}
      </div>
      <div class="row end">
        <button class="primary" id="compare-send">${escapeHtml(t(lang, 'compareSend'))}</button>
      </div>
      <div id="compare-results">
        ${
          comparisons.length === 0
            ? `<p class="muted">${escapeHtml(t(lang, 'compareEmpty'))}</p>`
            : comparisons.map((c) => card(lang, c)).join('')
        }
      </div>
    </section>
  `;
}

export function bindCompare(root: ParentNode, lang: Lang, onChanged: () => void): void {
  el<HTMLButtonElement>(root, '#compare-send').addEventListener('click', () => {
    const text = el<HTMLTextAreaElement>(root, '#compare-text').value.trim();
    const targets = [...root.querySelectorAll<HTMLInputElement>('.compare-target')]
      .filter((box) => box.checked)
      .map((box) => box.value as PlatformId);
    if (!text || targets.length === 0) return;
    void sendToBackground({ type: 'compare/start', text, targets }).then(onChanged);
  });

  // Responses arrive asynchronously as the user sends each tab's prompt.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && COMPARISONS_KEY in changes) onChanged();
  });
}

export async function loadComparisons(): Promise<ComparisonState[]> {
  const stored = await chrome.storage.local.get(COMPARISONS_KEY);
  return ((stored[COMPARISONS_KEY] as ComparisonState[] | undefined) ?? []).slice(0, 3);
}

function card(lang: Lang, comparison: ComparisonState): string {
  return `
    <div class="compare-card">
      <div class="compare-prompt">${escapeHtml(truncate(comparison.text, 120))}</div>
      <div class="compare-answers">
        ${comparison.targets
          .map((platform) => {
            const answer = comparison.responses[platform];
            return `
              <div class="compare-answer">
                <h3>${escapeHtml(PLATFORMS[platform].label)}</h3>
                <p>${
                  answer
                    ? escapeHtml(truncate(answer.content, 900))
                    : `<span class="muted">${escapeHtml(t(lang, 'compareWaiting'))}</span>`
                }</p>
              </div>
            `;
          })
          .join('')}
      </div>
    </div>
  `;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
