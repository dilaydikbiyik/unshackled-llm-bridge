import { describe, expect, it, vi } from 'vitest';
import { createConversation } from '@domain/conversation/schema';
import { bytesToBase64 } from '@shared/base64';
import type { AdapterHealth } from '@shared/health';
import type { MessageOf, MessageType, ResponseOf } from '@shared/messages';
import { DEFAULT_SETTINGS, type Settings } from '@shared/settings';
import { memoryStore } from '@shared/storage';
import { COMPARE_STAGGER_MS, createHandlers, healthKey, pendingKey, type RepoPort } from './handlers';

// A tiny cap keeps the size tests from allocating 25 MB.
vi.mock('@domain/attachments', () => ({ MAX_ATTACHMENT_BYTES: 4 }));

const conversation = createConversation({
  id: 'chatgpt-abc',
  sourcePlatform: 'chatgpt',
  title: 'Plan',
  createdAt: '2026-09-11T08:00:00.000Z',
  messages: [
    { role: 'user', content: 'hi', index: 0, attachmentRefs: [] },
    { role: 'assistant', content: 'hello', index: 1, attachmentRefs: [] },
  ],
  attachments: [],
});

function setup(options: { settings?: Partial<Settings>; repo?: Partial<Record<keyof RepoPort, unknown>> } = {}) {
  const session = memoryStore();
  const local = memoryStore();
  const openTab = vi.fn(async (_url: string, _options: { active: boolean }) => undefined);
  const sleep = vi.fn(async (_ms: number) => undefined);
  const summarize = vi.fn(async () => 'a dense brief');
  const repo = {
    saveAttachment: vi.fn(async () => ({ id: 'att-1' })),
    listAttachments: vi.fn(async () => []),
    getAttachment: vi.fn(async () => null),
    saveConversation: vi.fn(async () => undefined),
    getConversation: vi.fn(async () => conversation),
    searchConversations: vi.fn(async () => []),
    recordFork: vi.fn(async () => undefined),
    listForksFrom: vi.fn(async () => []),
    ...options.repo,
  };
  const handlers = createHandlers({
    session,
    local,
    openTab,
    repo: repo as unknown as RepoPort,
    summarize,
    getSettings: async () => ({ ...DEFAULT_SETTINGS, ...options.settings }),
    sleep,
    now: () => new Date('2026-09-11T10:00:00.000Z'),
    newId: () => 'cmp-1',
  });
  const call = <T extends MessageType>(message: MessageOf<T>): Promise<ResponseOf<T>> =>
    (handlers[message.type] as (m: MessageOf<T>, s: object) => Promise<ResponseOf<T>>)(message, {});
  return { session, local, openTab, sleep, summarize, repo, call };
}

const health = (platform: 'chatgpt' | 'claude', ok = true): AdapterHealth => ({
  platform,
  ok,
  brokenSelectors: ok ? [] : ['composer'],
  checkedAt: '2026-09-11T10:00:00.000Z',
});

describe('adapter health', () => {
  it('lists exactly the platforms that have reported, in registry order', async () => {
    const { call } = setup();
    await call({ type: 'adapter/health-report', health: health('claude', false) });
    await call({ type: 'adapter/health-report', health: health('chatgpt') });
    const listed = await call({ type: 'health/list-request' });
    expect(listed.map((h) => h.platform)).toEqual(['chatgpt', 'claude']);
    expect(listed[1]?.brokenSelectors).toEqual(['composer']);
  });

  it('keeps health in session storage, which the browser clears on close', async () => {
    const { call, session } = setup();
    await call({ type: 'adapter/health-report', health: health('chatgpt') });
    expect(session.snapshot()[healthKey('chatgpt')]).toBeDefined();
  });
});

