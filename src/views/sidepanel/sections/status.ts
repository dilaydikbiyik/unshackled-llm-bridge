import type { AdapterHealth } from '@shared/health';
import { t, type Lang } from '@shared/i18n';
import { PLATFORMS, type PlatformId } from '@domain/platforms';
import { sendToBackground, type HealthListResponse } from '@shared/messages';
import { escapeHtml, flash } from '../dom';

/**
 * Platform support status plus the local-only diagnostics report. There is no
 * auto-telemetry — the user copies the report into a GitHub issue if they want
 * a broken selector fixed.
 */
export function renderStatus(lang: Lang, healths: AdapterHealth[]): string {
  const byPlatform = new Map(healths.map((h) => [h.platform, h]));
  return `
    <section>
      <h2>${escapeHtml(t(lang, 'statusSection'))}</h2>
      <ul class="platform-list">
        ${(Object.keys(PLATFORMS) as PlatformId[])
          .map((p) => row(lang, p, byPlatform.get(p)))
          .join('')}
      </ul>
      <button id="diag-copy" class="link">${escapeHtml(t(lang, 'diagCopy'))}</button>
    </section>
  `;
}

export function bindStatus(root: ParentNode, lang: Lang, healths: AdapterHealth[]): void {
  const button = root.querySelector<HTMLButtonElement>('#diag-copy');
  button?.addEventListener('click', () => {
    void navigator.clipboard.writeText(diagnosticsReport(healths)).then(() => {
      flash(button, t(lang, 'diagCopied'));
    });
  });
}

export async function fetchHealths(): Promise<AdapterHealth[]> {
  try {
    return await sendToBackground<HealthListResponse>({ type: 'health/list-request' });
  } catch {
    return [];
  }
}

function row(lang: Lang, platform: PlatformId, health: AdapterHealth | undefined): string {
  const label = PLATFORMS[platform].label;
  if (!health) return item('unknown', label, t(lang, 'statusNoTab'));
  return health.ok
    ? item('ok', label, t(lang, 'statusReady'))
    : item('degraded', label, `${t(lang, 'statusDegraded')}: ${health.brokenSelectors.join(', ')}`);
}

function item(status: 'ok' | 'degraded' | 'unknown', label: string, detail: string): string {
  return `
    <li class="platform-item">
      <span class="status-dot ${status}"></span>
      <span class="platform-label">${escapeHtml(label)}</span>
      <span class="platform-detail">${escapeHtml(detail)}</span>
    </li>
  `;
}

/** Plain text the user can paste into a bug report — no data, only selector state. */
function diagnosticsReport(healths: AdapterHealth[]): string {
  const version = chrome.runtime.getManifest().version;
  const lines = [
    `Unshackled LLM Bridge — diagnostics`,
    `Extension version: ${version}`,
    `User agent: ${navigator.userAgent}`,
    `Generated: ${new Date().toISOString()}`,
    '',
    'Adapter health:',
  ];
  if (healths.length === 0) lines.push('  (no platform tab reported in this session)');
  for (const health of healths) {
    lines.push(
      `  ${health.platform}: ${health.ok ? 'ok' : `broken selectors → ${health.brokenSelectors.join(', ')}`} (checked ${health.checkedAt})`,
    );
  }
  lines.push('', 'No conversation content is included in this report.');
  return lines.join('\n');
}
