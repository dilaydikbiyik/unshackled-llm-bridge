// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import selectorConfig from '../../../config/selectors.json';
import type { PlatformSelectors } from '@models/config/selector-config';
import { ChatGptAdapter } from './adapter';

/**
 * Fixture mirrors chatgpt.com DOM as of the selector config version. When a
 * live selector breaks, update config/selectors.json AND this fixture together.
 */
const FIXTURE = `
<main>
  <article data-testid="conversation-turn-1">
    <div data-message-author-role="user">
      <div class="whitespace-pre-wrap">Write me a fibonacci function in Python</div>
    </div>
  </article>
  <article data-testid="conversation-turn-2">
    <div data-message-author-role="assistant">
      <div class="markdown">
        <p>Sure, here is an <strong>iterative</strong> version:</p>
        <pre><div class="contain-inline-size"><div class="flex">python<button>Copy code</button></div><div><code class="language-python">def fib(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a</code></div></div></pre>
        <p>It runs in <code>O(n)</code> time.</p>
      </div>
    </div>
  </article>
</main>
`;

const selectors = selectorConfig.platforms.chatgpt as PlatformSelectors;

describe('ChatGptAdapter.readConversation', () => {
  beforeEach(() => {
    document.body.innerHTML = FIXTURE;
  });

  it('parses roles and message order from the DOM', async () => {
    const conversation = await new ChatGptAdapter(selectors).readConversation();
    expect(conversation.sourcePlatform).toBe('chatgpt');
    expect(conversation.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(conversation.messages.map((m) => m.index)).toEqual([0, 1]);
  });

  it('preserves code blocks as fenced markdown without copy-button chrome', async () => {
    const conversation = await new ChatGptAdapter(selectors).readConversation();
    const assistant = conversation.messages[1]?.content ?? '';
    expect(assistant).toContain('```python\ndef fib(n):');
    expect(assistant).toContain('**iterative**');
    expect(assistant).toContain('`O(n)`');
    expect(assistant).not.toContain('Copy code');
  });

  it('returns an empty message list on a fresh chat page', async () => {
    document.body.innerHTML = '<main></main>';
    const conversation = await new ChatGptAdapter(selectors).readConversation();
    expect(conversation.messages).toEqual([]);
  });
});
