import { describe, expect, it, vi } from 'vitest';
import { createConversation, type BridgeConversation } from '@domain/conversation/schema';
import {
  createTransferPackageBuilder,
  exceedsTransferBudget,
  messagesInScope,
  type Summarizer,
} from './fork';

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
    const result = await build({ target: 'claude', mode: 'full', scope: 'upToMessage' });

    expect(result.text).toContain('msg2');
    expect(result.text).not.toContain('msg3');
  });

  it('carries the source model into the package', async () => {
    const build = createTransferPackageBuilder({
      conversation: conversation(2),
      cutIndex: 1,
      language: 'en',
    });
    expect((await build({ target: 'claude', mode: 'full', scope: 'upToMessage' })).text).toContain('model: GPT-5');
  });

  it('includes the persona only when the caller passes one', async () => {
    const build = createTransferPackageBuilder({
      conversation: conversation(2),
      cutIndex: 1,
      language: 'en',
    });
    expect((await build({ target: 'claude', mode: 'full', scope: 'upToMessage', personaText: 'Be terse.' })).text).toContain(
      'Be terse.',
    );
    expect((await build({ target: 'claude', mode: 'full', scope: 'upToMessage' })).text).not.toContain('Be terse.');
  });

  it('replaces the transcript with the brief when summarization succeeds', async () => {
    const summarize: Summarizer = vi.fn(async () => ({ ok: true as const, summary: 'User needs X.' }));
    const build = createTransferPackageBuilder({
      conversation: conversation(6),
      cutIndex: 5,
      language: 'en',
      summarize,
    });

    const result = await build({ target: 'claude', mode: 'summary', scope: 'upToMessage' });
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

    const result = await build({ target: 'claude', mode: 'summary', scope: 'upToMessage' });
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

    await build({ target: 'claude', mode: 'full', scope: 'upToMessage' });
    await build({ target: 'claude', mode: 'trimmed', scope: 'upToMessage' });
    expect(summarize).not.toHaveBeenCalled();
  });

  it('marks the elision when trimming drops messages', async () => {
    const build = createTransferPackageBuilder({
      conversation: conversation(30, 4000),
      cutIndex: 29,
      language: 'en',
    });
    const result = await build({ target: 'claude', mode: 'trimmed', scope: 'upToMessage' });
    expect(result.text).toMatch(/earlier messages omitted/);
  });

  it('picks the wrap style from the target, not the source', async () => {
    const build = createTransferPackageBuilder({
      conversation: conversation(2),
      cutIndex: 1,
      language: 'en',
    });
    expect((await build({ target: 'claude', mode: 'full', scope: 'upToMessage' })).text).toContain('<conversation>');
    expect((await build({ target: 'gemini', mode: 'full', scope: 'upToMessage' })).text).toContain(
      '## Previous conversation context',
    );
  });
});

describe('transfer budget check', () => {
  it('stays quiet for a short conversation', () => {
    expect(exceedsTransferBudget(conversation(4), 3, 'whole')).toBe(false);
  });

  it('flags a conversation large enough to strain the target', () => {
    expect(exceedsTransferBudget(conversation(40, 4000), 39, 'whole')).toBe(true);
  });

  it('measures the slice, not the whole conversation', () => {
    // A huge conversation forked at its second message is a small transfer.
    expect(exceedsTransferBudget(conversation(40, 4000), 1, 'upToMessage')).toBe(false);
  });

  it('measures the whole conversation when the scope is whole', () => {
    // Same fork point, other scope: the cut index must not shrink the estimate.
    expect(exceedsTransferBudget(conversation(40, 4000), 1, 'whole')).toBe(true);
  });
});

/**
 * Scope exists because of how the extension read on first real use: forking
 * from the opening message carried that message alone, which is no help to
 * anyone — you could retype it faster. Moving the whole conversation is the
 * common case and is now the default; forking at a point is the branching
 * case, and stays available.
 */
describe('transfer scope', () => {
  it('carries the whole conversation regardless of where the fork started', async () => {
    const build = createTransferPackageBuilder({
      conversation: conversation(4),
      cutIndex: 0,
      language: 'en',
    });
    const whole = await build({ target: 'claude', mode: 'full', scope: 'whole' });
    const upTo = await build({ target: 'claude', mode: 'full', scope: 'upToMessage' });

    expect(messagesInScope(conversation(4), 0, 'whole')).toHaveLength(4);
    expect(messagesInScope(conversation(4), 0, 'upToMessage')).toHaveLength(1);
    expect(whole.estimatedTokens).toBeGreaterThan(upTo.estimatedTokens);
  });

  it('includes the answer to the message forked from, which “up to” leaves out', async () => {
    const build = createTransferPackageBuilder({
      conversation: conversation(2),
      cutIndex: 0,
      language: 'en',
    });
    // Message 1 is the assistant's reply to message 0 — the turn that was
    // missing from the first live fork.
    expect((await build({ target: 'claude', mode: 'full', scope: 'whole' })).text).toContain(
      'msg1',
    );
    expect((await build({ target: 'claude', mode: 'full', scope: 'upToMessage' })).text).not.toContain(
      'msg1',
    );
  });
});
