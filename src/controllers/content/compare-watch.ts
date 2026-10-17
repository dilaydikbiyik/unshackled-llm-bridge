import type { PlatformAdapter } from '@adapters/types';

/**
 * Catching the answer to a prompt the extension injected for a comparison.
 *
 * Three things make this harder than "read the last message". The answer
 * streams, so it is wrong for most of the time it exists. The watcher cannot
 * ask the page whether generation has finished — that is a per-platform
 * question, and this must work on a site nobody has written selectors for. And
 * the user keeps using the tab afterwards, so a watcher that never stops will
 * eventually report a later, unrelated answer as the comparison's.
 *
 * So: take the first assistant turn that appears after the prompt was
 * injected, let it settle, report it once, and stop.
 */
export const ANSWER_STABLE_MS = 1500;
export const ANSWER_TIMEOUT_MS = 10 * 60 * 1000;

type Timer = ReturnType<typeof setTimeout>;

export interface AnswerWatchDeps {
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => Timer;
  clearTimer?: (timer: Timer) => void;
  stableMs?: number;
  timeoutMs?: number;
}

type WatchedAdapter = Pick<PlatformAdapter, 'observeMessages' | 'readConversation'>;

export function watchForAnswer(
  adapter: WatchedAdapter,
  onAnswer: (content: string) => void | Promise<void>,
  deps: AnswerWatchDeps = {},
): () => void {
  const now = deps.now ?? (() => Date.now());
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((timer) => clearTimeout(timer));
  const stableMs = deps.stableMs ?? ANSWER_STABLE_MS;
  const timeoutMs = deps.timeoutMs ?? ANSWER_TIMEOUT_MS;

  const startedAt = now();
  /** Assistant turns already on the page: the answer is the one after these. */
  let baseline: number | null = null;
  let settle: Timer | null = null;
  let finished = false;
  let stopObserving: (() => void) | null = null;

  const stop = (): void => {
    finished = true;
    if (settle !== null) clearTimer(settle);
    settle = null;
    stopObserving?.();
  };

  stopObserving = adapter.observeMessages(() => {
    if (finished) return;
    void (async () => {
      if (now() - startedAt > timeoutMs) return stop();

      const assistantTurns = (await adapter.readConversation()).messages.filter(
        (message) => message.role === 'assistant',
      );
      if (baseline === null) {
        baseline = assistantTurns.length;
        return;
      }

      const answer = assistantTurns[baseline];
      if (!answer || answer.content.trim() === '') return;

      // Rescheduled on every change: when the changes stop, this fires. It is
      // the only completion signal available without knowing the platform.
      if (settle !== null) clearTimer(settle);
      settle = setTimer(() => {
        if (finished) return;
        stop();
        void onAnswer(answer.content);
      }, stableMs);
    })();
  });

  return stop;
}
