import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createConversation, type BridgeConversation } from '@domain/conversation/schema';
import { createDatabase } from './db';
import {
  getAttachment,
  getConversation,
  listAttachments,
  listForksFrom,
  recordFork,
  saveAttachment,
  saveConversation,
  searchConversations,
  useDatabase,
} from './repo';

let n = 0;
beforeEach(() => {
  // A fresh database per test, so no test sees another's rows.
  n += 1;
  useDatabase(createDatabase(`test-${n}-${Date.now()}`));
});

const input = (conversationKey: string, name = 'notes.txt') => ({
  name,
  mime: 'text/plain',
  size: 3,
  sourcePlatform: 'chatgpt' as const,
  conversationKey,
  capturedAt: '2026-09-11T10:00:00.000Z',
});

function conversation(id: string, messages: string[], title?: string): BridgeConversation {
  return createConversation({
    id,
    sourcePlatform: 'claude',
    ...(title ? { title } : {}),
    createdAt: '2026-09-11T08:00:00.000Z',
    messages: messages.map((content, index) => ({
      role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content,
      index,
      attachmentRefs: [],
    })),
    attachments: [],
  });
}

describe('attachments', () => {
  it('stores a file and returns it with its bytes intact', async () => {
    const meta = await saveAttachment(input('chatgpt:/c/a'), new Uint8Array([1, 2, 3]));
    const stored = await getAttachment(meta.id);
    expect(stored?.meta.name).toBe('notes.txt');
    expect(new Uint8Array(await stored!.blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(meta.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('deduplicates identical content within one conversation', async () => {
    const first = await saveAttachment(input('chatgpt:/c/a'), new Uint8Array([7, 7]));
    const again = await saveAttachment(input('chatgpt:/c/a', 'renamed.txt'), new Uint8Array([7, 7]));
    expect(again.id).toBe(first.id);
    expect(await listAttachments('chatgpt:/c/a')).toHaveLength(1);
  });

  it('keeps the same content separately for a different conversation', async () => {
    const a = await saveAttachment(input('chatgpt:/c/a'), new Uint8Array([7, 7]));
    const b = await saveAttachment(input('chatgpt:/c/b'), new Uint8Array([7, 7]));
    expect(b.id).not.toBe(a.id);
  });

  it('lists only the files captured in the given conversation', async () => {
    await saveAttachment(input('chatgpt:/c/a', 'one.txt'), new Uint8Array([1]));
    await saveAttachment(input('chatgpt:/c/b', 'two.txt'), new Uint8Array([2]));
    expect((await listAttachments('chatgpt:/c/a')).map((a) => a.name)).toEqual(['one.txt']);
  });

  it('returns null for a file that is not there', async () => {
    expect(await getAttachment('missing')).toBeNull();
  });
});

describe('archive', () => {
  it('round-trips a conversation through storage', async () => {
    const original = conversation('claude-1', ['hello', 'hi there'], 'Greeting');
    await saveConversation(original);
    expect(await getConversation('claude-1')).toEqual(original);
    expect(await getConversation('nope')).toBeNull();
  });

  it('titles an untitled conversation by its first line', async () => {
    await saveConversation(conversation('claude-2', ['Plan the Kyoto trip\nwith details', 'ok']));
    const [hit] = await searchConversations('');
    expect(hit?.title).toBe('Plan the Kyoto trip');
  });

  it('finds a conversation by message text, with a snippet around the match', async () => {
    await saveConversation(conversation('claude-3', ['intro', 'The answer is to use Postgres for this.']));
    await saveConversation(conversation('claude-4', ['something unrelated', 'nothing here']));
    const hits = await searchConversations('postgres');
    expect(hits.map((h) => h.id)).toEqual(['claude-3']);
    expect(hits[0]?.snippet).toContain('Postgres');
  });

  it('finds a conversation by title', async () => {
    await saveConversation(conversation('claude-5', ['a', 'b'], 'Database choice'));
    expect((await searchConversations('database')).map((h) => h.id)).toEqual(['claude-5']);
  });

  it('bounds the number of results', async () => {
    for (let i = 0; i < 5; i += 1) await saveConversation(conversation(`claude-${10 + i}`, ['x', 'y']));
    expect(await searchConversations('', 3)).toHaveLength(3);
  });
});

describe('fork lineage', () => {
  it('lists every fork taken from a conversation, oldest first', async () => {
    const lineage = { sourceConversationId: 'chatgpt-1', sourcePlatform: 'chatgpt' as const, cutIndex: 2 };
    await recordFork(lineage, 'claude');
    await recordFork({ ...lineage, cutIndex: 4 }, 'gemini');
    await recordFork({ ...lineage, sourceConversationId: 'other' }, 'claude');

    const forks = await listForksFrom('chatgpt-1');
    expect(forks.map((f) => [f.targetPlatform, f.cutIndex])).toEqual([
      ['claude', 2],
      ['gemini', 4],
    ]);
  });
});
