import { t, type Lang } from '@shared/i18n';
import { SUMMARY_MODELS, updateSettings, type Settings } from '@shared/settings';
import { el, escapeHtml, flash } from '../dom';

/**
 * Language, and the opt-in API key that unlocks summarize-on-fork. The key is
 * stored in chrome.storage.local only — never synced, never sent anywhere but
 * api.anthropic.com from this browser.
 */
export function renderSettings(settings: Settings): string {
  const lang: Lang = settings.language;
  return `
    <section>
      <h2>${escapeHtml(t(lang, 'settingsSection'))}</h2>
      <div class="field">
        <label for="settings-lang">${escapeHtml(t(lang, 'settingsLanguage'))}</label>
        <select id="settings-lang">
          <option value="tr" ${lang === 'tr' ? 'selected' : ''}>Türkçe</option>
          <option value="en" ${lang === 'en' ? 'selected' : ''}>English</option>
        </select>
      </div>
      <div class="field">
        <label for="settings-key">${escapeHtml(t(lang, 'settingsApiKey'))}</label>
        <input type="password" id="settings-key" autocomplete="off"
               value="${escapeHtml(settings.anthropicApiKey)}" placeholder="sk-ant-…" />
        <p class="hint" style="margin-top:4px">${escapeHtml(t(lang, 'settingsApiKeyHint'))}</p>
      </div>
      <div class="field">
        <label for="settings-model">${escapeHtml(t(lang, 'settingsModel'))}</label>
        <select id="settings-model">
          ${SUMMARY_MODELS.map(
            (model) =>
              `<option value="${model}" ${model === settings.summaryModel ? 'selected' : ''}>
                 ${escapeHtml(model)}
               </option>`,
          ).join('')}
        </select>
      </div>
      <div class="row end">
        <button class="primary" id="settings-save">${escapeHtml(t(lang, 'settingsSave'))}</button>
      </div>
    </section>
  `;
}

export function bindSettings(root: ParentNode, settings: Settings, onChanged: () => void): void {
  const button = el<HTMLButtonElement>(root, '#settings-save');
  button.addEventListener('click', () => {
    void updateSettings({
      language: el<HTMLSelectElement>(root, '#settings-lang').value as Lang,
      anthropicApiKey: el<HTMLInputElement>(root, '#settings-key').value.trim(),
      summaryModel: el<HTMLSelectElement>(root, '#settings-model').value,
    }).then(() => {
      flash(button, t(settings.language, 'settingsSaved'));
      onChanged();
    });
  });
}
