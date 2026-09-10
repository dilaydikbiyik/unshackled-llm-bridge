import { t, type Lang } from '@shared/i18n';
import { updateSettings, type Settings } from '@shared/settings';
import { el, escapeHtml } from '../dom';

/** First-run explainer: what it does, the privacy promise, how to fork. */
export function renderOnboarding(settings: Settings, onDismiss: () => void): string {
  if (settings.onboardingDone) return '';
  const lang: Lang = settings.language;
  void onDismiss;
  return `
    <div class="onboard" id="onboard">
      <strong>${escapeHtml(t(lang, 'onboardTitle'))}</strong>
      <ol>
        <li>${escapeHtml(t(lang, 'onboardStep1'))}</li>
        <li>${escapeHtml(t(lang, 'onboardStep2'))}</li>
        <li>${escapeHtml(t(lang, 'onboardStep3'))}</li>
      </ol>
      <button id="onboard-dismiss">${escapeHtml(t(lang, 'onboardDismiss'))}</button>
    </div>
  `;
}

export function bindOnboarding(root: ParentNode, onDone: () => void): void {
  const button = root.querySelector<HTMLButtonElement>('#onboard-dismiss');
  if (!button) return;
  button.addEventListener('click', () => {
    void updateSettings({ onboardingDone: true }).then(() => {
      el(root, '#onboard').remove();
      onDone();
    });
  });
}
