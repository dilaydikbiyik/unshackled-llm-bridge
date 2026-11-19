// @vitest-environment happy-dom
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { canExtractText, docxLines, extractDocument, linesOfPage, textLines } from './extract';
import { samplePdf } from './sample-pdf';

const buffer = (u8: Uint8Array): ArrayBuffer => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;

function docx(paragraphs: string): ArrayBuffer {
  const xml = `<?xml version="1.0"?><w:document xmlns:w="w"><w:body>${paragraphs}</w:body></w:document>`;
  return buffer(zipSync({ 'word/document.xml': strToU8(xml), '[Content_Types].xml': strToU8('<Types/>') }));
}

describe('canExtractText', () => {
  it('knows the formats it can read, and not the ones it cannot', () => {
    expect(canExtractText('a.pdf', '')).toBe(true);
    expect(canExtractText('a.docx', '')).toBe(true);
    expect(canExtractText('notes.md', '')).toBe(true);
    expect(canExtractText('data', 'text/csv')).toBe(true);
    expect(canExtractText('photo.png', 'image/png')).toBe(false);
    expect(canExtractText('old.doc', 'application/msword')).toBe(false);
  });
});

describe('text formats', () => {
  it('marks Markdown headings', () => {
    expect(textLines('# Title\nbody\n## Sub', 'a.md').filter((l) => l.heading).map((l) => l.text)).toEqual(['Title', 'Sub']);
  });

  it('leaves a # in plain text alone', () => {
    expect(textLines('# not a heading', 'a.txt')[0]).toEqual({ text: '# not a heading', page: 1 });
  });
});

describe('docx', () => {
  it('reads paragraphs, styled headings in any language, and page breaks', async () => {
    const lines = await docxLines(
      docx(
        '<w:p><w:pPr><w:pStyle w:val="Başlık1"/></w:pPr><w:r><w:t>Giriş</w:t></w:r></w:p>' +
          '<w:p><w:r><w:t xml:space="preserve">Metin &amp; devamı</w:t></w:r><w:r><w:br w:type="page"/></w:r></w:p>' +
          '<w:p><w:r><w:t>İkinci sayfa</w:t></w:r></w:p>',
      ),
    );
    expect(lines).toEqual([
      { text: 'Giriş', page: 1, heading: true },
      { text: 'Metin & devamı', page: 1 },
      { text: 'İkinci sayfa', page: 2 },
    ]);
  });

  it('gives up on something that is not a docx', async () => {
    expect(await docxLines(buffer(strToU8('not a zip')))).toBeNull();
  });
});

describe('pdf', () => {
  it('reads every page, with type sizes that mark the heading', async () => {
    const doc = await extractDocument(samplePdf(), 'paper.pdf', 'application/pdf');
    expect(doc?.pageCount).toBe(2);
    const intro = doc!.lines.find((l) => l.text === 'Introduction')!;
    const body = doc!.lines.find((l) => l.text.startsWith('The study'))!;
    expect(intro.size!).toBeGreaterThan(body.size!);
    expect(doc!.lines.find((l) => l.text.startsWith('Second'))?.page).toBe(2);
  });

  it('reads a PDF on a runtime without Promise.try (Chrome before 128, Node 22 in CI)', async () => {
    const P = Promise as PromiseConstructor & { try?: unknown };
    const original = P.try;
    delete P.try;
    try {
      const doc = await extractDocument(samplePdf(), 'old.pdf', 'application/pdf');
      expect(doc?.pageCount).toBe(2);
    } finally {
      if (original) P.try = original;
    }
  });

  it('comes back empty for a file that is not a PDF', async () => {
    expect(await extractDocument(buffer(strToU8('nope')), 'x.pdf', 'application/pdf')).toBeNull();
  });

  it('joins items on one baseline and breaks where it moves', () => {
    const lines = linesOfPage(
      [
        { str: 'Hello ', transform: [10, 0, 0, 10, 0, 700], height: 10 },
        { str: 'world', transform: [10, 0, 0, 10, 40, 700], height: 10 },
        { str: 'Next', transform: [10, 0, 0, 10, 0, 680], height: 10 },
      ],
      1,
    );
    expect(lines.map((l) => l.text)).toEqual(['Hello world', 'Next']);
  });
});
