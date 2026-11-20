import { describe, expect, it } from 'vitest';
import { compactMessages, languageName, segment, translateMessage, translationNote } from './compact';

const upper = async (text: string) => text.toUpperCase();

describe('segment', () => {
  it('keeps code, inline code, links and addresses out of translation', () => {
    const parts = segment('Şunu çalıştır: `npm test` sonra\n```js\nconst a = 1;\n```\nbak https://example.com/x ve [doküman](https://d.io/a) ya da a@b.co');
    const kept = parts.filter((p) => !p.translate).map((p) => p.text);
    expect(kept).toEqual(['`npm test`', '```js\nconst a = 1;\n```', 'https://example.com/x', '](https://d.io/a)', 'a@b.co']);
    expect(parts.map((p) => p.text).join('')).toContain('Şunu çalıştır: `npm test` sonra');
  });
});

describe('translateMessage', () => {
  it('translates the prose and puts everything else back exactly', async () => {
    const out = await translateMessage('bunu dene `x = 1` lütfen\n```py\nprint("selam")\n```\ntamam', upper);
    expect(out).toBe('BUNU DENE `x = 1` LÜTFEN\n```py\nprint("selam")\n```\nTAMAM');
  });

  it('leaves text with no letters alone', async () => {
    expect(await translateMessage('123 — 456', upper)).toBe('123 — 456');
  });
});

describe('compactMessages', () => {
  it('translates every message but the last, which the target is answering', async () => {
    const messages = [
      { role: 'user' as const, content: 'ilk soru', index: 0, attachmentRefs: [] },
      { role: 'assistant' as const, content: 'ilk cevap', index: 1, attachmentRefs: [] },
      { role: 'user' as const, content: 'son soru', index: 2, attachmentRefs: [] },
    ];
    const out = await compactMessages(messages, upper);
    expect(out.map((m) => m.content)).toEqual(['ILK SORU', 'ILK CEVAP', 'son soru']);
  });
});

describe('translationNote', () => {
  it('names the language in English and asks for the reply in it', () => {
    expect(languageName('tr')).toBe('Turkish');
    expect(translationNote('tr')).toBe(
      'Earlier messages were translated from Turkish into English to save space. Reply to me in Turkish.',
    );
  });
});
