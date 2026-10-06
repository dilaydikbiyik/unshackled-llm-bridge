/**
 * Reading a chat UI nobody has written selectors for.
 *
 * Every chat interface converges on the same shape, because the shape follows
 * from the job: one editable box the user types into, and a column of repeated
 * blocks above it that alternate between two speakers. That shape is findable
 * without knowing the site, which is what lets this extension work on an AI
 * service it has never seen — and what stops the project from being a list of
 * three hard-coded platforms.
 *
 * These are heuristics, so they are honest about failing: each returns null
 * rather than a guess, and the caller falls back to asking the user to point
 * at the elements.
 */

/**
 * How an element is measured. Injected so the heuristics can be tested: a DOM
 * without layout reports every rectangle as zero, which would make every
 * element invisible and every test vacuous.
 */
export interface Box {
  top: number;
  width: number;
  height: number;
}

export type Measure = (el: HTMLElement) => Box;

const measureOnScreen: Measure = (el) => {
  const rect = el.getBoundingClientRect();
  return { top: rect.top, width: rect.width, height: rect.height };
};

/** Below this, a repeated block is chrome (a toolbar, a nav list), not a conversation. */
export const MIN_TURNS = 2;
/** A turn shorter than this is a label or a button caption, not a message. */
export const MIN_TURN_CHARS = 2;

export function findComposer(
  root: ParentNode = document,
  measure: Measure = measureOnScreen,
): HTMLElement | null {
  const candidates = [
    ...root.querySelectorAll<HTMLElement>('[contenteditable="true"], textarea:not([readonly])'),
  ].filter((el) => isVisible(el, measure));
  if (candidates.length === 0) return null;

  // The composer is the one nearest the bottom: chat UIs put it there, and a
  // page may hold other editable boxes (a rename field, a search input).
  return candidates.reduce((lowest, candidate) =>
    midpoint(candidate, measure) > midpoint(lowest, measure) ? candidate : lowest,
  );
}

/**
 * The conversation: the parent whose children look most like a run of
 * messages. Scored rather than matched, so no single structural assumption
 * has to hold.
 */
export function findTurns(
  root: ParentNode = document,
  measure: Measure = measureOnScreen,
): HTMLElement[] {
  const parents = new Map<HTMLElement, HTMLElement[]>();

  for (const node of root.querySelectorAll<HTMLElement>('*')) {
    const parent = node.parentElement;
    if (!parent || !isVisible(node, measure)) continue;
    if ((node.textContent ?? '').trim().length < MIN_TURN_CHARS) continue;
    const siblings = parents.get(parent) ?? [];
    siblings.push(node);
    parents.set(parent, siblings);
  }

  let best: HTMLElement[] = [];
  let bestScore = 0;
  for (const [, children] of parents) {
    if (children.length < MIN_TURNS) continue;
    const score = scoreAsConversation(children);
    if (score > bestScore) {
      bestScore = score;
      best = children;
    }
  }
  return best;
}

/**
 * Which turns are the user's. Without site knowledge the reliable signal is
 * alternation: a conversation is a dialogue, so turns swap speaker. The first
 * turn is taken as the user's, which is true of every chat that starts because
 * someone asked something.
 */
export function assignRoles(turns: readonly HTMLElement[]): ('user' | 'assistant')[] {
  return turns.map((_, index) => (index % 2 === 0 ? 'user' : 'assistant'));
}

/**
 * How much a group of siblings looks like a conversation: several of them,
 * carrying real text, of visibly differing lengths. A list of equal-length
 * items is a menu; messages vary.
 */
function scoreAsConversation(children: readonly HTMLElement[]): number {
  const lengths = children.map((child) => (child.textContent ?? '').trim().length);
  const total = lengths.reduce((sum, n) => sum + n, 0);
  if (total === 0) return 0;

  const mean = total / lengths.length;
  const spread = lengths.reduce((sum, n) => sum + Math.abs(n - mean), 0) / lengths.length;

  // Turns resemble one another; page furniture does not. <body> holds the most
  // text on any page, but its children are a nav, a main and a footer — three
  // different things. A conversation's children are the same thing, repeated,
  // which is what separates it from every other group of siblings.
  const tallies = new Map<string, number>();
  for (const child of children) {
    const signature = `${child.tagName}.${child.className || ''}`;
    tallies.set(signature, (tallies.get(signature) ?? 0) + 1);
  }
  const sameness = Math.max(...tallies.values()) / children.length;

  return total * sameness * (1 + spread / mean) * Math.min(children.length, 20);
}

function isVisible(el: HTMLElement, measure: Measure): boolean {
  if (el.hidden) return false;
  const box = measure(el);
  return box.width > 0 && box.height > 0;
}

function midpoint(el: HTMLElement, measure: Measure): number {
  const box = measure(el);
  return box.top + box.height / 2;
}
