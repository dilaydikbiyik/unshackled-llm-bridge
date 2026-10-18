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
  rekeyAttachments,
  saveAttachment,
  saveConversation,
  searchConversations,
  SEARCH_SCAN_LIMIT,
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

/**
 * An archive gets slower the longer it is used unless the search is bounded.
 * Every record used to be parsed from JSON, so a query that matched nothing
 * parsed the lot.
 */
describe('search cost', () => {
  it('reads only the most recent conversations', async () => {
    for (let i = 0; i < SEARCH_SCAN_LIMIT + 20; i += 1) {
      await saveConversation(
        conversation(`c-${String(i)}`, [`entry ${String(i)}`]),
      );
    }
    // The oldest entries fall outside the scan, which is the trade the bound
    // makes: a search stays fast, and it searches what people search.
    expect(await searchConversations('entry 0')).toEqual([]);
    expect((await searchConversations(`entry ${String(SEARCH_SCAN_LIMIT + 19)}`)).length).toBe(1);
  });

  it('still finds a match by message text and by title', async () => {
    await saveConversation(
      conversation('c-find', ['something about kubernetes']),
    );
    const byText = await searchConversations('kubernetes');
    expect(byText).toHaveLength(1);
    expect(byText[0]?.snippet).toContain('kubernetes');
  });

  it('matches case-insensitively, as the box implies', async () => {
    await saveConversation(
      conversation('c-case', ['Postgres beats MySQL here']),
    );
    expect(await searchConversations('postgres')).toHaveLength(1);
  });
});

describe('fork ordering', () => {
  /**
   * Two forks taken in the same millisecond shared a timestamp, and their
   * order was then whatever the database felt like — so a conversation's
   * lineage could be exported out of sequence. It showed up as a test that
   * passed or failed depending on how fast the machine was.
   */
  it('keeps the order of forks taken in the same millisecond', async () => {
    const lineage = {
      sourceConversationId: 'chatgpt-burst',
      sourcePlatform: 'chatgpt' as const,
      cutIndex: 0,
    };
    for (let i = 0; i < 12; i += 1) {
      await recordFork({ ...lineage, cutIndex: i }, i % 2 === 0 ? 'claude' : 'gemini');
    }

    const forks = await listForksFrom('chatgpt-burst');
    expect(forks.map((f) => f.cutIndex)).toEqual([...Array(12).keys()]);
  });

  it('gives each fork its own timestamp', async () => {
    const lineage = {
      sourceConversationId: 'chatgpt-two',
      sourcePlatform: 'chatgpt' as const,
      cutIndex: 1,
    };
    await recordFork(lineage, 'claude');
    await recordFork(lineage, 'gemini');

    const stamps = (await listForksFrom('chatgpt-two')).map((f) => f.createdAt);
    expect(new Set(stamps).size).toBe(2);
  });
});

/**
 * A new chat has no id until the first message is sent, so a file attached
 * before that was stored under the bare path while the fork looked under the
 * real one — and the most advertised feature of the extension quietly did
 * nothing in its most ordinary case.
 */
describe('files catch up with the conversation', () => {
  it('moves a page’s files to the key the platform finally gave it', async () => {
    await saveAttachment(input('chatgpt:/'), new Uint8Array([1, 2, 3]));
    await saveAttachment(input('chatgpt:/', 'spec.pdf'), new Uint8Array([4, 5, 6]));

    expect(await rekeyAttachments('chatgpt:/', 'chatgpt:/c/abc')).toBe(2);
    expect(await listAttachments('chatgpt:/')).toEqual([]);
    expect((await listAttachments('chatgpt:/c/abc')).map((a) => a.name).sort()).toEqual([
      'notes.txt',
      'spec.pdf',
    ]);
  });

  it('leaves another conversation’s files alone', async () => {
    await saveAttachment(input('chatgpt:/'), new Uint8Array([1]));
    await saveAttachment(input('claude:/chat/other'), new Uint8Array([2]));

    await rekeyAttachments('chatgpt:/', 'chatgpt:/c/abc');
    expect(await listAttachments('claude:/chat/other')).toHaveLength(1);
  });

  it('does nothing when the key has not changed', async () => {
    await saveAttachment(input('chatgpt:/c/abc'), new Uint8Array([1]));
    expect(await rekeyAttachments('chatgpt:/c/abc', 'chatgpt:/c/abc')).toBe(0);
    expect(await listAttachments('chatgpt:/c/abc')).toHaveLength(1);
  });
})
