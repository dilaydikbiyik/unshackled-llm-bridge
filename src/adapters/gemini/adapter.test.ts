// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import selectorConfig from '../../../config/selectors.json';
import type { PlatformSelectors } from '@models/config/selector-config';
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