describe('transfer hand-off', () => {
  const request = {
    targetPlatform: 'claude' as const,
    injection: { text: 'context package', attachmentIds: ['att-1'] },
    lineage: { sourceConversationId: 'chatgpt-abc', sourcePlatform: 'chatgpt' as const, cutIndex: 1 },
  };

  it('parks the package, records lineage, and opens the target in the foreground', async () => {
    const { call, session, repo, openTab } = setup();
    await call({ type: 'inject/initiate', request });
    expect(session.snapshot()[pendingKey('claude')]).toEqual(request.injection);
    expect(repo.recordFork).toHaveBeenCalledWith(request.lineage, 'claude');
    expect(openTab).toHaveBeenCalledWith('https://claude.ai/new', { active: true });
  });

  it('hands the package out exactly once', async () => {
    const { call } = setup();
    await call({ type: 'inject/initiate', request });
    expect(await call({ type: 'inject/pending-check', platform: 'claude' })).toEqual(request.injection);
    expect(await call({ type: 'inject/pending-check', platform: 'claude' })).toBeNull();
  });

  it('does not hand a package to the wrong platform', async () => {
    const { call } = setup();
    await call({ type: 'inject/initiate', request });
    expect(await call({ type: 'inject/pending-check', platform: 'gemini' })).toBeNull();
  });
});

describe('attachments', () => {
  const meta = {
    name: 'a.txt',
    mime: 'text/plain',
    size: 3,
    sourcePlatform: 'chatgpt' as const,
    conversationKey: 'chatgpt:/c/abc',
    capturedAt: '2026-09-11T10:00:00.000Z',
  };

  it('stores a file within the cap, passing the decoded bytes', async () => {
    const { call, repo } = setup();
    await call({ type: 'attachment/capture', meta, dataBase64: bytesToBase64(new Uint8Array([1, 2, 3])) });
    expect(repo.saveAttachment).toHaveBeenCalledWith(meta, new Uint8Array([1, 2, 3]));
  });

  it('refuses a file over the cap without touching the store', async () => {
    const { call, repo } = setup();
    const result = await call({
      type: 'attachment/capture',
      meta,
      dataBase64: bytesToBase64(new Uint8Array([1, 2, 3, 4, 5])),
    });
    expect(result).toEqual({ ok: false, error: 'too-large' });
    expect(repo.saveAttachment).not.toHaveBeenCalled();
  });

  it('returns a stored file as base64, and null when it is gone', async () => {
    const stored = { meta: { ...meta, id: 'att-1', sha256: 'x' }, blob: new Blob([new Uint8Array([9, 8])]) };
    const { call } = setup({ repo: { getAttachment: vi.fn(async () => stored) } });
    expect(await call({ type: 'attachment/get', id: 'att-1' })).toEqual({
      meta: stored.meta,
      dataBase64: bytesToBase64(new Uint8Array([9, 8])),
    });
    expect(await setup().call({ type: 'attachment/get', id: 'missing' })).toBeNull();
  });
});

describe('archive', () => {
  it('refuses to archive while archiving is off — it is opt-in', async () => {
    const { call, repo } = setup({ settings: { archiveEnabled: false } });
    expect(await call({ type: 'archive/save', conversation })).toEqual({ ok: false });
    expect(repo.saveConversation).not.toHaveBeenCalled();
  });

  it('archives once the user has opted in', async () => {
    const { call, repo } = setup({ settings: { archiveEnabled: true } });
    expect(await call({ type: 'archive/save', conversation })).toEqual({ ok: true });
    expect(repo.saveConversation).toHaveBeenCalledWith(conversation);
  });

  it('exports Markdown with fork lineage, and JSON as the parsed conversation', async () => {
    const forks = [{ targetPlatform: 'claude', cutIndex: 0, createdAt: '2026-09-11T09:00:00.000Z' }];
    const { call } = setup({ repo: { listForksFrom: vi.fn(async () => forks) } });

    const markdown = await call({ type: 'archive/export', id: conversation.id, format: 'markdown' });
    expect(markdown?.filename).toBe('plan.md');
    expect(markdown?.content).toContain('## Forks');

    const json = await call({ type: 'archive/export', id: conversation.id, format: 'json' });
    expect(JSON.parse(json!.content).id).toBe(conversation.id);
  });

  it('exports nothing for an unknown conversation', async () => {
    const { call } = setup({ repo: { getConversation: vi.fn(async () => null) } });
    expect(await call({ type: 'archive/export', id: 'nope', format: 'json' })).toBeNull();
  });
});

