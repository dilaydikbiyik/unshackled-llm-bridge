// @vitest-environment happy-dom
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { prepareDocuments, renderDocuments } from '@domain/documents/landmarks';
import { canExtractText, extractDocument } from './extract';
import { htmlLines, notebookLines, rtfLines } from './markup';

const zip = (files: Record<string, string>): ArrayBuffer => {
  const u8 = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
};

const slide = (title: string | null, body: string) => `<p:sld><p:cSld><p:spTree>
  ${title === null ? '' : `<p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>${title}</a:t></a:r></a:p></p:txBody></p:sp>`}
  <p:sp><p:txBody><a:p><a:r><a:t>${body}</a:t></a:r></a:p></p:txBody></p:sp>
</p:spTree></p:cSld></p:sld>`;

describe('PowerPoint', () => {
  it('reads slides in order, titled, with speaker notes, and calls them slides', async () => {
    const doc = await extractDocument(
      zip({
        'ppt/slides/slide1.xml': slide('Amaç', 'Hakem modelleri ölçmek'),
        'ppt/slides/slide10.xml': slide(null, 'Son slayt'),
        'ppt/slides/slide2.xml': slide('Yöntem', 'Üç sınıf &amp; kanıt'),
        'ppt/notesSlides/notesSlide2.xml': '<p:notes><a:p><a:r><a:t>Burada örnek ver</a:t></a:r></a:p></p:notes>',
      }),
      'sunum.pptx',
      '',
    );
    expect(doc?.unit).toBe('slide');
    expect(doc?.pageCount).toBe(3);
    expect(doc!.lines.filter((l) => l.heading).map((l) => l.text)).toEqual(['Amaç', 'Yöntem', 'Slide 3']);
    expect(doc!.lines.map((l) => l.text)).toContain('Üç sınıf & kanıt');
    expect(doc!.lines.map((l) => l.text)).toContain('Notes: Burada örnek ver');
    expect(renderDocuments(prepareDocuments([doc!], ''))).toContain('3 slides');
  });
});

describe('Excel', () => {
  it('reads each sheet by name, rows as cells, shared and inline strings and numbers', async () => {
    const doc = await extractDocument(
      zip({
        'xl/workbook.xml': '<workbook><sheets><sheet name="Bütçe" sheetId="1" r:id="rId1"/><sheet name="Notlar" sheetId="2" r:id="rId2"/></sheets></workbook>',
        'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>',
        'xl/sharedStrings.xml': '<sst><si><t>Kalem</t></si><si><t>Tutar</t></si><si><r><t>Sun</t></r><r><t>ucu</t></r></si></sst>',
        'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>1200</v></c></row></sheetData></worksheet>',
        'xl/worksheets/sheet2.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Not bir</t></is></c></row></sheetData></worksheet>',
      }),
      'butce.xlsx',
      '',
    );
    expect(doc?.unit).toBe('sheet');
    expect(doc!.lines.map((l) => l.text)).toEqual(['Bütçe', 'Kalem | Tutar', 'Sunucu | 1200', 'Notlar', 'Not bir']);
    expect(doc!.lines.find((l) => l.text === 'Not bir')?.page).toBe(2);
  });
});

describe('OpenDocument', () => {
  it('reads a text document with its headings', async () => {
    const doc = await extractDocument(
      zip({ 'content.xml': '<office:document-content><office:body><office:text><text:h text:outline-level="1">Giriş</text:h><text:p>Bir<text:s/>iki</text:p></office:text></office:body></office:document-content>' }),
      'yazi.odt',
      '',
    );
    expect(doc!.lines).toEqual([
      { text: 'Giriş', page: 1, heading: true },
      { text: 'Bir iki', page: 1 },
    ]);
  });

  it('reads a spreadsheet sheet by sheet', async () => {
    const doc = await extractDocument(
      zip({ 'content.xml': '<office:body><office:spreadsheet><table:table table:name="Veri"><table:table-row><table:table-cell><text:p>a</text:p></table:table-cell><table:table-cell><text:p>b</text:p></table:table-cell></table:table-row></table:table></office:spreadsheet></office:body>' }),
      'tablo.ods',
      '',
    );
    expect(doc!.lines.map((l) => l.text)).toEqual(['Veri', 'a | b']);
  });
});

describe('EPUB', () => {
  it('reads chapters in spine order, as chapters', async () => {
    const doc = await extractDocument(
      zip({
        'META-INF/container.xml': '<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>',
        'OEBPS/content.opf': '<package><manifest><item id="c2" href="ch2.xhtml"/><item id="c1" href="ch1.xhtml"/></manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>',
        'OEBPS/ch1.xhtml': '<html><body><h1>Başlangıç</h1><p>İlk bölüm.</p></body></html>',
        'OEBPS/ch2.xhtml': '<html><head><title>Son</title></head><body><p>İkinci bölüm.</p></body></html>',
      }),
      'kitap.epub',
      '',
    );
    expect(doc?.unit).toBe('chapter');
    expect(doc!.lines.filter((l) => l.heading).map((l) => l.text)).toEqual(['Başlangıç', 'Son']);
    expect(doc!.lines.find((l) => l.text === 'İkinci bölüm.')?.page).toBe(2);
  });
});

describe('markup formats', () => {
  it('reads HTML without its scripts and navigation, headings marked', () => {
    const lines = htmlLines('<html><body><nav>menu</nav><h2>Konu &amp; amaç</h2><p>Metin<br>devam</p><script>x()</script></body></html>');
    expect(lines).toEqual([
      { text: 'Konu & amaç', page: 1, heading: true },
      { text: 'Metin', page: 1 },
      { text: 'devam', page: 1 },
    ]);
  });

  it('reads RTF text, Turkish characters included', () => {
    const lines = rtfLines('{\\rtf1\\ansi\\ansicpg1254{\\fonttbl{\\f0 Arial;}}\\f0 G\\\'fczel g\\\'fcn\\par \\u351?ehir\\par}');
    expect(lines.map((l) => l.text)).toEqual(['Güzel gün', 'şehir']);
  });

  it('reads a notebook: markdown with headings, code fenced, outputs left out', () => {
    const lines = notebookLines(
      JSON.stringify({
        metadata: { kernelspec: { language: 'python' } },
        cells: [
          { cell_type: 'markdown', source: ['# Analiz\n', 'Veriyi yükle'] },
          { cell_type: 'code', source: 'import pandas as pd', outputs: [{ text: 'çok uzun çıktı' }] },
        ],
      }),
    )!;
    expect(lines.map((l) => l.text)).toEqual(['Analiz', 'Veriyi yükle', '```python', 'import pandas as pd', '```']);
    expect(lines.map((l) => l.text).join()).not.toContain('çok uzun çıktı');
  });

  it('knows all of these by name', () => {
    for (const name of ['a.pptx', 'a.xlsx', 'a.odt', 'a.odp', 'a.ods', 'a.epub', 'a.html', 'a.rtf', 'a.ipynb']) {
      expect(canExtractText(name, '')).toBe(true);
    }
  });
});
