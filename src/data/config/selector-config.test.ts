// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import bundled from '../../../config/selectors.json';
import {
  loadSelectorConfig,
  resolveSelector,
  resolveSelectorAll,
  validateSelectorConfig,
} from './selector-config';

describe('selector resolution — hostile or broken config', () => {
  it('skips a malformed candidate instead of throwing', () => {
    document.body.innerHTML = '<div id="ok"></div>';
    // Unbalanced bracket: querySelector throws a SyntaxError on this.
    expect(resolveSelector(document, ['div[broken', '#ok'])?.matched).toBe('#ok');
    expect(resolveSelectorAll(document, ['div[broken', '#ok'])).toHaveLength(1);
  });

  it('returns nothing, rather than throwing, when every candidate is malformed', () => {
    expect(resolveSelector(document, ['[[', '::nope('])).toBeNull();
    expect(resolveSelectorAll(document, ['[['])).toEqual([]);
  });
});

describe('remote config validation', () => {
  it('accepts the bundled config', () => {
    expect(() => validateSelectorConfig(bundled)).not.toThrow();
  });

  it.each([
    ['a non-object', 'selectors'],
    ['a missing version', { platforms: {} }],
    ['platforms as an array', { version: 9, platforms: [] }],
    ['a target that is not a list', { version: 9, platforms: { claude: { composer: '#x' } } }],
    ['a non-string candidate', { version: 9, platforms: { claude: { composer: [42] } } }],
    [
      'an absurdly long candidate',
      { version: 9, platforms: { claude: { composer: ['a'.repeat(501)] } } },
    ],
  ])('rejects %s', (_label, raw) => {
    expect(() => validateSelectorConfig(raw)).toThrow(/rejected/);
  });
});

describe('loadSelectorConfig — remote first, bundled fallback', () => {
  type Cached = { config: { version: number; platforms: object }; etag: string | null; fetchedAt: number };

  function stubChrome(cached?: Cached) {
    const set = vi.fn(async () => undefined);
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async (key: string) => (cached ? { [key]: cached } : {})),
          set,
        },
      },
    });
    return set;
  }

  const remote = (version: number) => ({ ...bundled, version });
  const respond = (status: number, body?: unknown, etag?: string) =>
    vi.fn(async () =>
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: etag ? { etag } : {},
      }),
    );

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses a newer remote config and caches it with its ETag', async () => {
    const set = stubChrome();
    vi.stubGlobal('fetch', respond(200, remote(bundled.version + 1), '"v-next"'));
    const config = await loadSelectorConfig();
    expect(config.version).toBe(bundled.version + 1);
    expect(set).toHaveBeenCalledWith({
      'selector-config-cache': expect.objectContaining({ etag: '"v-next"' }),
    });
  });

  it('never lets a stale remote config downgrade the bundled one', async () => {
    stubChrome();
    vi.stubGlobal('fetch', respond(200, remote(bundled.version - 1)));
    expect((await loadSelectorConfig()).version).toBe(bundled.version);
  });

  it('falls back to the bundled config when the network fails', async () => {
    stubChrome();
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('offline');
    }));
    expect(await loadSelectorConfig()).toEqual(bundled);
  });

  it('falls back to the bundled config when the remote file is malformed', async () => {
    stubChrome();
    vi.stubGlobal('fetch', respond(200, { version: 99, platforms: { claude: { composer: 'x' } } }));
    expect(await loadSelectorConfig()).toEqual(bundled);
  });

  it('serves a fresh cache without touching the network', async () => {
    stubChrome({ config: remote(bundled.version + 2), etag: null, fetchedAt: Date.now() });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect((await loadSelectorConfig()).version).toBe(bundled.version + 2);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('revalidates a stale cache with If-None-Match and keeps it on 304', async () => {
    stubChrome({ config: remote(bundled.version + 3), etag: '"v3"', fetchedAt: 0 });
    const fetch = respond(304);
    vi.stubGlobal('fetch', fetch);
    expect((await loadSelectorConfig()).version).toBe(bundled.version + 3);
    expect(fetch).toHaveBeenCalledWith(expect.any(String), { headers: { 'If-None-Match': '"v3"' } });
  });
});
