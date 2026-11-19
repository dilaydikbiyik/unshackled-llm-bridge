/**
 * Reading a conversation the page does not keep in full.
 *
 * ChatGPT virtualizes long conversations: only the turns near the viewport
 * exist in the DOM, two or so at a time, and the rest are created as they
 * scroll into view and destroyed as they scroll out. Read straight from the
 * DOM, a long conversation came back as whatever happened to be on screen —
 * a fork carried two turns of a twelve-turn chat, and the dialog called that
 * "the whole conversation".
 *
 * The page cannot be asked for the rest without reaching into its session, and
 * an extension that reads an authentication token to call a site's private API
 * is not one a user should have to trust. So the turns are read the way the
 * user would see them: scroll to the top until nothing earlier appears, then
 * jump from the last turn read to just past it, reading each turn while it
 * exists, and put the scroll position back.
 *
 * Every dependency is a parameter, so the walk is tested against a fake page.
 */
export interface VirtualizedPage<T> {
  /** The element that scrolls the conversation. */
  scroller: { scrollTop: number; readonly scrollHeight: number; readonly clientHeight: number };
  /** The turns currently in the DOM. */
  present: () => Element[];
  /** A stable identity for a turn, the same each time it is recreated. */
  keyOf: (turn: Element) => string;
  /** Orders keys in conversation order. */
  compare: (a: string, b: string) => number;
  /** How far down the scroller a turn ends, in scroller coordinates. */
  bottomOf: (turn: Element) => number;
  /**
   * Where a turn starts relative to the top of the visible conversation. Used
   * to put the user back by what they were looking at, not by a pixel offset:
   * the page re-estimates the height of turns it has not drawn, so the same
   * scrollTop shows a different part of the conversation after the walk.
   */
  topOf?: (turn: Element) => number;
  /** Reads a turn while it exists — it may not by the next step. */
  read: (turn: Element) => T;
  sleep?: (ms: number) => Promise<void>;
}

/** How long the page gets to draw turns after a scroll. */
export const SETTLE_MS = 250;
/** How long it gets at the top, where earlier turns load in batches. */
export const TOP_SETTLE_MS = 400;
/** A ceiling on the walk, so a page that never stops growing cannot hang it. */
export const MAX_STEPS = 80;

export async function collectVirtualized<T>(page: VirtualizedPage<T>): Promise<T[]> {
  const sleep = page.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const { scroller } = page;
  const original = scroller.scrollTop;
  const anchor = anchorOf(page);
  const read = new Map<string, T>();

  const harvest = (): number => {
    let added = 0;
    for (const turn of page.present()) {
      const key = page.keyOf(turn);
      if (read.has(key)) continue;
      read.set(key, page.read(turn));
      added += 1;
    }
    return added;
  };

  const earliest = (): string | undefined =>
    page.present().map(page.keyOf).sort(page.compare)[0];

  try {
    // The top first: earlier turns arrive in batches as the top is reached, so
    // keep returning to it until the earliest turn stops getting earlier.
    let previous: string | undefined;
    for (let attempt = 0, stable = 0; attempt < 12 && stable < 2; attempt += 1) {
      scroller.scrollTop = 0;
      await sleep(TOP_SETTLE_MS);
      const now = earliest();
      stable = now === previous ? stable + 1 : 0;
      previous = now;
    }
    harvest();

    // Then down, a turn at a time: jump to just past the last turn read, so
    // the next one is drawn. Stepping by the viewport instead read every
    // pixel of answers thousands of pixels tall — eighteen seconds on a real
    // conversation, against three this way.
    for (let step = 0, idle = 0; step < MAX_STEPS && idle < 3; step += 1) {
      const furthest = page.present().sort((a, b) => page.compare(page.keyOf(a), page.keyOf(b))).at(-1);
      const before = scroller.scrollTop;
      const target = furthest ? page.bottomOf(furthest) - scroller.clientHeight * 0.3 : before;
      scroller.scrollTop = Math.max(target, before + scroller.clientHeight * 0.5);
      await sleep(SETTLE_MS);

      const added = harvest();
      idle = added === 0 ? idle + 1 : 0;
      const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;
      if (atBottom && added === 0) break;
    }
  } finally {
    // The user's place in the conversation is theirs; it is put back whatever
    // happened during the walk.
    scroller.scrollTop = original;
    if (anchor) await returnTo(page, anchor, sleep);
  }

  return [...read.entries()].sort(([a], [b]) => page.compare(a, b)).map(([, value]) => value);
}

interface Anchor {
  key: string;
  top: number;
}

/** The turn at the top of what the user is looking at, and where it sits. */
function anchorOf<T>(page: VirtualizedPage<T>): Anchor | null {
  const { topOf } = page;
  if (!topOf) return null;
  let best: Anchor | null = null;
  for (const turn of page.present()) {
    const top = topOf(turn);
    const bottom = page.bottomOf(turn) - page.scroller.scrollTop;
    // The first turn still on screen: its bottom is below the top edge.
    if (bottom <= 0) continue;
    if (!best || top < best.top) best = { key: page.keyOf(turn), top };
  }
  return best;
}

/**
 * Brings the anchor turn back to where it was. The first jump lands near it;
 * once the page has redrawn and re-measured, a correction or two puts it in
 * place. If it is not drawn at all, the pixel position stands.
 */
async function returnTo<T>(
  page: VirtualizedPage<T>,
  anchor: Anchor,
  sleep: (ms: number) => Promise<void>,
): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await sleep(SETTLE_MS);
    const turn = page.present().find((candidate) => page.keyOf(candidate) === anchor.key);
    if (!turn || !page.topOf) return;
    const drift = page.topOf(turn) - anchor.top;
    if (Math.abs(drift) < 2) return;
    page.scroller.scrollTop += drift;
  }
}
