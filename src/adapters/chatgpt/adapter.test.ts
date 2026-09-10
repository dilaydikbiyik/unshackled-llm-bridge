// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import selectorConfig from '../../../config/selectors.json';
import type { PlatformSelectors } from '@data/config/selector-config';
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

/**
 * Live markup, checked 2026-09-10: turns moved from <article> to <section>,
 * and the answer lives in a CSS-module node (`<hash>_DilResponseRoot`). The
 * suite above still passes against the old markup, which proves the fallback
 * candidates are reachable — each rule targets one kind of node, so a partial
 * match cannot mask a broken one.
 */
const LIVE_FIXTURE = `
<main>
  <section data-testid="conversation-turn-1">
    <div data-message-author-role="user"><div>Write an HTML report</div></div>
  </section>
  <section data-testid="conversation-turn-2">
    <div data-message-author-role="assistant">
      <div class="not-markdown">
        <div class="fv0XaG_DilRenderer fv0XaG_DilResponseRoot w-full">
          <p>Here is the <strong>report</strong>.</p>
          <p class="PSWZZq_Label">Summary</p>
        </div>
      </div>
      <button aria-label="Model değiştir">Model değiştir</button>
    </div>
  </section>
</main>
`;

describe('ChatGptAdapter.readConversation — live markup', () => {
  beforeEach(() => {
    document.body.innerHTML = LIVE_FIXTURE;
  });

  it('reads <section> turns', async () => {
    const conversation = await new ChatGptAdapter(selectors).readConversation();
    expect(conversation.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
  });

  it('takes the answer from the response root, leaving per-turn controls out', async () => {
    const conversation = await new ChatGptAdapter(selectors).readConversation();
    const answer = conversation.messages[1]?.content ?? '';
    expect(answer).toContain('**report**');
    expect(answer).toContain('Summary');
    expect(answer).not.toContain('Model değiştir');
  });
});

describe('ChatGptAdapter.readConversation — image-only turns', () => {
  it('keeps an image-only user turn visible instead of emitting an empty message', async () => {
    // Live check 2026-09-10: a screenshot sent with no text produced a turn
    // with zero text, which would have surfaced as a blank "Me:" line.
    document.body.innerHTML = `
      <section data-testid="conversation-turn-1">
        <div data-message-author-role="user"><img src="blob:x" alt=""></div>
      </section>`;
    const conversation = await new ChatGptAdapter(selectors).readConversation();
    expect(conversation.messages[0]?.content).toBe('[image]');
  });
});
