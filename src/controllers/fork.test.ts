import { describe, expect, it, vi } from 'vitest';
import { createConversation, type BridgeConversation } from '@domain/conversation/schema';
import { estimateTokens, SUMMARY_INPUT_BUDGET } from '@domain/wrap/limits';
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
      // Words, not one run of a letter: a tokenizer reads 4,000 x's as a
      // handful of tokens, which is not what a long message costs.
      content: `msg${index} ${'word '.repeat(Math.ceil(size / 5))}`,
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
    const result = await build({ target: 'claude', mode: 'full', scope: 'upToMessage', delivery: 'inline' });

    expect(result.text).toContain('msg2');
    expect(result.text).not.toContain('msg3');
  });

  it('carries the source model into the package', async () => {
    const build = createTransferPackageBuilder({
      conversation: conversation(2),
      cutIndex: 1,
      language: 'en',
    });
    expect((await build({ target: 'claude', mode: 'full', scope: 'upToMessage', delivery: 'inline' })).text).toContain('model: GPT-5');
  });

  it('includes the persona only when the caller passes one', async () => {
    const build = createTransferPackageBuilder({
      conversation: conversation(2),
      cutIndex: 1,
      language: 'en',
    });
    expect((await build({ target: 'claude', mode: 'full', scope: 'upToMessage', delivery: 'inline', personaText: 'Be terse.' })).text).toContain(
      'Be terse.',
    );
    expect((await build({ target: 'claude', mode: 'full', scope: 'upToMessage', delivery: 'inline' })).text).not.toContain('Be terse.');
  });

  it('replaces the transcript with the brief when summarization succeeds', async () => {
    const summarize: Summarizer = vi.fn(async () => ({ ok: true as const, summary: 'User needs X.' }));
    const build = createTransferPackageBuilder({
      conversation: conversation(6),
      cutIndex: 5,
      language: 'en',
      summarize,
    });

    const result = await build({ target: 'claude', mode: 'summary', scope: 'upToMessage', delivery: 'inline' });
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

    const result = await build({ target: 'claude', mode: 'summary', scope: 'upToMessage', delivery: 'inline' });
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

    await build({ target: 'claude', mode: 'full', scope: 'upToMessage', delivery: 'inline' });
    await build({ target: 'claude', mode: 'trimmed', scope: 'upToMessage', delivery: 'inline' });
    expect(summarize).not.toHaveBeenCalled();
  });

  it('marks the elision when trimming drops messages', async () => {
    const build = createTransferPackageBuilder({
      conversation: conversation(60, 4000),
      cutIndex: 59,
      language: 'en',
    });
    const result = await build({ target: 'claude', mode: 'trimmed', scope: 'upToMessage', delivery: 'inline' });
    expect(result.text).toMatch(/earlier messages omitted/);
  });

  it('picks the wrap style from the target, not the source', async () => {
    const build = createTransferPackageBuilder({
      conversation: conversation(2),
      cutIndex: 1,
      language: 'en',
    });
    expect((await build({ target: 'claude', mode: 'full', scope: 'upToMessage', delivery: 'inline' })).text).toContain('<conversation>');
    expect((await build({ target: 'gemini', mode: 'full', scope: 'upToMessage', delivery: 'inline' })).text).toContain(
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
    const whole = await build({ target: 'claude', mode: 'full', scope: 'whole', delivery: 'inline' });
    const upTo = await build({ target: 'claude', mode: 'full', scope: 'upToMessage', delivery: 'inline' });

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
    expect((await build({ target: 'claude', mode: 'full', scope: 'whole', delivery: 'inline' })).text).toContain(
      'msg1',
    );
    expect((await build({ target: 'claude', mode: 'full', scope: 'upToMessage', delivery: 'inline' })).text).not.toContain(
      'msg1',
    );
  });
});

/**
 * Continuing a conversation elsewhere is not the same as pasting it there.
 * With attachment delivery the transcript travels as a file and the composer
 * carries one sentence, so the target starts with the history in hand and the
 * user's own next message is the only thing they have to write.
 */
