// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdapterHealth } from '@shared/health';
import type { ArchiveHit, ComparisonState } from '@shared/messages';
import { DEFAULT_SETTINGS, getSettings, useSettingsStore, type Settings } from '@shared/settings';
import { memoryStore } from '@shared/storage';
import { setHtml, type SafeHtml } from '@views/html';
import { bindArchive, renderArchive, renderHits } from './archive';
import { bindCompare, renderCompare, truncate } from './compare';
import { bindOnboarding, renderOnboarding } from './onboarding';
import { bindPersona, renderPersona, upsertPersona } from './persona';
import { bindSettings, renderSettings } from './settings';
import { bindStatus, diagnosticsReport, renderStatus } from './status';

const HOSTILE = '<img src=x onerror="alert(1)">';

function mount(content: SafeHtml): HTMLElement {
  const root = document.createElement('div');
  setHtml(root, content);
  document.body.replaceChildren(root);
  return root;
}

const settings = (patch: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, language: 'en', ...patch });

beforeEach(() => {
  useSettingsStore(memoryStore());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('user-controlled text is inert in every section', () => {
  it.each([
    ['persona name', () => renderPersona(settings({ personas: [{ id: 'p', name: HOSTILE, text: '' }], activePersonaId: 'p' }))],
    ['persona text', () => renderPersona(settings({ personas: [{ id: 'p', name: 'n', text: HOSTILE }], activePersonaId: 'p' }))],
    ['archive title', () => renderHits('en', [{ id: 'a', sourcePlatform: 'claude', title: HOSTILE, snippet: '', updatedAt: '2026-09-11' }])],
    ['comparison answer', () => renderCompare('en', [{ id: 'c', text: 'q', targets: ['claude'], createdAt: 't', responses: { claude: { content: HOSTILE, updatedAt: 't' } } }])],
    ['API key field', () => renderSettings(settings({ anthropicApiKey: `"${HOSTILE}` }))],
  ])('%s', (_label, render) => {
    const root = mount(render());
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent + root.innerHTML).toContain('onerror');
  });
});

describe('status', () => {
  const healths: AdapterHealth[] = [
    { platform: 'chatgpt', ok: true, brokenSelectors: [], checkedAt: 't' },
    { platform: 'claude', ok: false, brokenSelectors: ['composer'], checkedAt: 't' },
  ];

  it('shows every platform: ready, degraded with the broken target, or no tab', () => {
    const root = mount(renderStatus('en', healths));
    const rows = [...root.querySelectorAll('.platform-item')].map((row) => row.textContent?.replace(/\s+/g, ' ').trim());
    expect(rows).toEqual(['ChatGPT ready', 'Claude degraded: composer', 'Gemini no tab open']);
    expect(root.querySelector('.status-dot.degraded')).not.toBeNull();
  });

  it('builds a diagnostics report with selector state and no conversation content', () => {
    const report = diagnosticsReport(healths, '0.4.0', 'UA/1', new Date('2026-09-11T00:00:00Z'));
    expect(report).toContain('Extension version: 0.4.0');
    expect(report).toContain('claude: broken → composer');
    expect(report).toContain('No conversation content is included');
    expect(diagnosticsReport([], '0.4.0', 'UA/1')).toContain('no platform tab reported');
  });

  it('copies the report to the clipboard', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText }, userAgent: 'UA/1' });
    const root = mount(renderStatus('en', healths));
    bindStatus(root, 'en', healths, '0.4.0');
    root.querySelector<HTMLButtonElement>('#diag-copy')!.click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('0.4.0')));
  });
});

describe('persona', () => {
  it('updates the active persona in place', () => {
    const result = upsertPersona(
      { personas: [{ id: 'a', name: 'old', text: 'x' }], activePersonaId: 'a' },
      'new',
      'y',
    );
    expect(result).toEqual({ personas: [{ id: 'a', name: 'new', text: 'y' }], activePersonaId: 'a' });
  });

  it('creates a persona and makes it active when none is selected', () => {
    const result = upsertPersona({ personas: [], activePersonaId: null }, 'Work', 'terse', () => 'id-1');
    expect(result).toEqual({ personas: [{ id: 'id-1', name: 'Work', text: 'terse' }], activePersonaId: 'id-1' });
  });

  it('saves from the form and refuses an unnamed persona', async () => {
    const onChanged = vi.fn();
    const root = mount(renderPersona(settings()));
    bindPersona(root, settings(), onChanged);

    root.querySelector<HTMLButtonElement>('#persona-save')!.click();
    expect(onChanged).not.toHaveBeenCalled();

    root.querySelector<HTMLInputElement>('#persona-name')!.value = 'Work';
    root.querySelector<HTMLTextAreaElement>('#persona-text')!.value = 'Answer tersely.';
    root.querySelector<HTMLButtonElement>('#persona-save')!.click();
    await vi.waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect((await getSettings()).personas.map((p) => p.name)).toEqual(['Work']);
  });

  it('deletes the active persona', async () => {
    const current = settings({ personas: [{ id: 'a', name: 'Work', text: '' }], activePersonaId: 'a' });
    const onChanged = vi.fn();
    const root = mount(renderPersona(current));
    bindPersona(root, current, onChanged);
    root.querySelector<HTMLButtonElement>('#persona-delete')!.click();
    await vi.waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect((await getSettings()).personas).toEqual([]);
  });
});

