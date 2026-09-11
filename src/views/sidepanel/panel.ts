import { COMPARISONS_KEY } from '@shared/comparisons';
import { t } from '@shared/i18n';
import { getSettings } from '@shared/settings';
import { watchChromeKey } from '@shared/storage';
import { html, setHtml } from '@views/html';
import { bindArchive, renderArchive, searchArchive } from './sections/archive';
import { bindCompare, loadComparisons, renderCompare } from './sections/compare';
import { bindOnboarding, renderOnboarding } from './sections/onboarding';
import { bindPersona, renderPersona } from './sections/persona';
import { bindSettings, renderSettings } from './sections/settings';
import { bindStatus, fetchHealths, renderStatus } from './sections/status';

type Watch = (onChange: () => void) => () => void;

const watchComparisons: Watch = (onChange) => watchChromeKey('local', COMPARISONS_KEY, onChange);
let stopWatching: (() => void) | null = null;

/**
 * Side panel shell. Each section owns a render/bind pair; this file gathers
 * state and re-renders when something changes.
 */
export async function renderPanel(root: HTMLElement, watch: Watch = watchComparisons): Promise<void> {
  const settings = await getSettings();
  const lang = settings.language;

  const [healths, comparisons, archiveHits] = await Promise.all([
    fetchHealths(),
    loadComparisons(),
    settings.archiveEnabled ? searchArchive('') : Promise.resolve([]),
  ]);

  const rerender = () => void renderPanel(root, watch);

  // Comparison answers arrive while the user sends each tab. Subscribed once:
  // subscribing on every render stacked listeners, and each change then
  // re-rendered the panel once per render that had ever happened.
  stopWatching ??= watch(rerender);

  setHtml(
    root,
    html`
      <h1>${t(lang, 'appTitle')}</h1>
      <p class="privacy-note">${t(lang, 'privacyNote')}</p>
      ${renderOnboarding(settings)}
      ${renderStatus(lang, healths)}
      ${renderCompare(lang, comparisons)}
      ${renderPersona(settings)}
      ${renderArchive(settings, archiveHits)}
      ${renderSettings(settings)}
    `,
  );

  bindOnboarding(root, rerender);
  bindStatus(root, lang, healths);
  bindCompare(root, rerender);
  bindPersona(root, settings, rerender);
  bindArchive(root, settings, rerender);
  bindSettings(root, settings, rerender);
}

/** Test seam: forget the subscription so a fresh panel subscribes again. */
export function resetPanelSubscription(): void {
  stopWatching?.();
  stopWatching = null;
}
