// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GenericAdapter } from './adapter';

/**
 * A site this extension has never seen: no selectors, no adapter written for
 * it, nothing in config. Everything here is what a user gets the moment they
 * add a site of their own.
 */
const UNKNOWN_SITE = `
  <nav><a href="/">New thread</a></nav>
  <main>
    <div class="turn">How do I reverse a list in Rust?</div>
    <div class="turn">Use <code>iter().rev()</code>, or <code>reverse()</code> to do it in place.
      The first borrows, the second mutates, and which you want depends on whether anyone else
      is holding the list.</div>
    <div class="turn">In place, thanks.</div>
    <div class="turn">Then <code>v.reverse()</code> is the one. It is O(n) and allocates nothing.</div>
  </main>
  <footer><div id="composer" contenteditable="true"></div></footer>
`;

// happy-dom has no layout, so every element measures zero and would be judged
// invisible. The adapter reads the live document, so the geometry is stubbed
// at the source rather than injected.
function giveEverythingASize(): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const isComposer = this.id === 'composer';
    return {
      top: isComposer ? 900 : 100,
      left: 0,
      right: 800,
      bottom: 0,
      width: 800,
      height: 40,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = UNKNOWN_SITE;
  giveEverythingASize();
});

describe('GenericAdapter', () => {
  const adapter = () => new GenericAdapter('site:example.ai');

  it('reads a conversation from a site with no selectors written for it', async () => {
    const conversation = await adapter().readConversation();

    expect(conversation.messages).toHaveLength(4);
    expect(conversation.messages[0]?.content).toContain('reverse a list in Rust');
    expect(conversation.messages[3]?.content).toContain('`v.reverse()`');
  });

  it('alternates roles, because a dialogue is what a chat page is', async () => {
    const conversation = await adapter().readConversation();
    expect(conversation.messages.map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
    ]);
  });

  it('records the conversation against the site the user added', async () => {
    expect((await adapter().readConversation()).sourcePlatform).toBe('site:example.ai');
  });

  it('is ready when there is somewhere to type', async () => {
    expect(await adapter().isReady()).toBe(true);
  });

  it('types into the composer it found, without being told where it is', async () => {
    // happy-dom has no execCommand, which is the path contenteditable takes.
    const execCommand = vi.fn();
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });

    await adapter().injectText('next question');
    expect(execCommand).toHaveBeenCalledWith('insertText', false, 'next question');
  });

  it('refuses to type when it cannot find a composer, instead of failing silently', async () => {
    document.body.innerHTML = '<main><p>Just an article</p></main>';
    await expect(adapter().injectText('hello')).rejects.toThrow(/no composer/);
  });

  it('reports a page with nowhere to type as broken, and says which part', async () => {
    document.body.innerHTML = '<main><p>Just an article</p></main>';
    const health = await adapter().healthCheck();

    expect(health.ok).toBe(false);
    expect(health.brokenSelectors).toEqual(['composer']);
  });

  it('is healthy on an empty chat, where there are no turns yet', async () => {
    document.body.innerHTML = '<footer><div id="composer" contenteditable="true"></div></footer>';
    const health = await adapter().healthCheck();

    expect(health.ok).toBe(true);
    expect(health.brokenSelectors).toEqual([]);
  });

  it('claims only what it can actually do', () => {
    // It cannot know an unknown site's model picker or new-chat route, so it
    // does not pretend to: the UI degrades on false and breaks on a lie.
    expect(adapter().capabilities.readModelMode).toBe(false);
    expect(adapter().capabilities.openNewChat).toBe(false);
    expect(adapter().capabilities.readConversation).toBe(true);
  });
});
