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
