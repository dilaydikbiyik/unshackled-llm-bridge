import { t, type Lang } from '@shared/i18n';
import { updateSettings, type Settings } from '@shared/settings';
import { html, type SafeHtml } from '@views/html';
import { el } from '../dom';

/** First-run explainer: what it does, the privacy promise, how to fork. */
export function renderOnboarding(settings: Settings): SafeHtml {
  if (settings.onboardingDone) return html``;
  const lang: Lang = settings.language;
  return html`
    <div class="onboard" id="onboard">
      <strong>${t(lang, 'onboardTitle')}</strong>
      <ol>
        <li>${t(lang, 'onboardStep1')}</li>
        <li>${t(lang, 'onboardStep2')}</li>
        <li>${t(lang, 'onboardStep3')}</li>
      </ol>
      <button id="onboard-dismiss">${t(lang, 'onboardDismiss')}</button>
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