describe('settings', () => {
  it('pre-selects the current language and summary model', () => {
    const root = mount(renderSettings(settings({ language: 'tr', summaryModel: 'claude-opus-4-8' })));
    expect(root.querySelector<HTMLSelectElement>('#settings-lang')!.value).toBe('tr');
    expect(root.querySelector<HTMLSelectElement>('#settings-model')!.value).toBe('claude-opus-4-8');
  });

  it('saves the form, trimming the API key', async () => {
    const onChanged = vi.fn();
    const root = mount(renderSettings(settings()));
    bindSettings(root, settings(), onChanged);
    root.querySelector<HTMLInputElement>('#settings-key')!.value = '  sk-ant-123  ';
    root.querySelector<HTMLButtonElement>('#settings-save')!.click();
    await vi.waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect((await getSettings()).anthropicApiKey).toBe('sk-ant-123');
  });
});

describe('onboarding', () => {
  it('shows until dismissed, then records it and removes itself', async () => {
    expect(renderOnboarding(settings({ onboardingDone: true })).value.trim()).toBe('');
    const onDone = vi.fn();
    const root = mount(renderOnboarding(settings()));
    bindOnboarding(root, onDone);
    root.querySelector<HTMLButtonElement>('#onboard-dismiss')!.click();
    await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(root.querySelector('#onboard')).toBeNull();
    expect((await getSettings()).onboardingDone).toBe(true);
  });
});

describe('archive', () => {
  const hit: ArchiveHit = { id: 'claude-1', sourcePlatform: 'claude', title: 'DB', snippet: 'use Postgres', updatedAt: '2026-09-11T00:00:00Z' };

  it('lists hits with a platform, a date and both export formats', () => {
    const root = mount(renderHits('en', [hit]));
    expect(root.textContent).toContain('Claude · 2026-09-11');
    expect([...root.querySelectorAll('[data-export]')].map((b) => b.getAttribute('data-export'))).toEqual(['markdown', 'json']);
    expect(mount(renderHits('en', [])).textContent).toContain('No results');
  });

  it('turns archiving on from the toggle', async () => {
    const onChanged = vi.fn();
    const root = mount(renderArchive(settings(), []));
    vi.stubGlobal('chrome', { runtime: { sendMessage: vi.fn(async () => []) } });
    bindArchive(root, settings(), onChanged);
    const toggle = root.querySelector<HTMLInputElement>('#archive-toggle')!;
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect((await getSettings()).archiveEnabled).toBe(true);
  });
});

describe('compare', () => {
  const comparison: ComparisonState = {
    id: 'c',
    text: 'Which is faster?',
    targets: ['chatgpt', 'claude'],
    createdAt: 't',
    responses: { claude: { content: 'Claude says B', updatedAt: 't' } },
  };

  it('shows answers as they arrive and waits for the rest', () => {
    const root = mount(renderCompare('en', [comparison]));
    const answers = [...root.querySelectorAll('.compare-answer')].map((a) => a.textContent?.replace(/\s+/g, ' ').trim());
    expect(answers).toEqual(['ChatGPT waiting for answer…', 'Claude Claude says B']);
  });

  it('truncates long text with an ellipsis', () => {
    expect(truncate('abcdef', 3)).toBe('abc…');
    expect(truncate('abc', 3)).toBe('abc');
  });

  it('starts a comparison for the ticked platforms only, and not without a prompt', async () => {
    const sendMessage = vi.fn(async () => ({ comparisonId: 'c' }));
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const onStarted = vi.fn();
    const root = mount(renderCompare('en', []));
    bindCompare(root, onStarted);

    root.querySelector<HTMLButtonElement>('#compare-send')!.click();
    expect(sendMessage).not.toHaveBeenCalled();

    root.querySelector<HTMLTextAreaElement>('#compare-text')!.value = 'Which is faster?';
    root.querySelector<HTMLInputElement>('.compare-target[value="gemini"]')!.checked = false;
    root.querySelector<HTMLButtonElement>('#compare-send')!.click();
    await vi.waitFor(() => expect(onStarted).toHaveBeenCalled());
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'compare/start',
      text: 'Which is faster?',
      targets: ['chatgpt', 'claude'],
    });
  });
});
