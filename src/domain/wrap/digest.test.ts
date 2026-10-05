import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@domain/conversation/schema';
import { digestConversation, digestLines } from './digest';

const msg = (role: ChatMessage['role'], content: string, index: number): ChatMessage => ({
  role,
  content,
  index,
  attachmentRefs: [],
});

describe('digestConversation', () => {
  it('counts code blocks and ranks their languages by frequency', () => {
    const digest = digestConversation([
      msg('user', 'fix this\n```python\nx = 1\n```', 0),
      msg('assistant', '```python\ny = 2\n```\nand\n```sql\nSELECT 1\n```', 1),
    ]);
    expect(digest.codeBlockCount).toBe(3);
    expect(digest.codeLanguages).toEqual(['python', 'sql']);
  });

  it('takes the open request from the last user message, not the last message', () => {
    const digest = digestConversation([
      msg('user', 'first ask', 0),
      msg('user', 'translate this sentence', 1),
      msg('assistant', 'Here you go.', 2),
    ]);
    expect(digest.openRequest).toBe('translate this sentence');
  });

  it('strips code and markup out of the open request', () => {
    const digest = digestConversation([msg('user', '**Fix** the `parser`\n```js\nbad()\n```', 0)]);
    expect(digest.openRequest).toBe('Fix the parser');
  });

  it('truncates a long request rather than repeating the whole message', () => {
    const digest = digestConversation([msg('user', 'word '.repeat(200), 0)]);
    expect(digest.openRequest?.length).toBeLessThanOrEqual(281);
    expect(digest.openRequest?.endsWith('…')).toBe(true);
  });

  it('reports no open request for a conversation the user never spoke in', () => {
    expect(digestConversation([msg('assistant', 'hello', 0)]).openRequest).toBeNull();
  });
});

describe('digestLines', () => {
  it('states only what the conversation actually has', () => {
    const lines = digestLines(digestConversation([msg('user', 'hi', 0)]));
    expect(lines).toEqual(['Turns carried: 1', 'What I need next: hi']);
  });

  it('names the files travelling with the package', () => {
    const lines = digestLines(digestConversation([msg('user', 'review it', 0)], ['spec.pdf']));
    expect(lines).toContain('Files carried over: spec.pdf');
  });
});

describe('digestLines — summarized transfers', () => {
  // Summarizing exists so the user's own words do not travel verbatim. The
  // brief must not reintroduce them through the back door.
  it('leaves the open request out when a summary replaces the transcript', () => {
    const digest = digestConversation([msg('user', 'my private question', 0)]);
    expect(digestLines(digest, false).join(' ')).not.toContain('my private question');
    expect(digestLines(digest, false)).toContain('Turns carried: 1');
  });
});
