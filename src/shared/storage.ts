/**
 * A minimal async key–value port over the chrome.storage areas.
 *
 * Code that persists state depends on this interface, not on `chrome.storage`
 * directly: it runs against memoryStore() in a unit test and chromeStore() in
 * the extension. The browser API is reached from exactly one module.
 */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

export type StorageArea = 'local' | 'session';

export function chromeStore(area: StorageArea): KeyValueStore {
  return {
    async get<T>(key: string) {
      const stored = await chrome.storage[area].get(key);
      return stored[key] as T | undefined;
    },
    async set(key, value) {
      await chrome.storage[area].set({ [key]: value });
    },
    async remove(key) {
      await chrome.storage[area].remove(key);
    },
  };
}

/** Calls `onChange` whenever `key` changes in `area`; returns unsubscribe. */
export function watchChromeKey(area: StorageArea, key: string, onChange: () => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, changedArea: string) => {
    if (changedArea === area && key in changes) onChange();
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

/**
 * In-memory implementation for tests. Values are cloned on the way in and out,
 * as chrome.storage serializes them — so a test cannot pass by mutating a
 * value it read, which the real store would not allow either.
 */
export function memoryStore(
  initial: Record<string, unknown> = {},
): KeyValueStore & { snapshot(): Record<string, unknown> } {
  const data = new Map<string, unknown>(Object.entries(structuredClone(initial)));
  return {
    async get<T>(key: string) {
      return data.has(key) ? (structuredClone(data.get(key)) as T) : undefined;
    },
    async set(key, value) {
      data.set(key, structuredClone(value));
    },
    async remove(key) {
      data.delete(key);
    },
    snapshot: () => structuredClone(Object.fromEntries(data)),
  };
}
