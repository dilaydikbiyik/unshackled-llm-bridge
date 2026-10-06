import { knownPlatforms, platformLabel, type PlatformId } from '@domain/platforms';
import type { AdapterHealth } from '@shared/health';
import { t, type Lang } from '@shared/i18n';
import { sendToBackground } from '@shared/messages';
import { html, type SafeHtml } from '@views/html';
import { flash } from '../dom';

/**
 * Platform support status plus the local-only diagnostics report. There is no
 * auto-telemetry — the user copies the report into a GitHub issue if they want
 * a broken selector fixed.
 */
export function renderStatus(lang: Lang, healths: AdapterHealth[]): SafeHtml {
  const byPlatform = new Map(healths.map((h) => [h.platform, h]));
  return html`
    <section>
      <h2>${t(lang, 'statusSection')}</h2>
      <ul class="platform-list">
        ${knownPlatforms().map((site) => row(lang, site.id, byPlatform.get(site.id)))}
      </ul>
      <button id="diag-copy" class="link">${t(lang, 'diagCopy')}</button>
    </section>
  `;
}

export function bindStatus(
  root: ParentNode,
  lang: Lang,
  healths: AdapterHealth[],
  version: string = chrome.runtime.getManifest().version,
): void {
  const button = root.querySelector<HTMLButtonElement>('#diag-copy');
  button?.addEventListener('click', () => {
    const report = diagnosticsReport(healths, version, navigator.userAgent);
    void navigator.clipboard.writeText(report).then(() => flash(button, t(lang, 'diagCopied')));
  });
}

export async function fetchHealths(): Promise<AdapterHealth[]> {
  try {
    return await sendToBackground({ type: 'health/list-request' });
  } catch {
    return [];
  }
}

function row(lang: Lang, platform: PlatformId, health: AdapterHealth | undefined): SafeHtml {
  const label = platformLabel(platform);
  if (!health) return item('unknown', label, t(lang, 'statusNoTab'));
  return health.ok
    ? item('ok', label, t(lang, 'statusReady'))
    : item('degraded', label, `${t(lang, 'statusDegraded')}: ${health.brokenSelectors.join(', ')}`);
}

function item(status: 'ok' | 'degraded' | 'unknown', label: string, detail: string): SafeHtml {
  return html`
    <li class="platform-item">
      <span class="status-dot ${status}"></span>
      <span class="platform-label">${label}</span>
      <span class="platform-detail">${detail}</span>
    </li>
  `;
}

/** Plain text for a bug report: selector state only, never conversation content. */
export function diagnosticsReport(
  healths: AdapterHealth[],
  version: string,
  userAgent: string,
  generatedAt: Date = new Date(),
): string {
  const lines = [
    'Unshackled LLM Bridge — diagnostics',
    `Extension version: ${version}`,
    `User agent: ${userAgent}`,
    `Generated: ${generatedAt.toISOString()}`,
    '',
    'Adapter health:',
  ];
  if (healths.length === 0) lines.push('  (no platform tab reported in this session)');
  for (const health of healths) {
    const state = health.ok ? 'ok' : `broken → ${health.brokenSelectors.join(', ')}`;
    lines.push(`  ${health.platform}: ${state} (checked ${health.checkedAt})`);
  }
  lines.push('', 'No conversation content is included in this report.');
  return lines.join('\n');
}
