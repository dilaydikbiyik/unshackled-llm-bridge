import { createAdapter } from '@adapters/registry';
import type { PlatformAdapter } from '@adapters/types';
import { loadSelectorConfig } from '@models/config/selector-config';
import { wrapForTarget } from '@models/wrap/templates';
import { detectPlatform } from '@shared/platforms';
import { sendToBackground, type PendingForkResponse } from '@shared/messages';
import { mountForkButtons } from '@views/content/fork-button';

/**
 * Content-script entry: detect the platform, wire adapter ⟷ background,
 * claim any pending fork package targeted at this platform.
 */
async function main(): Promise<void> {
  const platform = detectPlatform(location.hostname);
  if (!platform) return;

  const config = await loadSelectorConfig();
  const adapter = createAdapter(platform, config);
  if (!adapter) return;

  await reportHealth(adapter);
  await claimPendingFork(adapter);
  mountForkButtons(adapter);
}

async function reportHealth(adapter: PlatformAdapter): Promise<void> {
  const health = await adapter.healthCheck();
  await sendToBackground({ type: 'adapter/health-report', health });
}

async function claimPendingFork(adapter: PlatformAdapter): Promise<void> {
  const pending = await sendToBackground<PendingForkResponse>({
    type: 'fork/pending-check',
    platform: adapter.platform,
  });
  if (!pending) return;

  await waitUntilReady(adapter);
  const packageText = wrapForTarget(pending.conversation, pending.cutIndex, adapter.platform);
  try {
    // Injection fills the composer only; sending stays a user action.
    await adapter.injectText(packageText);
  } catch (err) {
    // TODO(phase-1.7): clipboard fallback + user-visible notice instead of console.
    console.warn('[bridge] fork injection failed, package lost to composer:', err);
  }
}

async function waitUntilReady(adapter: PlatformAdapter, timeoutMs = 15_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await adapter.isReady()) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`${adapter.platform}: not ready within ${timeoutMs}ms`);
}

void main();
