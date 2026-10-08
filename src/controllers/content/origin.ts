import type { PlatformId } from '@domain/platforms';
import type { ForkLineage } from '@shared/messages';
import { chromeStore, type KeyValueStore } from '@shared/storage';

/**
 * Where this conversation came from.
 *
 * A platform's own "import from another assistant" can only bring context in —
 * it exists to move people onto that platform, so it will never carry an answer
 * back out. A client that belongs to no provider can: it remembers that this
 * chat began as a fork of that one, and can return to it by address.
 *
 * That makes two assistants usable as a pair — ask here, check there, bring the
 * answer home — which is the part no provider is in a position to build.
 */
export interface ConversationOrigin {
  platform: PlatformId;
  url: string;
  /** The message the fork was taken at, so the return trip can say so. */
  cutIndex: number;
}

export const originKey = (conversationKey: string): string => `origin:${conversationKey}`;

let pending: ConversationOrigin | null = null;

/** Called on the target when a forked package is claimed, before it has a URL. */
export function rememberOrigin(lineage: ForkLineage | undefined): void {
  if (!lineage?.sourceUrl) return;
  pending = {
    platform: lineage.sourcePlatform,
    url: lineage.sourceUrl,
    cutIndex: lineage.cutIndex,
  };
}

/**
 * Binds the remembered origin to the conversation the platform has now created.
 * Called once the page has a conversation key — on a new chat that only happens
 * after the first message is sent.
 */
export async function bindOrigin(
  conversationKey: string,
  store: KeyValueStore = chromeStore('local'),
): Promise<void> {
  if (!pending) return;
  const key = originKey(conversationKey);
  if ((await store.get<ConversationOrigin>(key)) !== undefined) return;
  await store.set(key, pending);
}

/** The origin of the conversation on this page, if it has one. */
export async function readOrigin(
  conversationKey: string,
  store: KeyValueStore = chromeStore('local'),
): Promise<ConversationOrigin | null> {
  // The in-memory one wins: on a new chat the package has landed but the
  // platform has not assigned a conversation id yet, so nothing is stored.
  return pending ?? (await store.get<ConversationOrigin>(originKey(conversationKey))) ?? null;
}

/** Test seam: the module-level memory is per page in the browser. */
export function resetOriginMemory(): void {
  pending = null;
}