describe('parallel comparison', () => {
  it('logs the comparison and parks the prompt for each target', async () => {
    const { call, local, session } = setup();
    const { comparisonId } = await call({
      type: 'compare/start',
      text: 'Which is faster?',
      targets: ['chatgpt', 'claude', 'gemini'],
    });
    expect(comparisonId).toBe('cmp-1');
    expect(local.snapshot()['comparisons']).toEqual([
      expect.objectContaining({ id: 'cmp-1', text: 'Which is faster?', responses: {} }),
    ]);
    expect(session.snapshot()[pendingKey('gemini')]).toEqual({
      text: 'Which is faster?',
      attachmentIds: [],
      comparisonId: 'cmp-1',
    });
  });

  it('opens target tabs in the background, staggered, never as a burst', async () => {
    const { call, openTab, sleep } = setup();
    await call({ type: 'compare/start', text: 'q', targets: ['chatgpt', 'claude', 'gemini'] });
    expect(openTab.mock.calls.map(([url, opts]) => [url, opts.active])).toEqual([
      ['https://chatgpt.com/', false],
      ['https://claude.ai/new', false],
      ['https://gemini.google.com/app', false],
    ]);
    expect(sleep.mock.calls).toEqual([[COMPARE_STAGGER_MS], [COMPARE_STAGGER_MS]]);
  });

  it('records an answer against its comparison, and ignores an unknown one', async () => {
    const { call, local } = setup();
    await call({ type: 'compare/start', text: 'q', targets: ['claude'] });
    expect(await call({ type: 'compare/report', comparisonId: 'cmp-1', platform: 'claude', content: 'A' })).toEqual({ ok: true });
    expect(await call({ type: 'compare/report', comparisonId: 'nope', platform: 'claude', content: 'A' })).toEqual({ ok: false });
    const [stored] = local.snapshot()['comparisons'] as { responses: Record<string, { content: string }> }[];
    expect(stored?.responses['claude']?.content).toBe('A');
  });
});

describe('summarize', () => {
  it('does not call the API without a key', async () => {
    const { call, summarize } = setup({ settings: { anthropicApiKey: '' } });
    expect(await call({ type: 'summarize/run', transcript: 't', language: 'en' })).toEqual({
      ok: false,
      error: 'no-api-key',
    });
    expect(summarize).not.toHaveBeenCalled();
  });

  it('uses the key and model from settings', async () => {
    const { call, summarize } = setup({
      settings: { anthropicApiKey: 'sk-test', summaryModel: 'claude-opus-4-8' },
    });
    expect(await call({ type: 'summarize/run', transcript: 't', language: 'tr' })).toEqual({
      ok: true,
      summary: 'a dense brief',
    });
    expect(summarize).toHaveBeenCalledWith({
      apiKey: 'sk-test',
      model: 'claude-opus-4-8',
      transcript: 't',
      language: 'tr',
    });
  });

  it('turns an API failure into a reported error rather than a crash', async () => {
    const { call, summarize } = setup({ settings: { anthropicApiKey: 'sk-test' } });
    summarize.mockRejectedValueOnce(new Error('overloaded'));
    expect(await call({ type: 'summarize/run', transcript: 't', language: 'en' })).toEqual({
      ok: false,
      error: 'overloaded',
    });
  });
});

/**
 * Seen on the first real use: a fork arrived at the target carrying two
 * transcripts, the current one and the one from the fork before it. The
 * generated transcript is stored like any attachment so the replay path can
 * carry it, and the dialog was then offering it back as one of the user's own
 * files, with every fork adding another.
 */
describe('generated transcripts are not the user’s files', () => {
  const userFile = {
    id: 'a1',
    name: 'spec.pdf',
    mime: 'application/pdf',
    size: 10,
    sha256: 'x',
    sourcePlatform: 'chatgpt' as const,
    conversationKey: 'k',
    capturedAt: 't',
  };
  const previousTranscript = {
    ...userFile,
    id: 'a2',
    name: 'gemini-conversation.md',
    mime: 'text/markdown',
    generated: true,
  };

  it('lists only what the user uploaded', async () => {
    const { call } = setup({
      repo: { listAttachments: vi.fn(async () => [userFile, previousTranscript]) },
    });
    const listed = await call({ type: 'attachment/list', conversationKey: 'k' });

    expect(listed.map((meta) => meta.id)).toEqual(['a1']);
  });
});
