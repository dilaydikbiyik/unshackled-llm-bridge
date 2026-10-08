import { beforeEach, describe, expect, it } from 'vitest';
import { memoryStore } from '@shared/storage';
import { bindOrigin, originKey, readOrigin, rememberOrigin, resetOriginMemory } from './origin';

const lineage = {
  sourceConversationId: 'gemini-abc',
  sourcePlatform: 'gemini' as const,
  cutIndex: 3,
  sourceUrl: 'https://gemini.google.com/app/abc',
};

beforeEach(() => {
  resetOriginMemory();
});

describe('conversation origin', () => {
  it('remembers where a claimed package came from, before the chat has a URL', async () => {
    const store = memoryStore();
    rememberOrigin(lineage);

    // A brand-new chat has no conversation id yet; the origin is still known.
    expect(await readOrigin('claude:/new', store)).toEqual({
      platform: 'gemini',
      url: 'https://gemini.google.com/app/abc',
      cutIndex: 3,
    });
  });

  it('binds the origin to the conversation once the platform creates one', async () => {
    const store = memoryStore();
    rememberOrigin(lineage);
    await bindOrigin('claude:/chat/xyz', store);

    resetOriginMemory();
    expect(await readOrigin('claude:/chat/xyz', store)).toMatchObject({ platform: 'gemini' });
  });

  it('survives a reload, which is when a return trip usually happens', async () => {
    const store = memoryStore();
    rememberOrigin(lineage);
    await bindOrigin('claude:/chat/xyz', store);
    resetOriginMemory();

    expect(await store.get(originKey('claude:/chat/xyz'))).toBeDefined();
    expect(await readOrigin('claude:/chat/xyz', store)).not.toBeNull();
  });

  it('does not overwrite an origin already bound to that conversation', async () => {
    const store = memoryStore();
    await store.set(originKey('claude:/chat/xyz'), { platform: 'chatgpt', url: 'u', cutIndex: 0 });
    rememberOrigin(lineage);
    await bindOrigin('claude:/chat/xyz', store);

    expect(await store.get(originKey('claude:/chat/xyz'))).toMatchObject({ platform: 'chatgpt' });
  });

  it('has no origin for a conversation the user simply started', async () => {
    expect(await readOrigin('claude:/chat/plain', memoryStore())).toBeNull();
  });

  it('ignores a lineage with no address to return to', async () => {
    rememberOrigin({ sourceConversationId: 'x', sourcePlatform: 'chatgpt', cutIndex: 0 });
    expect(await readOrigin('claude:/new', memoryStore())).toBeNull();
  });
});
