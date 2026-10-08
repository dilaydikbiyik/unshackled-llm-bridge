import { chromeStore, type KeyValueStore } from '@shared/storage';

/**
 * How far this conversation has already been carried to the other side.
 *
 * A single hand-off is a migration; a relay is a working relationship. Once two
 * conversations have been linked, each new transfer should carry only what the
 * other side has missed — otherwise every leg re-sends the whole history, and
 * the pair becomes unusable after a few exchanges.
 *
 * No provider can offer this: it needs a client standing between two accounts
 * it does not own, remembering what each has already been told.
 */
export const relayKey = (conversationKey: string): string => `relay:${conversationKey}`;

export async function readRelayPoint(
  conversationKey: string,
  store: KeyValueStore = chromeStore('local'),
): Promise<number | undefined> {
  return store.get<number>(relayKey(conversationKey));
}

/**
 * Records how far this conversation has been carried. Never moves backwards: a
 * fork taken at an earlier message must not make the relay re-send turns the
 * other side already has.
 */
export async function markRelayed(
  conversationKey: string,
  throughIndex: number,
  store: KeyValueStore = chromeStore('local'),
): Promise<void> {
  const current = await readRelayPoint(conversationKey, store);
  if (current !== undefined && current >= throughIndex) return;
  await store.set(relayKey(conversationKey), throughIndex);
}
