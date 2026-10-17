import { describe, expect, it, vi } from 'vitest';
import { createConversation, type ChatMessage } from '@domain/conversation/schema';
import { watchForAnswer } from './compare-watch';

/**
 * A fake page: the test drives what the adapter would read and when the
 * observer fires, which is the only way to exercise streaming, settling and
 * the user carrying on afterwards.
 */
function page() {
  let messages: ChatMessage[] = [];
  let fire: () => void = () => undefined;
  let stopped = false;

  const adapter = {
    observeMessages: (onChange: () => void) => {
      fire = onChange;
      return () => {
        stopped = true;
      };
    },
    readConversation: async () =>
      createConversation({
        id: 'claude-1',
        sourcePlatform: 'claude',
        createdAt: '2026-10-18T00:00:00Z',
        messages,
        attachments: [],
      }),
  };

  const say = (role: 'user' | 'assistant', content: string) => {
    messages = [...messages, { role, content, index: messages.length, attachmentRefs: [] }];
  };
  const amend = (content: string) => {
    const last = messages.at(-1);
    if (last) messages = [...messages.slice(0, -1), { ...last, content }];
  };

  return { adapter, say, amend, tick: async () => { fire(); await Promise.resolve(); await Promise.resolve(); }, get stopped() { return stopped; } };
}

/** A clock the test moves, so settling is exercised without waiting. */
function clock() {
  let at = 0;
  const pending: { due: number; fn: () => void }[] = [];
  return {
    now: () => at,
    setTimer: ((fn: () => void, ms: number) => {
      const entry = { due: at + ms, fn };
      pending.push(entry);
      return entry as never;
    }) as never,
    clearTimer: ((timer: never) => {
      const at_ = pending.indexOf(timer as unknown as { due: number; fn: () => void });
      if (at_ >= 0) pending.splice(at_, 1);
    }) as never,
    advance: (ms: number) => {
      at += ms;
      for (const entry of [...pending]) {
        if (entry.due <= at) {
          pending.splice(pending.indexOf(entry), 1);
          entry.fn();
        }
      }
    },
  };
}

describe('watchForAnswer', () => {
  it('reports the answer once it stops changing', async () => {
    const { adapter, say, amend, tick } = page();
    const time = clock();
    const onAnswer = vi.fn();
    watchForAnswer(adapter, onAnswer, { ...time, stableMs: 1500 });

    await tick(); // baseline: nothing yet
    say('user', 'Which database?');
    say('assistant', 'Postgres');
    await tick();
    amend('Postgres, for a small SaaS.');
    await tick();

    expect(onAnswer).not.toHaveBeenCalled(); // still streaming
    time.advance(1500);
    expect(onAnswer).toHaveBeenCalledWith('Postgres, for a small SaaS.');
  });

  it('reports a short answer, which a length threshold would have dropped', async () => {
    const { adapter, say, tick } = page();
    const time = clock();
    const onAnswer = vi.fn();
    watchForAnswer(adapter, onAnswer, { ...time, stableMs: 1000 });

    await tick();
    say('user', 'Postgres or MySQL?');
    say('assistant', 'Postgres.');
    await tick();
    time.advance(1000);

    expect(onAnswer).toHaveBeenCalledWith('Postgres.');
  });

  it('stops after reporting, so later chat is not mistaken for the answer', async () => {
    const { adapter, say, tick, stopped } = page();
    void stopped;
    const time = clock();
    const onAnswer = vi.fn();
    watchForAnswer(adapter, onAnswer, { ...time, stableMs: 500 });

    await tick();
    say('user', 'Which database?');
    say('assistant', 'Postgres.');
    await tick();
    time.advance(500);
    expect(onAnswer).toHaveBeenCalledTimes(1);

    // The user keeps working in this tab.
    say('user', 'And for caching?');
    say('assistant', 'Redis, usually.');
    await tick();
    time.advance(5000);

    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith('Postgres.');
  });

  it('ignores answers that were already on the page', async () => {
    const { adapter, say, tick } = page();
    const time = clock();
    const onAnswer = vi.fn();

    say('user', 'earlier question');
    say('assistant', 'an earlier answer that has nothing to do with the comparison');
    watchForAnswer(adapter, onAnswer, { ...time, stableMs: 500 });

    await tick(); // baseline counts the existing answer
    time.advance(5000);
    expect(onAnswer).not.toHaveBeenCalled();

    say('user', 'the injected prompt');
    say('assistant', 'the answer being compared');
    await tick();
    time.advance(500);

    expect(onAnswer).toHaveBeenCalledWith('the answer being compared');
  });

  it('gives up after the timeout rather than watching the tab forever', async () => {
    const { adapter, say, tick } = page();
    const time = clock();
    const onAnswer = vi.fn();
    watchForAnswer(adapter, onAnswer, { ...time, stableMs: 500, timeoutMs: 1000 });

    await tick();
    time.advance(2000);
    say('user', 'late question');
    say('assistant', 'late answer');
    await tick();
    time.advance(5000);

    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('can be stopped by its caller', async () => {
    const { adapter, say, tick } = page();
    const time = clock();
    const onAnswer = vi.fn();
    const stop = watchForAnswer(adapter, onAnswer, { ...time, stableMs: 500 });

    await tick();
    stop();
    say('user', 'q');
    say('assistant', 'a');
    await tick();
    time.advance(5000);

    expect(onAnswer).not.toHaveBeenCalled();
  });
});
