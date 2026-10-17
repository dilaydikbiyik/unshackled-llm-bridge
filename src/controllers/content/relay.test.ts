import { describe, expect, it } from 'vitest';
import { memoryStore } from '@shared/storage';
import { markRelayed, readRelayPoint, readRelayPoints } from './relay';

describe('relay point', () => {
  it('has none until a conversation has been carried somewhere', async () => {
    expect(await readRelayPoint('claude:/chat/x', 'chatgpt', memoryStore())).toBeUndefined();
  });

  it('remembers how far the other side has been told', async () => {
    const store = memoryStore();
    await markRelayed('claude:/chat/x', 'chatgpt', 4, store);
    expect(await readRelayPoint('claude:/chat/x', 'chatgpt', store)).toBe(4);
  });

  it('moves forward as the conversation grows', async () => {
    const store = memoryStore();
    await markRelayed('claude:/chat/x', 'chatgpt', 4, store);
    await markRelayed('claude:/chat/x', 'chatgpt', 9, store);
    expect(await readRelayPoint('claude:/chat/x', 'chatgpt', store)).toBe(9);
  });

  it('never moves backwards, so a fork taken earlier does not re-send old turns', async () => {
    const store = memoryStore();
    await markRelayed('claude:/chat/x', 'chatgpt', 9, store);
    await markRelayed('claude:/chat/x', 'chatgpt', 2, store);
    expect(await readRelayPoint('claude:/chat/x', 'chatgpt', store)).toBe(9);
  });

  it('keeps conversations apart', async () => {
    const store = memoryStore();
    await markRelayed('claude:/chat/x', 'chatgpt', 4, store);
    expect(await readRelayPoint('claude:/chat/y', 'chatgpt', store)).toBeUndefined();
  });
});

/**
 * A relay point is a fact about one pair, not about the conversation.
 *
 * Keyed by conversation alone, a second fork — to a platform that had seen
 * nothing — was offered "only what is new since the last transfer" and would
 * have arrived carrying a few recent turns and no history at all.
 */
describe('relay points are per target', () => {
  it('does not treat one target’s progress as another’s', async () => {
    const store = memoryStore();
    await markRelayed('claude:/chat/x', 'chatgpt', 7, store);

    expect(await readRelayPoint('claude:/chat/x', 'chatgpt', store)).toBe(7);
    expect(await readRelayPoint('claude:/chat/x', 'gemini', store)).toBeUndefined();
  });

  it('tracks each pair separately as the conversation grows', async () => {
    const store = memoryStore();
    await markRelayed('claude:/chat/x', 'chatgpt', 7, store);
    await markRelayed('claude:/chat/x', 'gemini', 2, store);
    await markRelayed('claude:/chat/x', 'chatgpt', 11, store);

    const points = await readRelayPoints('claude:/chat/x', ['chatgpt', 'gemini', 'claude'], store);
    expect(points.get('chatgpt')).toBe(11);
    expect(points.get('gemini')).toBe(2);
    expect(points.has('claude')).toBe(false);
  });

  it('reports nothing for a conversation never carried anywhere', async () => {
    const points = await readRelayPoints('claude:/chat/new', ['chatgpt'], memoryStore());
    expect(points.size).toBe(0);
  });
});
