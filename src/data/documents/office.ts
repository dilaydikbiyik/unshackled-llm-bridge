import type { DocumentLine } from '@domain/documents/landmarks';
import { decodeEntities, htmlLines, plainText } from './markup';

/**
 * Office formats — OOXML (pptx, xlsx) and OpenDocument (odt, odp, ods) — and
 * EPUB. All of them are zips of XML; each is read for its text and its
 * structure: slides, sheets and chapters become the document's pages, so a
 * landmark can say "slide 4" or "sheet Budget".
 */

export type Zip = Record<string, Uint8Array>;

export async function unzip(bytes: ArrayBuffer, keep: (name: string) => boolean): Promise<Zip | null> {
  const { unzipSync } = await import('fflate');
  try {
    return unzipSync(new Uint8Array(bytes), { filter: (file) => keep(file.name) });
  } catch {
    return null;
  }
}

const utf8 = new TextDecoder();
const text = (zip: Zip, name: string): string | null => (zip[name] ? utf8.decode(zip[name]) : null);
const numberIn = (name: string) => Number(/(\d+)\.xml$/.exec(name)?.[1] ?? 0);

/** Rows of a sheet are cut off past this; a spreadsheet can hold a million. */
export const MAX_SHEET_ROWS = 2_000;

/**
 * PowerPoint: one page per slide, in order, headed by the slide's title (or
 * "Slide N" when it has none), with the speaker notes after the slide's text.
 */
export async function pptxLines(bytes: ArrayBuffer): Promise<DocumentLine[] | null> {
  const zip = await unzip(bytes, (n) => /^ppt\/(slides|notesSlides)\/\w+\d+\.xml$/.test(n));
  if (!zip) return null;
  const slides = Object.keys(zip)
    .filter((n) => n.startsWith('ppt/slides/'))
    .sort((a, b) => numberIn(a) - numberIn(b));
  if (slides.length === 0) return null;

  const lines: DocumentLine[] = [];
  slides.forEach((name, i) => {
    const page = i + 1;
    const xml = text(zip, name) ?? '';
    let title: string | null = null;
    const body: string[] = [];
    for (const [shape] of xml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g)) {
      const paragraphs = drawingParagraphs(shape);
      if (paragraphs.length === 0) continue;
      if (!title && /<p:ph\b[^>]*type="(title|ctrTitle)"/.test(shape)) title = paragraphs.join(' ');
      else body.push(...paragraphs);
    }
    lines.push({ text: title ?? `Slide ${String(page)}`, page, heading: true });
    for (const paragraph of body) lines.push({ text: paragraph, page });
    const notes = text(zip, `ppt/notesSlides/notesSlide${String(numberIn(name))}.xml`);
    const said = notes ? drawingParagraphs(notes).filter((p) => !/^\d+$/.test(p)) : [];
    if (said.length > 0) lines.push({ text: `Notes: ${said.join(' ')}`, page });
  });
  return lines;
}

