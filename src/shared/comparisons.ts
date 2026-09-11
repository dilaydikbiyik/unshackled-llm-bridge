import type { ComparisonState } from './messages';
import type { KeyValueStore } from './storage';

/** Written by the service worker, read by the side panel — one key, defined once. */
export const COMPARISONS_KEY = 'comparisons';

/** The log is bounded: a side panel has no use for the hundredth comparison. */
export const COMPARISON_LOG_LIMIT = 20;

export async function readComparisons(store: KeyValueStore): Promise<ComparisonState[]> {
  return (await store.get<ComparisonState[]>(COMPARISONS_KEY)) ?? [];
}

export async function writeComparisons(
  store: KeyValueStore,
  comparisons: ComparisonState[],
): Promise<void> {
  await store.set(COMPARISONS_KEY, comparisons.slice(0, COMPARISON_LOG_LIMIT));
}
