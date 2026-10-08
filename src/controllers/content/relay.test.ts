import { describe, expect, it } from 'vitest';
import { memoryStore } from '@shared/storage';
import { markRelayed, readRelayPoint } from './relay';

describe('relay point', () => {
  it('has none until a conversation has been carried somewhere', async () => {
    expect(await readRelayPoint('claude:/chat/x', memoryStore())).toBeUndefined();
  });

  it('remembers how far the other side has been told', async () => {
    const store = memoryStore();
    await markRelayed('claude:/chat/x', 4, store);
    expect(await readRelayPoint('claude:/chat/x', store)).toBe(4);
  });

  it('moves forward as the conversation grows', async () => {
    const store = memoryStore();
    await markRelayed('claude:/chat/x', 4, store);
    await markRelayed('claude:/chat/x', 9, store);
    expect(await readRelayPoint('claude:/chat/x', store)).toBe(9);
  });

  it('never moves backwards, so a fork taken earlier does not re-send old turns', async () => {
    const store = memoryStore();
    await markRelayed('claude:/chat/x', 9, store);
    await markRelayed('claude:/chat/x', 2, store);
    expect(await readRelayPoint('claude:/chat/x', store)).toBe(9);
  });

  it('keeps conversations apart', async () => {
    const store = memoryStore();
    await markRelayed('claude:/chat/x', 4, store);
    expect(await readRelayPoint('claude:/chat/y', store)).toBeUndefined();
  });
});
