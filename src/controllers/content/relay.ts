import type { PlatformId } from '@domain/platforms';
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
/**
 * Keyed by conversation *and* target. A relay point is a fact about one pair:
 * how much this conversation has told that assistant. Keyed by conversation
 * alone, a second fork — to a platform that has seen nothing — would have been
 * offered "only what is new", and would have arrived with no history at all.
 */
export const relayKey = (conversationKey: string, target: PlatformId): string =>
  `relay:${conversationKey}:${target}`;

export async function readRelayPoint(
  conversationKey: string,
  target: PlatformId,
  store: KeyValueStore = chromeStore('local'),
): Promise<number | undefined> {
  return store.get<number>(relayKey(conversationKey, target));
}

/** Every target this conversation has been carried to, and how far. */
export async function readRelayPoints(
  conversationKey: string,
  targets: readonly PlatformId[],
  store: KeyValueStore = chromeStore('local'),
): Promise<Map<PlatformId, number>> {
  const points = new Map<PlatformId, number>();
  for (const target of targets) {
    const point = await readRelayPoint(conversationKey, target, store);
    if (point !== undefined) points.set(target, point);
  }
  return points;
}

/**
 * Records how far this conversation has been carried. Never moves backwards: a
 * fork taken at an earlier message must not make the relay re-send turns the
 * other side already has.
 */
export async function markRelayed(
  conversationKey: string,
  target: PlatformId,
  throughIndex: number,
  store: KeyValueStore = chromeStore('local'),
): Promise<void> {
  const current = await readRelayPoint(conversationKey, target, store);
  if (current !== undefined && current >= throughIndex) return;
  await store.set(relayKey(conversationKey, target), throughIndex);
}