describe('attachment delivery', () => {
  const build = createTransferPackageBuilder({
    conversation: conversation(4),
    cutIndex: 3,
    language: 'en',
  });

  it('puts the transcript in a file and a single note in the composer', async () => {
    const pkg = await build({
      target: 'claude',
      mode: 'full',
      scope: 'whole',
      delivery: 'attachment',
    });

    expect(pkg.contextFile?.name).toBe('chatgpt-conversation.md');
    expect(pkg.contextFile?.text).toContain('msg0');
    expect(pkg.contextFile?.text).toContain('msg3');
    // The composer gets the sentence that makes the file make sense, not the
    // conversation itself.
    expect(pkg.text).toContain('chatgpt-conversation.md');
    expect(pkg.text).not.toContain('msg0');
    expect(pkg.text.length).toBeLessThan((pkg.contextFile?.text.length ?? 0) / 2);
  });

  it('names the open request in the note, so the target knows what to do', async () => {
    const pkg = await build({
      target: 'gemini',
      mode: 'full',
      scope: 'whole',
      delivery: 'attachment',
    });
    expect(pkg.text).toContain('Where we left off:');
  });

  it('carries the whole package inline when delivery is inline', async () => {
    const pkg = await build({
      target: 'claude',
      mode: 'full',
      scope: 'whole',
      delivery: 'inline',
    });
    expect(pkg.contextFile).toBeUndefined();
    expect(pkg.text).toContain('msg0');
  });

  it('estimates the same size either way — the context travels, however it travels', async () => {
    const asFile = await build({ target: 'claude', mode: 'full', scope: 'whole', delivery: 'attachment' });
    const asText = await build({ target: 'claude', mode: 'full', scope: 'whole', delivery: 'inline' });
    expect(asFile.estimatedTokens).toBe(asText.estimatedTokens);
  });
});

/**
 * Relay: the leg-by-leg form of a round trip. The first hand-off carries
 * everything; after that each leg carries only what the other side has missed,
 * which is what keeps a pair of assistants usable past the first exchange.
 */
describe('relay scope', () => {
  it('carries only the messages added since the last hand-off', () => {
    const slice = messagesInScope(conversation(6), 5, 'sinceLast', 3);
    expect(slice.map((m) => m.index)).toEqual([4, 5]);
  });

  it('carries everything on the first leg, when there is no "since" yet', () => {
    expect(messagesInScope(conversation(6), 5, 'sinceLast')).toHaveLength(6);
  });

  it('carries nothing when the other side is already up to date', () => {
    expect(messagesInScope(conversation(6), 5, 'sinceLast', 5)).toEqual([]);
  });

  it('builds a package from the new messages alone', async () => {
    const build = createTransferPackageBuilder({
      conversation: conversation(4),
      cutIndex: 3,
      language: 'en',
      relayedThrough: () => 2,
    });
    const pkg = await build({
      target: 'claude',
      mode: 'full',
      scope: 'sinceLast',
      delivery: 'inline',
    });

    expect(pkg.text).toContain('msg3');
    expect(pkg.text).not.toContain('msg0');
  });

  it('measures the budget against the leg, not the whole history', () => {
    // A long relayed conversation sending two new turns is a small transfer.
    expect(exceedsTransferBudget(conversation(40, 4000), 39, 'sinceLast', 37)).toBe(false);
    expect(exceedsTransferBudget(conversation(40, 4000), 39, 'whole', 37)).toBe(true);
  });
});

/**
 * Summarizing exists to rescue conversations too long to carry whole — which
 * are exactly the ones large enough for the model to refuse the request. The
 * transcript sent is trimmed first, so the mode fails for real reasons rather
 * than for being asked to read too much.
 */
describe('summary input is bounded', () => {
  it('trims an enormous conversation before sending it', async () => {
    const sent: string[] = [];
    const summarize: Summarizer = async (transcript) => {
      sent.push(transcript);
      return { ok: true, summary: 'brief' };
    };
    // Far past the budget: 200 messages of 4,000 characters each.
    const build = createTransferPackageBuilder({
      conversation: conversation(200, 4000),
      cutIndex: 199,
      language: 'en',
      summarize,
    });

    await build({ target: 'claude', mode: 'summary', scope: 'whole', delivery: 'inline' });

    expect(sent[0]?.length).toBeGreaterThan(0);
    expect(estimateTokens(sent[0] ?? '')).toBeLessThanOrEqual(SUMMARY_INPUT_BUDGET * 1.01);
  });

  it('sends a normal conversation untouched', async () => {
    const sent: string[] = [];
    const summarize: Summarizer = async (transcript) => {
      sent.push(transcript);
      return { ok: true, summary: 'brief' };
    };
    const build = createTransferPackageBuilder({
      conversation: conversation(4),
      cutIndex: 3,
      language: 'en',
      summarize,
    });

    await build({ target: 'claude', mode: 'summary', scope: 'whole', delivery: 'inline' });

    expect(sent[0]).toContain('msg0');
    expect(sent[0]).toContain('msg3');
  });
})

