// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { collectVirtualized, MAX_STEPS } from './virtualized';

/**
 * A fake virtualized conversation, behaving the way ChatGPT's was measured to:
 * only turns overlapping a window around the viewport exist in the DOM, each
 * turn has its own height, and the earliest turns only arrive after the top has
 * been reached once — loaded in a batch, the way an infinite scroll upward does.
 */
function fakePage(heights: number[], options: { lazyTop?: boolean; window?: number; remeasure?: number } = {}) {
  const viewport = 800;
  const reach = options.window ?? 400;
  const tops: number[] = [];
  let total = 0;
  const layout = () => {
    total = heights.reduce((y, h, i) => ((tops[i] = y), y + h), 0);
  };
  layout();
  let loadedFrom = options.lazyTop ? Math.min(2, heights.length - 1) : 0;
  let scrollTop = Math.max(0, total - viewport);
  const scrolls: number[] = [];

  const scroller = {
    get scrollTop() {
      return scrollTop;
    },
    set scrollTop(value: number) {
      // Reaching the top draws the first turn for real: its height had been an
      // estimate, and everything below it moves by the difference.
      if (value <= 0 && options.remeasure) {
        heights[0] = heights[0]! + options.remeasure;
        options.remeasure = 0;
        layout();
      }
      scrollTop = Math.max(0, Math.min(value, total - viewport));
      scrolls.push(scrollTop);
    },
    get scrollHeight() {
      return total;
    },
    clientHeight: viewport,
  };

  const elements = heights.map((_, i) => {
    const el = document.createElement('div');
    el.dataset['turn'] = String(i);
    return el;
  });

  return {
    scroller,
    scrolls,
    get scrollTop() {
      return scrollTop;
    },
    page: {
      scroller,
      present: () => {
        // Reaching the top loads the earlier batch, as ChatGPT's does.
        if (scrollTop === 0) loadedFrom = 0;
        return elements.filter((_, i) => {
          if (i < loadedFrom) return false;
          const top = tops[i]!;
          const bottom = top + heights[i]!;
          return bottom >= scrollTop - reach && top <= scrollTop + viewport + reach;
        });
      },
      keyOf: (el: Element) => (el as HTMLElement).dataset['turn']!,
      compare: (a: string, b: string) => Number(a) - Number(b),
      bottomOf: (el: Element) => {
        const i = Number((el as HTMLElement).dataset['turn']);
        return tops[i]! + heights[i]!;
      },
      topOf: (el: Element) => tops[Number((el as HTMLElement).dataset['turn'])]! - scrollTop,
      read: (el: Element) => `turn ${(el as HTMLElement).dataset['turn']!}`,
      sleep: async () => undefined,
    },
  };
}

describe('collectVirtualized', () => {
  it('reads every turn of a conversation the page only partly keeps', async () => {
    const { page } = fakePage([60, 3200, 80, 2400, 70, 4100, 90, 1800, 60, 2600, 75, 3000]);
    const turns = await collectVirtualized(page);
    expect(turns).toEqual(Array.from({ length: 12 }, (_, i) => `turn ${String(i)}`));
  });

  it('waits at the top for the earlier turns that only load there', async () => {
    const { page } = fakePage([60, 3200, 80, 2400, 70, 4100], { lazyTop: true });
    const turns = await collectVirtualized(page);
    expect(turns[0]).toBe('turn 0');
    expect(turns).toHaveLength(6);
  });

  it('puts the user back where they were', async () => {
    const fake = fakePage([60, 3200, 80, 2400, 70, 4100]);
    const before = fake.scrollTop;
    await collectVirtualized(fake.page);
    expect(fake.scrollTop).toBe(before);
  });

  it('puts the user back on the same turn when the page re-measures turns above it', async () => {
    // Seen live: started at 11,874px, ended at 3,189 — a different answer on
    // screen — because the page had re-estimated the heights of turns above.
    const fake = fakePage([60, 3200, 80, 2400, 70, 4100], { remeasure: 3000 });
    const onScreen = () => fake.page.present().find((el) => fake.page.bottomOf(el) - fake.scrollTop > 0)!;
    const turn = (onScreen() as HTMLElement).dataset['turn'];
    const top = fake.page.topOf(onScreen());

    await collectVirtualized(fake.page);

    const back = fake.page.present().find((el) => (el as HTMLElement).dataset['turn'] === turn)!;
    expect(fake.page.topOf(back)).toBeCloseTo(top, 0);
  });

  it('puts the user back even if reading a turn fails part-way', async () => {
    const fake = fakePage([60, 3200, 80, 2400]);
    const before = fake.scrollTop;
    const failing = {
      ...fake.page,
      read: (el: Element) => {
        if ((el as HTMLElement).dataset['turn'] === '2') throw new Error('detached');
        return 'ok';
      },
    };
    await expect(collectVirtualized(failing)).rejects.toThrow('detached');
    expect(fake.scrollTop).toBe(before);
  });

  it('reads each turn once, however often it is recreated', async () => {
    const reads: string[] = [];
    const fake = fakePage([60, 3200, 80, 2400, 70]);
    await collectVirtualized({ ...fake.page, read: (el) => (reads.push((el as HTMLElement).dataset['turn']!), 'x') });
    expect(reads).toEqual([...new Set(reads)]);
  });

  it('jumps a turn at a time rather than a screen at a time', async () => {
    // Twelve turns, some thousands of pixels tall: stepping by the viewport
    // would take dozens of scrolls; jumping past each turn takes about a dozen.
    const fake = fakePage([60, 3200, 80, 2400, 70, 4100, 90, 1800, 60, 2600, 75, 3000]);
    await collectVirtualized(fake.page);
    const downward = fake.scrolls.filter((s) => s > 0).length;
    expect(downward).toBeLessThan(24);
  });

  it('stops on a page that never ends', async () => {
    const fake = fakePage([60, 3200]);
    // A page whose height keeps growing must not hang the walk.
    let grow = 0;
    Object.defineProperty(fake.scroller, 'scrollHeight', { get: () => 10_000_000 + (grow += 1) });
    const page = { ...fake.page, present: () => [] };
    await expect(collectVirtualized(page)).resolves.toEqual([]);
    expect(fake.scrolls.length).toBeLessThanOrEqual(12 + MAX_STEPS + 1);
  });
});
