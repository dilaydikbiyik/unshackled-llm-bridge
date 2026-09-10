import { t } from '@shared/i18n';
import { getSettings } from '@shared/settings';
import { escapeHtml } from './dom';
import { bindArchive, renderArchive, searchArchive } from './sections/archive';
import { bindCompare, loadComparisons, renderCompare } from './sections/compare';
import { bindOnboarding, renderOnboarding } from './sections/onboarding';
import { bindPersona, renderPersona } from './sections/persona';
import { bindSettings, renderSettings } from './sections/settings';
import { bindStatus, fetchHealths, renderStatus } from './sections/status';

/**
 * Side panel shell. Each section owns its own render/bind pair; this file only
 * gathers state and re-renders when something changes.
 */
export async function renderPanel(root: HTMLElement): Promise<void> {
  const settings = await getSettings();
  const lang = settings.language;

  const [healths, comparisons, archiveHits] = await Promise.all([
    fetchHealths(),
    loadComparisons(),
    settings.archiveEnabled ? searchArchive('') : Promise.resolve([]),
  ]);

  const rerender = () => void renderPanel(root);

  root.innerHTML = `
    <h1>${escapeHtml(t(lang, 'appTitle'))}</h1>
    <p class="privacy-note">${escapeHtml(t(lang, 'privacyNote'))}</p>
    ${renderOnboarding(settings, rerender)}
    ${renderStatus(lang, healths)}
    ${renderCompare(lang, comparisons)}
    ${renderPersona(settings)}
    ${renderArchive(settings, archiveHits)}
    ${renderSettings(settings)}
  `;

  bindOnboarding(root, rerender);
  bindStatus(root, lang, healths);
  bindCompare(root, lang, rerender);
  bindPersona(root, settings, rerender);
  bindArchive(root, settings, rerender);
  bindSettings(root, settings, rerender);
}
