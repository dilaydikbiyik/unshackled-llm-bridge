import type { PlatformAdapter } from '@adapters/types';
import type { PlatformId } from '@shared/platforms';
import { sendToBackground } from '@shared/messages';

/**
 * Fork controller: reads the current conversation through the adapter, cuts
 * it at the chosen message and hands the package to the background worker,
 * which opens the target platform.
 *
 * TODO(phase-1.4): length guard (token estimate → full/trimmed choice) and
 * fork lineage recording into the local store.
 */
export async function forkConversation(
  adapter: PlatformAdapter,
  cutIndex: number,
  targetPlatform: PlatformId,
): Promise<void> {
  const conversation = await adapter.readConversation();
  await sendToBackground({
    type: 'fork/initiate',
    request: { conversation, cutIndex, targetPlatform },
  });
}