describe('transfer package builder — documents carried as text', () => {
  const doc = {
    name: 'rapor.pdf',
    pageCount: 2,
    lines: [
      { text: 'Yöntem', page: 1, heading: true },
      { text: 'Etiketleme üç sınıftan oluşur.', page: 1 },
      { text: 'Sonuç', page: 2, heading: true },
      { text: 'Uyum orta düzeydedir.', page: 2 },
    ],
  };

  it('puts the documents into the context file, and counts their tokens', async () => {
    const loadDocuments = vi.fn(async () => [doc]);
    const build = createTransferPackageBuilder({ conversation: conversation(2), cutIndex: 1, language: 'en', loadDocuments });
    const without = await build({ target: 'claude', mode: 'full', scope: 'whole', delivery: 'attachment' });
    const withDocs = await build({ target: 'claude', mode: 'full', scope: 'whole', delivery: 'attachment', documentIds: ['a1'] });

    expect(loadDocuments).toHaveBeenCalledWith(['a1']);
    expect(withDocs.contextFile?.text).toContain('### rapor.pdf');
    expect(withDocs.contextFile?.text).toContain('Etiketleme üç sınıftan oluşur.');
    expect(withDocs.estimatedTokens).toBeGreaterThan(without.estimatedTokens);
  });

  it('puts them into the composer text when delivering inline', async () => {
    const build = createTransferPackageBuilder({ conversation: conversation(2), cutIndex: 1, language: 'en', loadDocuments: async () => [doc] });
    const result = await build({ target: 'gemini', mode: 'full', scope: 'whole', delivery: 'inline', documentIds: ['a1'] });
    expect(result.text).toContain('## Documents from the conversation');
  });

  it('adds nothing when no document could be read', async () => {
    const build = createTransferPackageBuilder({ conversation: conversation(2), cutIndex: 1, language: 'en', loadDocuments: async () => [] });
    const result = await build({ target: 'gemini', mode: 'full', scope: 'whole', delivery: 'inline', documentIds: ['img'] });
    expect(result.text).not.toContain('Documents');
  });
});

describe('transfer package builder — compact context', () => {
  const turkish = createConversation({
    id: 'c-tr',
    sourcePlatform: 'chatgpt',
    createdAt: '2026-11-20T00:00:00.000Z',
    messages: [
      { role: 'user', content: 'Türkçe hakemlik çalışması nasıl planlanır, ayrıntılı anlatır mısın?', index: 0, attachmentRefs: [] },
      { role: 'assistant', content: 'Önce etiketleme şemasını belirlemelisin; ardından yirmi soruluk bir pilot çalışma yürütmelisin.', index: 1, attachmentRefs: [] },
      { role: 'user', content: 'Şemayı nasıl sadeleştiririm?', index: 2, attachmentRefs: [] },
    ],
    attachments: [],
  });
  // A stand-in translator: the English wording a real one would produce.
  const english: Record<string, string> = {
    'Türkçe hakemlik çalışması nasıl planlanır, ayrıntılı anlatır mısın?': 'How do I plan a Turkish judging study, in detail?',
    'Önce etiketleme şemasını belirlemelisin; ardından yirmi soruluk bir pilot çalışma yürütmelisin.': 'First settle the labeling scheme; then run a twenty-question pilot.',
  };
  const translator = async () => async (text: string) => english[text] ?? text;

  it('carries earlier messages in English, the last as written, and asks for a Turkish reply', async () => {
    const build = createTransferPackageBuilder({ conversation: turkish, cutIndex: 2, language: 'tr', compact: { from: 'tr', translator } });
    const result = await build({ target: 'claude', mode: 'full', scope: 'whole', delivery: 'inline', compact: true });
    expect(result.text).toContain('How do I plan a Turkish judging study');
    expect(result.text).not.toContain('ayrıntılı anlatır mısın');
    expect(result.text).toContain('Şemayı nasıl sadeleştiririm?');
    expect(result.text).toContain('Reply to me in Turkish.');
  });

  it('reports the saving against the untranslated package', async () => {
    const build = createTransferPackageBuilder({ conversation: turkish, cutIndex: 2, language: 'tr', compact: { from: 'tr', translator } });
    const result = await build({ target: 'chatgpt', mode: 'full', scope: 'whole', delivery: 'attachment', compact: true });
    expect(result.uncompactedTokens).toBeGreaterThan(result.estimatedTokens);
    expect(result.text).toContain('Reply to me in Turkish.');
  });

  it('falls back to the original language, and says so, when there is no translator', async () => {
    const build = createTransferPackageBuilder({
      conversation: turkish,
      cutIndex: 2,
      language: 'tr',
      compact: { from: 'tr', translator: async () => null },
    });
    const result = await build({ target: 'gemini', mode: 'full', scope: 'whole', delivery: 'inline', compact: true });
    expect(result.compactFailed).toBe(true);
    expect(result.text).toContain('ayrıntılı anlatır mısın');
    expect(result.text).not.toContain('Reply to me in');
  });

  it('changes nothing when compact is not asked for', async () => {
    const build = createTransferPackageBuilder({ conversation: turkish, cutIndex: 2, language: 'tr', compact: { from: 'tr', translator } });
    const result = await build({ target: 'claude', mode: 'full', scope: 'whole', delivery: 'inline' });
    expect(result.text).toContain('ayrıntılı anlatır mısın');
    expect(result.uncompactedTokens).toBeUndefined();
  });
});
