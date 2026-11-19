// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import selectorConfig from '../../../config/selectors.json';
import type { PlatformSelectors } from '@data/config/selector-config';
import { GeminiAdapter } from './adapter';

/**
 * Fixture mirrors gemini.google.com DOM as of the selector config version.
 * When a live selector breaks, update config/selectors.json AND this fixture.
 */
const FIXTURE = `
<main>
  <user-query><p>Summarize this quarter's numbers</p></user-query>
  <model-response>
    <p>Revenue grew <strong>12%</strong> quarter over quarter.</p>
    <ul><li>Q1: 4.2M</li><li>Q2: 4.7M</li></ul>
  </model-response>
</main>
`;

const selectors = selectorConfig.platforms.gemini as PlatformSelectors;

describe('GeminiAdapter.readConversation', () => {
  beforeEach(() => {
    document.body.innerHTML = FIXTURE;
  });

  it('splits user queries from model responses', async () => {
    const conversation = await new GeminiAdapter(selectors).readConversation();
    expect(conversation.sourcePlatform).toBe('gemini');
    expect(conversation.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
  });

  it('preserves inline formatting and lists as markdown', async () => {
    const conversation = await new GeminiAdapter(selectors).readConversation();
    const answer = conversation.messages[1]?.content ?? '';
    expect(answer).toContain('**12%**');
    expect(answer).toContain('- Q1: 4.2M');
  });
});

describe('GeminiAdapter.uploadFile', () => {
  it('targets the configured drop zone', async () => {
    document.body.innerHTML = `<main><rich-textarea></rich-textarea></main>`;
    const zone = document.querySelector('rich-textarea')!;
    const seen: string[] = [];
    for (const type of ['dragenter', 'dragover', 'drop', 'dragleave', 'dragend']) {
      zone.addEventListener(type, () => seen.push(type));
    }

    await new GeminiAdapter(selectors).uploadFile(
      new Blob(['a,b\n1,2'], { type: 'text/csv' }),
      'x.csv',
    );
    // The trailing pair matters: it is what lowers the platform's drop overlay.
    expect(seen).toEqual(['dragenter', 'dragover', 'drop', 'dragleave', 'dragend']);
  });

  it('falls back to the next configured zone when the composer wrapper is gone', async () => {
    // No <rich-textarea>: the config's second dropZone candidate (<main>) wins.
    document.body.innerHTML = `<main><div class="ql-editor" contenteditable="true"></div></main>`;
    let droppedOn = '';
    document.querySelector('main')!.addEventListener('drop', (event) => {
      droppedOn = (event.target as Element).tagName.toLowerCase();
    });

    await new GeminiAdapter(selectors).uploadFile(new Blob(['x']), 'x.txt');
    expect(droppedOn).toBe('main');
  });
});

describe('GeminiAdapter.getModelMode', () => {
  it('reads the mode picker regardless of which element carries the test id', async () => {
    // Live check 2026-09-10: the picker moved from a <div> to a <button> and a
    // tag-qualified selector silently stopped matching. Keep these tag-agnostic.
    document.body.innerHTML = `<bard-mode-switcher>
      <button data-test-id="bard-mode-menu-button"> Flash-Lite </button>
    </bard-mode-switcher>`;
    expect(await new GeminiAdapter(selectors).getModelMode()).toEqual({ model: 'Flash-Lite' });
  });
});

/**
 * Live markup, checked 2026-10-05 on a real conversation. Gemini's own
 * accessibility label repeated the message inside the turn, so the first real
 * fork produced "Siz şunu dediniz: slmcnm" followed by "slmcnm".
 */
describe('GeminiAdapter.readConversation — live markup', () => {
  it('reads each turn once, without the screen-reader duplicate', async () => {
    document.body.innerHTML = `
      <user-query>
        <h5 class="cdk-visually-hidden screen-reader-user-query-label">Siz şunu dediniz: slmcnm</h5>
        <div class="query-text"><p>slmcnm</p></div>
      </user-query>
      <model-response>
        <mat-icon aria-hidden="true">thumb_up</mat-icon>
        <div class="markdown"><p>Selam! Nasılsın?</p></div>
      </model-response>`;

    const conversation = await new GeminiAdapter(selectors).readConversation();
    expect(conversation.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(conversation.messages[0]?.content).toBe('slmcnm');
    expect(conversation.messages[1]?.content).toBe('Selam! Nasılsın?');
  });
});

/**
 * Gemini as seen live (2026-11-20): a long conversation opens with only its
 * latest turns, and earlier ones are added — and kept — each time the
 * history is scrolled to the top.
 */
describe('GeminiAdapter.readConversation — earlier turns loaded on scroll', () => {
  function lazyHistory(total: number, batch: number) {
    document.body.innerHTML = '<infinite-scroller class="chat-history" style="overflow-y:auto"><div id="list"></div></infinite-scroller>';
    const scroller = document.querySelector<HTMLElement>('infinite-scroller')!;
    const list = document.getElementById('list')!;
    let loadedFrom = total - batch;
    let scrollTop = 5000;
    const render = () => {
      list.innerHTML = '';
      for (let i = loadedFrom; i < total; i += 1) {
        const el = document.createElement(i % 2 === 0 ? 'user-query' : 'model-response');
        el.textContent = `${i % 2 === 0 ? 'soru' : 'cevap'} ${String(i)}`;
        list.append(el);
      }
    };
    Object.defineProperty(scroller, 'scrollTop', {
      get: () => scrollTop,
      set: (v: number) => {
        scrollTop = Math.max(0, v);
        if (scrollTop === 0 && loadedFrom > 0) {
          loadedFrom = Math.max(0, loadedFrom - batch);
          render();
        }
      },
    });
    Object.defineProperty(scroller, 'scrollHeight', { get: () => 10_000 });
    Object.defineProperty(scroller, 'clientHeight', { get: () => 800 });
    render();
  }

  it('reads only what is drawn unless the whole conversation is asked for', async () => {
    lazyHistory(12, 4);
    expect((await new GeminiAdapter(selectors).readConversation()).messages).toHaveLength(4);
  });

  it('loads the earlier turns until none are left, and reads them in order', async () => {
    lazyHistory(12, 4);
    let collecting = false;
    const conversation = await new GeminiAdapter(selectors).readConversation({
      complete: true,
      onCollecting: () => (collecting = true),
    });
    expect(collecting).toBe(true);
    expect(conversation.messages.map((m) => m.content)).toEqual(
      Array.from({ length: 12 }, (_, i) => `${i % 2 === 0 ? 'soru' : 'cevap'} ${String(i)}`),
    );
    expect(conversation.messages[0]?.role).toBe('user');
  }, 20_000);
});
