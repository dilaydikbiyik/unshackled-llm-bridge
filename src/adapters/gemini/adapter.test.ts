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
    for (const type of ['dragenter', 'dragover', 'drop']) {
      zone.addEventListener(type, () => seen.push(type));
    }

    await new GeminiAdapter(selectors).uploadFile(
      new Blob(['a,b\n1,2'], { type: 'text/csv' }),
      'x.csv',
    );
    expect(seen).toEqual(['dragenter', 'dragover', 'drop']);
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
