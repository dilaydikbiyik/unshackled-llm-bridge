// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformSelectors } from '@data/config/selector-config';
import { ChatGptAdapter } from './chatgpt/adapter';

/**
 * Shared adapter plumbing, exercised through a concrete adapter with minimal
 * selectors so each test controls exactly which targets resolve.
 */
const selectors: PlatformSelectors = {
  composer: ['#composer'],
  newChatButton: ['#new-chat'],
  modelLabel: ['#model'],
  dropZone: ['#drop'],
  messageContainer: ['article'],
};

const adapter = () => new ChatGptAdapter(selectors);

afterEach(() => {
  document.body.innerHTML = '';
  history.pushState({}, '', '/');
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('readiness', () => {
  it('is ready once the composer exists', async () => {
    document.body.innerHTML = '<textarea id="composer"></textarea>';
    expect(await adapter().isReady()).toBe(true);
  });

  it('is not ready while the composer is missing', async () => {
    expect(await adapter().isReady()).toBe(false);
  });
});

describe('composer injection', () => {
  it('writes into a textarea and fires an input event the framework will see', async () => {
    document.body.innerHTML = '<textarea id="composer"></textarea>';
    const composer = document.getElementById('composer') as HTMLTextAreaElement;
    const onInput = vi.fn();
    composer.addEventListener('input', onInput);

    await adapter().injectText('continue from here');

    expect(composer.value).toBe('continue from here');
    expect(onInput).toHaveBeenCalledOnce();
  });

  it('uses insertText for contenteditable editors, which ignore textContent writes', async () => {
    document.body.innerHTML = '<div id="composer" contenteditable="true"></div>';
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });

    await adapter().injectText('hello');

    expect(execCommand).toHaveBeenCalledWith('insertText', false, 'hello');
  });

  it('throws when no composer resolves, so the caller can fall back to the clipboard', async () => {
    // The wording is selector-agnostic now: a generic adapter finds its
    // composer heuristically, and can fail the same way.
    await expect(adapter().injectText('x')).rejects.toThrow(/no composer found/);
  });

  it('never clicks send — injection stops at the composer', async () => {
    document.body.innerHTML =
      '<textarea id="composer"></textarea><button id="send">send</button>';
    const onSend = vi.fn();
    document.getElementById('send')!.addEventListener('click', onSend);

    await adapter().injectText('x');
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe('model reading', () => {
  it('reads the model picker label', async () => {
    document.body.innerHTML = '<button id="model">  GPT-5  </button>';
    expect(await adapter().getModelMode()).toEqual({ model: 'GPT-5' });
  });

  it('returns nothing rather than guessing when the label is absent', async () => {
    expect(await adapter().getModelMode()).toEqual({});
  });
});

describe('new chat', () => {
  it('clicks the platform new-chat control when present', async () => {
    document.body.innerHTML = '<a id="new-chat">new</a>';
    const onClick = vi.fn((e: Event) => e.preventDefault());
    document.getElementById('new-chat')!.addEventListener('click', onClick);

    await adapter().openNewChat();
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe('file replay target', () => {
  it('throws when neither a drop zone nor a composer exists', async () => {
    await expect(adapter().uploadFile(new Blob(['x']), 'x.txt')).rejects.toThrow(
      /does not implement uploadFile/,
    );
  });
});

describe('health check', () => {
  it('names exactly the page-level targets that failed to resolve', async () => {
    document.body.innerHTML = '<textarea id="composer"></textarea>';
    const health = await adapter().healthCheck();

    expect(health.platform).toBe('chatgpt');
    expect(health.ok).toBe(false);
    expect(health.brokenSelectors.sort()).toEqual(['dropZone', 'newChatButton']);
  });

  it('never reports situational targets, which are absent in normal use', async () => {
    // Found by the live probe: an idle composer has no send button and the free
    // ChatGPT plan has no model picker, so every idle page read as "degraded".
    document.body.innerHTML = '<textarea id="composer"></textarea><a id="new-chat"></a><div id="drop"></div>';
    const health = await new ChatGptAdapter({
      ...selectors,
      sendButton: ['#send'],
      artifactCell: ['#artifact'],
    }).healthCheck();
    expect(health.ok).toBe(true);
  });

  it('does not expect messages on a new, empty chat', async () => {
    document.body.innerHTML = '<textarea id="composer"></textarea><a id="new-chat"></a><div id="drop"></div>';
    expect((await adapter().healthCheck()).brokenSelectors).not.toContain('messageContainer');
  });

  it('does expect messages on a conversation page', async () => {
    // The ChatGPT <article> → <section> drift looked exactly like this.
    history.pushState({}, '', '/c/abc123');
    document.body.innerHTML = '<textarea id="composer"></textarea><a id="new-chat"></a><div id="drop"></div>';
    expect((await adapter().healthCheck()).brokenSelectors).toContain('messageContainer');
  });

  it('reports healthy when every target resolves', async () => {
    document.body.innerHTML = `
      <textarea id="composer"></textarea><a id="new-chat"></a><button id="model"></button>
      <div id="drop"></div><article></article>`;
    const health = await adapter().healthCheck();
    expect(health.ok).toBe(true);
    expect(health.brokenSelectors).toEqual([]);
  });
});

describe('message observation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<main></main>';
  });

  it('debounces a burst of DOM mutations into one callback', async () => {
    const onChange = vi.fn();
    adapter().observeMessages(onChange);

    const main = document.querySelector('main')!;
    for (let i = 0; i < 5; i += 1) main.appendChild(document.createElement('p'));
    await vi.advanceTimersByTimeAsync(350);

    expect(onChange).toHaveBeenCalledOnce();
  });

  it('stops calling back after unsubscribe', async () => {
    const onChange = vi.fn();
    const stop = adapter().observeMessages(onChange);
    stop();

    document.querySelector('main')!.appendChild(document.createElement('p'));
    await vi.advanceTimersByTimeAsync(350);

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('health check — partial matches', () => {
  // Regression for the live Claude bug: a selector matching only user turns
  // passed the resolve check while every assistant reply was being dropped.
  const turn = (role: string) =>
    `<article><div data-message-author-role="${role}"><p>${role}</p></div></article>`;

  it('flags a conversation with several user turns and no assistant turns', async () => {
    document.body.innerHTML = turn('user') + turn('user');
    const health = await adapter().healthCheck();
    expect(health.ok).toBe(false);
    expect(health.brokenSelectors).toContain('messageContainer (no assistant turns)');
  });

  it('does not flag a single unanswered turn — that is normal mid-generation', async () => {
    document.body.innerHTML = turn('user');
    const health = await adapter().healthCheck();
    expect(health.brokenSelectors.some((s) => s.startsWith('messageContainer ('))).toBe(false);
  });

  it('accepts a normal alternating conversation', async () => {
    document.body.innerHTML = turn('user') + turn('assistant') + turn('user') + turn('assistant');
    const health = await adapter().healthCheck();
    expect(health.brokenSelectors.some((s) => s.startsWith('messageContainer ('))).toBe(false);
  });
});
