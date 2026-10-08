import { describe, expect, it } from 'vitest';
import { createConversation, type BridgeConversation } from '@domain/conversation/schema';
import type { PlatformId } from '@domain/platforms';
import { distilMemory, draftProfileText, TOPIC_LIMIT } from './distil';

function chat(
  platform: PlatformId,
  userTexts: string[],
  options: { createdAt?: string; assistant?: string[] } = {},
): BridgeConversation {
  const messages = userTexts.map((content, index) => ({
    role: 'user' as const,
    content,
    index,
    attachmentRefs: [],
  }));
  (options.assistant ?? []).forEach((content, i) =>
    messages.push({
      role: 'assistant' as never,
      content,
      index: messages.length + i,
      attachmentRefs: [],
    }),
  );
  return createConversation({
    id: `${platform}-${userTexts.join('').slice(0, 6)}`,
    sourcePlatform: platform,
    createdAt: options.createdAt ?? '2026-05-01T00:00:00Z',
    messages,
    attachments: [],
  });
}

describe('distilMemory', () => {
  it('counts the platforms the user actually works on, busiest first', () => {
    const profile = distilMemory([
      chat('chatgpt', ['hello there']),
      chat('claude', ['hello again']),
      chat('claude', ['hello once more']),
    ]);

    expect(profile.platforms).toEqual([
      { platform: 'claude', conversations: 2 },
      { platform: 'chatgpt', conversations: 1 },
    ]);
  });

  it('keeps a subject that recurs across conversations', () => {
    const profile = distilMemory([
      chat('chatgpt', ['questions about kubernetes scheduling']),
      chat('claude', ['more kubernetes trouble']),
      chat('gemini', ['kubernetes again, sorry']),
    ]);

    expect(profile.topics).toContain('kubernetes');
  });

  it('ignores a word that only one conversation was about', () => {
    // Repeating a word inside one thread says what that thread was, not what
    // the person keeps coming back to.
    const profile = distilMemory([
      chat('chatgpt', ['parsnips parsnips parsnips', 'parsnips once more', 'parsnips']),
      chat('claude', ['something else entirely']),
      chat('gemini', ['another unrelated thing']),
    ]);

    expect(profile.topics).not.toContain('parsnips');
  });

  it('describes the person, not the assistant', () => {
    // Counting the model's prose would profile the model's vocabulary.
    const profile = distilMemory([
      chat('chatgpt', ['short question'], { assistant: ['certainly certainly certainly'] }),
      chat('claude', ['short question'], { assistant: ['certainly certainly'] }),
      chat('gemini', ['short question'], { assistant: ['certainly'] }),
    ]);

    expect(profile.topics).not.toContain('certainly');
  });

  it('notices the languages code arrives in, from either side', () => {
    const profile = distilMemory([
      chat('chatgpt', ['fix this\n```python\nx=1\n```']),
      chat('claude', ['and this'], { assistant: ['```python\ny=2\n```\n```rust\nlet z = 3;\n```'] }),
    ]);

    expect(profile.codeLanguages).toEqual(['python', 'rust']);
  });

  it('reports the span of the archive it was drawn from', () => {
    const profile = distilMemory([
      chat('chatgpt', ['one'], { createdAt: '2026-03-02T10:00:00Z' }),
      chat('claude', ['two'], { createdAt: '2026-09-09T10:00:00Z' }),
    ]);

    expect(profile.span).toEqual({ from: '2026-03-02', to: '2026-09-09' });
  });

  it('stays short enough to read', () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      chat('chatgpt', [`subject${String(i % 20)} recurring words here`]),
    );
    expect(distilMemory(many).topics.length).toBeLessThanOrEqual(TOPIC_LIMIT);
  });

  it('has nothing to say about an empty archive, and says nothing', () => {
    const profile = distilMemory([]);
    expect(profile).toMatchObject({ conversationCount: 0, topics: [], span: null });
    expect(draftProfileText(profile)).toBe('');
  });
});

describe('draftProfileText', () => {
  it('states what was counted, and hands the wording back to the user', () => {
    const text = draftProfileText(
      distilMemory([
        chat('chatgpt', ['kubernetes again\n```go\nmain()\n```']),
        chat('claude', ['kubernetes still']),
        chat('gemini', ['kubernetes forever']),
      ]),
    );

    expect(text).toContain('ChatGPT');
    expect(text).toContain('kubernetes');
    expect(text).toContain('go');
    expect(text).toContain('3 of my own conversations');
    expect(text).toContain('mine, not a platform');
  });
});