/** DrawingML paragraphs: `<a:p>` holding runs of `<a:t>`. */
function drawingParagraphs(xml: string): string[] {
  return [...xml.matchAll(/<a:p>[\s\S]*?<\/a:p>|<a:p\b[^>]*>[\s\S]*?<\/a:p>/g)]
    .map(([p]) => [...p.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => decodeEntities(m[1]!)).join(''))
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Excel: one page per sheet, headed by its name, each row a line of cells
 * separated by " | ". Formulas are read as the values Excel last computed.
 */
export async function xlsxLines(bytes: ArrayBuffer): Promise<DocumentLine[] | null> {
  const zip = await unzip(bytes, (n) => n === 'xl/workbook.xml' || n === 'xl/sharedStrings.xml' || n === 'xl/_rels/workbook.xml.rels' || /^xl\/worksheets\/[^/]+\.xml$/.test(n));
  if (!zip) return null;
  const workbook = text(zip, 'xl/workbook.xml');
  if (!workbook) return null;

  const shared = [...(text(zip, 'xl/sharedStrings.xml') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(([, si]) =>
    [...si!.matchAll(/<t\b[^>]*>([^<]*)<\/t>/g)].map((m) => decodeEntities(m[1]!)).join(''),
  );
  const targets = new Map(
    [...(text(zip, 'xl/_rels/workbook.xml.rels') ?? '').matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map(
      ([, id, target]) => [id!, target!.replace(/^\/?(xl\/)?/, 'xl/')],
    ),
  );

  const lines: DocumentLine[] = [];
  const sheets = [...workbook.matchAll(/<sheet\b[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)];
  sheets.forEach(([, name, rid], i) => {
    const page = i + 1;
    const xml = text(zip, targets.get(rid!) ?? `xl/worksheets/sheet${String(page)}.xml`);
    lines.push({ text: decodeEntities(name!), page, heading: true });
    if (!xml) return;
    let count = 0;
    for (const [, row] of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      if (count >= MAX_SHEET_ROWS) {
        lines.push({ text: `[… rows after ${String(MAX_SHEET_ROWS)} left out]`, page });
        break;
      }
      const cells = [...row!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].map(([, attrs, inner]) => {
        const type = /\bt="(\w+)"/.exec(attrs!)?.[1];
        if (type === 'inlineStr') return plainText(/<is>([\s\S]*?)<\/is>/.exec(inner ?? '')?.[1] ?? '');
        const value = /<v>([^<]*)<\/v>/.exec(inner ?? '')?.[1] ?? '';
        return type === 's' ? (shared[Number(value)] ?? '') : decodeEntities(value);
      });
      if (cells.some((c) => c.trim())) {
        lines.push({ text: cells.join(' | '), page });
        count += 1;
      }
    }
  });
  return lines;
}

/**
 * OpenDocument text, presentations and spreadsheets share one content.xml:
 * headings are `<text:h>`, paragraphs `<text:p>`, slides `<draw:page>`, and
 * sheets `<table:table>` of rows of cells.
 */
export async function odfLines(bytes: ArrayBuffer): Promise<DocumentLine[] | null> {
  const zip = await unzip(bytes, (n) => n === 'content.xml');
  const xml = zip ? text(zip, 'content.xml') : null;
  if (!xml) return null;
  const body = /<office:body>([\s\S]*)<\/office:body>/.exec(xml)?.[1] ?? xml;

  const pages = [...body.matchAll(/<draw:page\b([^>]*)>([\s\S]*?)<\/draw:page>/g)];
  if (pages.length > 0) {
    return pages.flatMap(([, attrs, inner], i) => {
      const page = i + 1;
      const paragraphs = odfParagraphs(inner!).map((p) => p.text);
      const name = /draw:name="([^"]+)"/.exec(attrs!)?.[1];
      const title = paragraphs[0] ?? (name ? decodeEntities(name) : `Slide ${String(page)}`);
      return [
        { text: title, page, heading: true },
        ...paragraphs.slice(1).map((p) => ({ text: p, page })),
      ];
    });
  }

  const tables = [...body.matchAll(/<table:table\b([^>]*)>([\s\S]*?)<\/table:table>/g)];
  if (/<office:spreadsheet>/.test(body) && tables.length > 0) {
    return tables.flatMap(([, attrs, inner], i) => {
      const page = i + 1;
      const name = decodeEntities(/table:name="([^"]+)"/.exec(attrs!)?.[1] ?? `Sheet ${String(page)}`);
      const rows = [...inner!.matchAll(/<table:table-row\b[^>]*>([\s\S]*?)<\/table:table-row>/g)]
        .slice(0, MAX_SHEET_ROWS)
        .map(([, row]) =>
          [...row!.matchAll(/<table:table-cell\b[^>]*?(?:\/>|>([\s\S]*?)<\/table:table-cell>)/g)]
            .map(([, cell]) => plainText(cell ?? ''))
            .join(' | ')
            .replace(/( \| )+$/, ''),
        )
        .filter((r) => r.replace(/\|/g, '').trim());
      return [{ text: name, page, heading: true }, ...rows.map((r) => ({ text: r, page }))];
    });
  }

  return odfParagraphs(body).map((p) => ({ text: p.text, page: 1, ...(p.heading ? { heading: true } : {}) }));
}

function odfParagraphs(xml: string): { text: string; heading: boolean }[] {
  return [...xml.matchAll(/<text:(h|p)\b[^>]*>([\s\S]*?)<\/text:\1>/g)]
    .map(([, kind, inner]) => ({
      text: plainText(inner!.replace(/<text:s\b[^>]*\/>/g, ' ').replace(/<text:tab\/>/g, '\t').replace(/<text:line-break\/>/g, ' ')),
      heading: kind === 'h',
    }))
    .filter((p) => p.text);
}

/**
 * EPUB: the chapters in reading order (the spine), one page per chapter, read
 * as HTML so a chapter's own headings mark its sections.
 */
export async function epubLines(bytes: ArrayBuffer): Promise<DocumentLine[] | null> {
  const zip = await unzip(bytes, (n) => /\.(xml|opf|x?html?)$/i.test(n));
  if (!zip) return null;
  const container = text(zip, 'META-INF/container.xml');
  const opfPath = container ? /full-path="([^"]+)"/.exec(container)?.[1] : undefined;
  const opf = opfPath ? text(zip, opfPath) : null;
  if (!opfPath || !opf) return null;
  const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';

  const manifest = new Map(
    [...opf.matchAll(/<item\b[^>]*>/g)].map(([item]) => [
      /\bid="([^"]+)"/.exec(item)?.[1] ?? '',
      /\bhref="([^"]+)"/.exec(item)?.[1] ?? '',
    ]),
  );
  const spine = [...opf.matchAll(/<itemref\b[^>]*idref="([^"]+)"/g)].map(([, id]) => manifest.get(id!));
  const lines: DocumentLine[] = [];
  let page = 0;
  for (const href of spine) {
    if (!href) continue;
    const chapter = text(zip, base + decodeURIComponent(href.split('#')[0]!));
    if (!chapter) continue;
    const chapterLines = htmlLines(chapter, page + 1);
    if (chapterLines.length === 0) continue;
    page += 1;
    // A chapter with no heading of its own is still a landmark.
    if (!chapterLines.some((l) => l.heading)) {
      const title = /<title>([^<]*)<\/title>/i.exec(chapter)?.[1];
      lines.push({ text: title ? decodeEntities(title) : `Chapter ${String(page)}`, page, heading: true });
    }
    lines.push(...chapterLines);
  }
  return lines;
}
