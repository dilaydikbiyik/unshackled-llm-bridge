import type { AdapterHealth } from '@adapters/types';
import { PLATFORMS, type PlatformId } from '@shared/platforms';
import { sendToBackground, type HealthListResponse } from '@shared/messages';

/**
 * Side panel view (v1): platform support status. Fork target picker and
 * transfer preview land in phase 1.6. Turkish-first copy; i18n scaffolding
 * (tr/en message catalogs) also lands in 1.6.
 */
export async function renderPanel(root: HTMLElement): Promise<void> {
  const healths = await fetchHealths();
  const byPlatform = new Map(healths.map((h) => [h.platform, h]));

  root.innerHTML = `
    <h1>Unshackled LLM Bridge</h1>
    <p class="privacy-note">Verilerin hiçbir sunucuya gitmez — her şey bu tarayıcıda kalır.</p>
    <ul class="platform-list">
      ${(Object.keys(PLATFORMS) as PlatformId[]).map((p) => platformRow(p, byPlatform.get(p))).join('')}
    </ul>
  `;
}

async function fetchHealths(): Promise<HealthListResponse> {
  try {
    return await sendToBackground<HealthListResponse>({ type: 'health/list-request' });
  } catch {
    return [];
  }
}

function platformRow(platform: PlatformId, health: AdapterHealth | undefined): string {
  const label = PLATFORMS[platform].label;
  if (platform === 'gemini') {
    return row('unknown', label, 'yakında');
  }
  if (!health) {
    return row('unknown', label, 'sekme açık değil');
  }
  return health.ok
    ? row('ok', label, 'hazır')
    : row('degraded', label, `sorunlu: ${health.brokenSelectors.join(', ')}`);
}

function row(status: 'ok' | 'degraded' | 'unknown', label: string, detail: string): string {
  return `
    <li class="platform-item">
      <span class="status-dot ${status}"></span>
      <span class="platform-label">${label}</span>
      <span class="platform-detail">${detail}</span>
    </li>
  `;
}
