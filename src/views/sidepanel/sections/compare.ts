import { contrastAnswers, type ComparisonContrast } from '@domain/compare/contrast';
import { knownPlatforms, platformLabel, type PlatformId } from '@domain/platforms';
import { readComparisons } from '@shared/comparisons';
import { t, type Lang } from '@shared/i18n';
import { sendToBackground, type ComparisonState } from '@shared/messages';
import { chromeStore, type KeyValueStore } from '@shared/storage';
import { html, type SafeHtml } from '@views/html';
import { el } from '../dom';

/** The panel shows the newest few; the service worker keeps the bounded log. */
const SHOWN = 3;

/**
 * Parallel comparison: compose once, inject into several platforms, read the
 * answers side by side. Injection is still per-tab and the user still presses
 * send — nothing is dispatched on the extension's own initiative.
 */
export function renderCompare(lang: Lang, comparisons: ComparisonState[]): SafeHtml {
  return html`
    <section>
      <h2>${t(lang, 'compareSection')}</h2>
      <p class="hint">${t(lang, 'compareHint')}</p>
      <div class="field">
        <textarea id="compare-text" placeholder="${t(lang, 'comparePlaceholder')}"></textarea>
      </div>
      <div class="compare-targets">
        ${knownPlatforms().map(
          (site) => html`<label>
            <input type="checkbox" class="compare-target" value="${site.id}" checked />
            ${platformLabel(site.id)}
          </label>`,
        )}
      </div>
      <div class="row end">
        <button class="primary" id="compare-send">${t(lang, 'compareSend')}</button>
      </div>
      <div id="compare-results">
        ${comparisons.length === 0
          ? html`<p class="muted">${t(lang, 'compareEmpty')}</p>`
          : comparisons.map((c) => card(lang, c))}
      </div>
    </section>
  `;
}

export function bindCompare(root: ParentNode, onStarted: () => void): void {
  el<HTMLButtonElement>(root, '#compare-send').addEventListener('click', () => {
    const text = el<HTMLTextAreaElement>(root, '#compare-text').value.trim();
    const targets = [...root.querySelectorAll<HTMLInputElement>('.compare-target')]
      .filter((box) => box.checked)
      .map((box) => box.value as PlatformId);
    if (!text || targets.length === 0) return;
    void sendToBackground({ type: 'compare/start', text, targets }).then(onStarted);
  });
}

export async function loadComparisons(
  store: KeyValueStore = chromeStore('local'),
): Promise<ComparisonState[]> {
  return (await readComparisons(store)).slice(0, SHOWN);
}

function card(lang: Lang, comparison: ComparisonState): SafeHtml {
  const contrast = contrastAnswers(
    comparison.targets.map((platform) => ({
      platform,
      content: comparison.responses[platform]?.content ?? '',
    })),
  );
  const uniqueBy = new Map(contrast.contrasts.map((entry) => [entry.platform, entry.unique]));

  return html`
    <div class="compare-card">
      <div class="compare-prompt">${truncate(comparison.text, 120)}</div>
      ${renderContrast(lang, contrast)}
      <div class="compare-answers">
        ${comparison.targets.map((platform) => {
          const answer = comparison.responses[platform];
          const unique = uniqueBy.get(platform) ?? [];
          return html`
            <div class="compare-answer">
              <h3>${platformLabel(platform)}</h3>
              <p>
                ${answer
                  ? truncate(answer.content, 900)
                  : html`<span class="muted">${t(lang, 'compareWaiting')}</span>`}
              </p>
              ${unique.length > 0 &&
              html`<div class="compare-unique">
                <span class="muted">${t(lang, 'compareOnlyHere')}</span>
                <ul>
                  ${unique.slice(0, 3).map((point) => html`<li>${truncate(point, 180)}</li>`)}
                </ul>
              </div>`}
            </div>
          `;
        })}
      </div>
    </div>
  `;
}

/**
 * The reason to ask three assistants at once is not three answers; it is
 * knowing where they disagree, because that is where one of them is wrong.
 */
function renderContrast(lang: Lang, contrast: ComparisonContrast): SafeHtml {
  if (contrast.contrasts.length < 2) return html``;
  const percent = Math.round(contrast.agreement * 100);
  return html`
    <div class="compare-contrast">
      <span class="muted">
        ${t(lang, 'compareAgreement').replace('{percent}', String(percent))}
      </span>
      ${contrast.agreed.length > 0 &&
      html`<ul>
        ${contrast.agreed.slice(0, 3).map((point) => html`<li>${truncate(point, 180)}</li>`)}
      </ul>`}
    </div>
  `;
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
