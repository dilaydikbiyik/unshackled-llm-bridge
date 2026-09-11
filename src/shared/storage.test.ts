import { afterEach, describe, expect, it, vi } from 'vitest';
import { chromeStore, memoryStore, watchChromeKey } from './storage';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('memoryStore', () => {
  it('round-trips a value and removes it', async () => {
    const store = memoryStore();
    await store.set('k', { n: 1 });
    expect(await store.get('k')).toEqual({ n: 1 });
    await store.remove('k');
    expect(await store.get('k')).toBeUndefined();
  });

  it('isolates stored values from later mutation, as chrome.storage does', async () => {
    const store = memoryStore();
    const value = { n: 1 };
    await store.set('k', value);
    value.n = 2;
    const read = await store.get<{ n: number }>('k');
    read!.n = 3;
    expect(await store.get('k')).toEqual({ n: 1 });
  });

  it('starts from initial contents and exposes a snapshot', async () => {
    const store = memoryStore({ a: 1 });
    await store.set('b', 2);
    expect(store.snapshot()).toEqual({ a: 1, b: 2 });
  });
});

describe('chromeStore', () => {
  it('reads, writes and removes through the named storage area', async () => {
    const area = {
      get: vi.fn(async (key: string) => ({ [key]: 42 })),
      set: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    };
    vi.stubGlobal('chrome', { storage: { session: area, local: {} } });

    const store = chromeStore('session');
    expect(await store.get('x')).toBe(42);
    await store.set('x', 1);
    expect(area.set).toHaveBeenCalledWith({ x: 1 });
    await store.remove('x');
    expect(area.remove).toHaveBeenCalledWith('x');
  });
});

describe('watchChromeKey', () => {
  it('fires only for the watched key in the watched area, and unsubscribes', () => {
    type Listener = (changes: Record<string, unknown>, area: string) => void;
    let listener: Listener = () => undefined;
    const onChanged = {
      addListener: vi.fn((l: Listener) => {
        listener = l;
      }),
      removeListener: vi.fn(),
    };
    vi.stubGlobal('chrome', { storage: { onChanged } });

    const onChange = vi.fn();
    const stop = watchChromeKey('local', 'comparisons', onChange);

    listener({ comparisons: {} }, 'session');
    listener({ other: {} }, 'local');
    expect(onChange).not.toHaveBeenCalled();

    listener({ comparisons: {} }, 'local');
    expect(onChange).toHaveBeenCalledOnce();

    stop();
    expect(onChanged.removeListener).toHaveBeenCalledWith(listener);
  });
});
