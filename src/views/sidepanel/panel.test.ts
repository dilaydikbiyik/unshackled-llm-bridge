// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@shared/settings';
import { memoryStore } from '@shared/storage';
import { renderPanel, resetPanelSubscription } from './panel';

function stubChrome(healths: unknown[] = []) {
  vi.stubGlobal('chrome', {
    runtime: {
      getManifest: () => ({ version: '0.4.0' }),
      sendMessage: vi.fn(async (message: { type: string }) =>
        message.type === 'health/list-request' ? healths : [],
      ),
    },
    storage: { local: { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined) } },
    // The panel reads the active tab to offer it as a site to add. Stubbed so
    // the test drives the real ports rather than a convenient substitute —
    // their absence is what broke CI while every test still passed.
    tabs: { query: vi.fn(async () => [{ url: 'https://chatgpt.com/c/1' }]) },
    permissions: { request: vi.fn(async () => true), remove: vi.fn(async () => true) },
  });
}

beforeEach(() => {
  useSettingsStore(memoryStore({ settings: { language: 'en' } }));
  resetPanelSubscription();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('side panel', () => {
  it('renders every section with the reported platform health', async () => {
    stubChrome([{ platform: 'claude', ok: true, brokenSelectors: [], checkedAt: 't' }]);
    const root = document.createElement('div');
    await renderPanel(root, () => () => undefined);

    expect(root.querySelector('h1')?.textContent).toBe('Unshackled LLM Bridge');
    expect(root.querySelector('#onboard')).not.toBeNull();
    expect(root.textContent).toContain('Claude');
    expect(root.querySelector('.status-dot.ok')).not.toBeNull();
    for (const id of ['#compare-send', '#persona-save', '#archive-toggle', '#settings-save']) {
      expect(root.querySelector(id), id).not.toBeNull();
    }
  });

  it('subscribes to comparison updates once, however often it re-renders', async () => {
    stubChrome();
    const watch = vi.fn(() => () => undefined);
    const root = document.createElement('div');
    await renderPanel(root, watch);
    await renderPanel(root, watch);
    await renderPanel(root, watch);
    expect(watch).toHaveBeenCalledOnce();
  });

  it('still renders when the service worker cannot be reached', async () => {
    vi.stubGlobal('chrome', {
      runtime: {
        getManifest: () => ({ version: '0.4.0' }),
        sendMessage: vi.fn(async () => {
          throw new Error('Receiving end does not exist');
        }),
      },
      storage: { local: { get: vi.fn(async () => ({})), set: vi.fn() } },
    });
    const root = document.createElement('div');
    await renderPanel(root, () => () => undefined);
    expect(root.textContent).toContain('no tab open');
  });
});

describe('panel ports', () => {
  // CI failed for four commits while all 372 tests passed: the panel's own
  // ports threw into nothing, and an unhandled rejection fails the run.
  it('renders without an unhandled rejection when Chrome has no tabs API', async () => {
    vi.stubGlobal('chrome', {
      runtime: { getManifest: () => ({ version: '0.4.0' }), sendMessage: vi.fn(async () => []) },
      storage: { local: { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined) } },
    });

    const root = document.createElement('div');
    document.body.append(root);
    const rejections: unknown[] = [];
    const onRejection = (event: PromiseRejectionEvent) => rejections.push(event.reason);
    globalThis.addEventListener('unhandledrejection', onRejection);

    await renderPanel(root, () => () => undefined);
    await new Promise((resolve) => setTimeout(resolve, 10));

    globalThis.removeEventListener('unhandledrejection', onRejection);
    expect(rejections).toEqual([]);
  });
});
