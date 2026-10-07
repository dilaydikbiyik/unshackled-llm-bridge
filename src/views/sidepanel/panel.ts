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
import { bindSites, renderSites, type SitesPorts } from './sections/sites';
import { bindStatus, fetchHealths, renderStatus } from './sections/status';

type Watch = (onChange: () => void) => () => void;

const watchComparisons: Watch = (onChange) => watchChromeKey('local', COMPARISONS_KEY, onChange);
let stopWatching: (() => void) | null = null;

/**
 * Side panel shell. Each section owns a render/bind pair; this file gathers
 * state and re-renders when something changes.
 */
/** Chrome's permission and tab APIs, injected so the panel is testable. */
const chromePorts: SitesPorts = {
  currentHost: async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    try {
      return tab?.url ? new URL(tab.url).hostname : null;
    } catch {
      return null;
    }
  },
  requestOrigin: (pattern) => chrome.permissions.request({ origins: [pattern] }),
  removeOrigin: (pattern) => chrome.permissions.remove({ origins: [pattern] }),
};

export async function renderPanel(
  root: HTMLElement,
  watch: Watch = watchComparisons,
  ports: SitesPorts = chromePorts,
): Promise<void> {
  const settings = await getSettings();
  const lang = settings.language;

  const [healths, comparisons, archiveHits] = await Promise.all([
    fetchHealths(),
    loadComparisons(),
    settings.archiveEnabled ? searchArchive('') : Promise.resolve([]),
  ]);

  const rerender = () => void renderPanel(root, watch, ports);

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
      ${renderSites(settings)}
      ${renderArchive(settings, archiveHits)}
      ${renderSettings(settings)}
    `,
  );

  bindOnboarding(root, rerender);
  bindStatus(root, lang, healths);
  bindCompare(root, rerender);
  bindPersona(root, settings, rerender);
  bindSites(root, settings, ports, rerender);
  bindArchive(root, settings, rerender);
  bindSettings(root, settings, rerender);
}

/** Test seam: forget the subscription so a fresh panel subscribes again. */
export function resetPanelSubscription(): void {
  stopWatching?.();
  stopWatching = null;
}
