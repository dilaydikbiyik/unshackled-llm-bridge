import { describe, expect, it, vi } from 'vitest';
import { createConversation, type BridgeConversation } from '@domain/conversation/schema';
import { createTransferPackageBuilder, exceedsTransferBudget, type Summarizer } from './fork';

function conversation(messageCount: number, size = 20): BridgeConversation {
  return createConversation({
    id: 'c1',
    sourcePlatform: 'chatgpt',
    model: 'GPT-5',
    createdAt: '2026-09-10T00:00:00.000Z',
    messages: Array.from({ length: messageCount }, (_, index) => ({
      role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: `msg${index} ${'x'.repeat(size)}`,
      index,
      attachmentRefs: [],
    })),
    attachments: [],
  });
}

describe('transfer package builder', () => {
  it('cuts the conversation at the fork point', async () => {
    const build = createTransferPackageBuilder({
      conversation: conversation(6),
      cutIndex: 2,
      language: 'en',
    });
    const result = await build({ target: 'claude', mode: 'full' });

    expect(result.text).toContain('msg2');
    expect(result.text).not.toContain('msg3');
  });

  it('carries the source model into the package', async () => {
    const build = createTransferPackageBuilder({
      conversation: conversation(2),
      cutIndex: 1,
      language: 'en',
    });
    expect((await build({ target: 'claude', mode: 'full' })).text).toContain('model: GPT-5');
  });

  it('includes the persona only when the caller passes one', async () => {
    const build = createTransferPackageBuilder({
      conversation: conversation(2),
      cutIndex: 1,
      language: 'en',
    });
    expect((await build({ target: 'claude', mode: 'full', personaText: 'Be terse.' })).text).toContain(
      'Be terse.',
    );
    expect((await build({ target: 'claude', mode: 'full' })).text).not.toContain('Be terse.');
  });

  it('replaces the transcript with the brief when summarization succeeds', async () => {
    const summarize: Summarizer = vi.fn(async () => ({ ok: true as const, summary: 'User needs X.' }));
    const build = createTransferPackageBuilder({
      conversation: conversation(6),
      cutIndex: 5,
      language: 'en',
      summarize,
    });

    const result = await build({ target: 'claude', mode: 'summary' });
    expect(summarize).toHaveBeenCalledOnce();
    expect(result.text).toContain('User needs X.');
    expect(result.text).not.toContain('msg0');
    expect(result.summaryError).toBeUndefined();
  });

  it('degrades to a full transfer when summarization fails, rather than losing the fork', async () => {
    const summarize: Summarizer = async () => ({ ok: false, error: 'rate limited' });
    const build = createTransferPackageBuilder({
      conversation: conversation(4),
      cutIndex: 3,
      language: 'en',
      summarize,
    });

    const result = await build({ target: 'claude', mode: 'summary' });
    // The whole transcript is still there — a failed summary must never mean a lost package.
    expect(result.text).toContain('msg0');
    expect(result.text).toContain('msg3');
    expect(result.summaryError).toBe('rate limited');
  });

  it('never calls the summarizer for full or trimmed transfers', async () => {
    const summarize: Summarizer = vi.fn(async () => ({ ok: true as const, summary: 'x' }));
    const build = createTransferPackageBuilder({
      conversation: conversation(4),
      cutIndex: 3,
      language: 'en',
      summarize,
    });

    await build({ target: 'claude', mode: 'full' });
    await build({ target: 'claude', mode: 'trimmed' });
    expect(summarize).not.toHaveBeenCalled();
  });

  it('marks the elision when trimming drops messages', async () => {
    const build = createTransferPackageBuilder({
      conversation: conversation(30, 4000),
      cutIndex: 29,
      language: 'en',
    });
    const result = await build({ target: 'claude', mode: 'trimmed' });
    expect(result.text).toMatch(/earlier messages omitted/);
  });

  it('picks the wrap style from the target, not the source', async () => {
    const build = createTransferPackageBuilder({
      conversation: conversation(2),
      cutIndex: 1,
      language: 'en',
    });
    expect((await build({ target: 'claude', mode: 'full' })).text).toContain('<conversation>');
    expect((await build({ target: 'gemini', mode: 'full' })).text).toContain(
      '## Previous conversation context',
    );
  });
});

describe('transfer budget check', () => {
  it('stays quiet for a short conversation', () => {
    expect(exceedsTransferBudget(conversation(4), 3)).toBe(false);
  });

  it('flags a conversation large enough to strain the target', () => {
    expect(exceedsTransferBudget(conversation(40, 4000), 39)).toBe(true);
  });

  it('measures the slice, not the whole conversation', () => {
    // A huge conversation forked at its second message is a small transfer.
    expect(exceedsTransferBudget(conversation(40, 4000), 1)).toBe(false);
  });
});
