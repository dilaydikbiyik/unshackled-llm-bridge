import { estimateTokens } from '@domain/wrap/limits';

/**
 * A document carried as text, cut at its landmarks.
 *
 * Re-uploading a file sends all of it to the target, every time, and a target
 * that takes no uploads — or a local model that cannot read a PDF — gets
 * nothing. Carried as text, a document can be cut down to what the
 * conversation was actually about: an outline of every section with a
 * landmark (`§4 · Method · p.3–5`), and the full text of the sections the
 * conversation touched. Anything left out is still named, so the target knows
 * it exists and can ask for it by its landmark.
 *
 * Pure: the text has already been extracted (data/documents), and nothing
 * here reads a file.
 */

/** One line of extracted text. */
export interface DocumentLine {
  text: string;
  /** 1-based page, for formats that have pages; 1 otherwise. */
  page: number;
  /** Rendered text height, where the format has one (PDF). */
  size?: number;
  /** Set by formats that mark headings themselves (Markdown, DOCX styles). */
  heading?: boolean;
}

/** What the document's pages are: PDF pages, slides, sheets, chapters. */
export type DocumentUnit = 'page' | 'slide' | 'sheet' | 'chapter';

export interface ExtractedDocument {
  name: string;
  pageCount: number;
  lines: DocumentLine[];
  /** Absent means pages. */
  unit?: DocumentUnit;
}

export interface Section {
  /** The landmark: `§3`. Stable for a given document. */
  id: string;
  title: string;
  firstPage: number;
  lastPage: number;
  text: string;
  tokens: number;
}

/** What the documents may add to a transfer, all documents together. */
export const DOCUMENT_TOKEN_BUDGET = 8_000;
/** Below this, a document goes whole: an outline would cost about as much. */
export const WHOLE_DOCUMENT_TOKENS = 1_500;
/** A section with no heading of its own is cut at about this size. */
const CHUNK_TOKENS = 600;

const NUMBERED_HEADING = /^(\d+(\.\d+){0,3}\.?|[IVXLC]+\.|[A-Z]\.)\s+\S/;

/** Lines that are a heading, judged by how the document itself marks them. */
function headingLines(lines: DocumentLine[]): Set<number> {
  const marked = new Set<number>();
  lines.forEach((line, i) => {
    if (line.heading) marked.add(i);
  });
  if (marked.size > 0) return marked;

  // PDFs mark headings by size: text set noticeably larger than the body.
  const sizes = lines.map((l) => l.size).filter((s): s is number => s !== undefined && s > 0);
  const body = median(sizes);
  lines.forEach((line, i) => {
    const text = line.text.trim();
    if (text.length < 2 || text.length > 90 || /[.:;,]$/.test(text)) return;
    const larger = body !== undefined && line.size !== undefined && line.size >= body * 1.15;
    const numbered = NUMBERED_HEADING.test(text) && text.split(/\s+/).length <= 12;
    if (larger || numbered) marked.add(i);
  });
  return marked;
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * The document's sections: one per heading, and where there are no headings
 * (or a section runs long), chunks of about CHUNK_TOKENS cut at page or
 * paragraph boundaries, titled by their first words.
 */
export function sectionize(document: ExtractedDocument): Section[] {
  const lines = document.lines.filter((l) => l.text.trim().length > 0);
  const headings = headingLines(lines);
  const raw: { title: string | null; lines: DocumentLine[] }[] = [];

  let current: { title: string | null; lines: DocumentLine[] } = { title: null, lines: [] };
  lines.forEach((line, i) => {
    if (headings.has(i)) {
      if (current.lines.length > 0 || current.title) raw.push(current);
      current = { title: line.text.trim(), lines: [] };
      return;
    }
    current.lines.push(line);
  });
  if (current.lines.length > 0 || current.title) raw.push(current);

  const sections: Section[] = [];
  for (const part of raw) {
    chunkLines(part.lines).forEach((chunk, k) => {
      const text = chunk.map((l) => l.text).join('\n').trim();
      const first = chunk[0]?.page ?? lastPageOf(sections);
      const title = part.title
        ? k === 0
          ? part.title
          : `${part.title} (cont.)`
        : firstWords(text) || `Page ${String(first)}`;
      sections.push({
        id: `§${String(sections.length + 1)}`,
        title,
        firstPage: first,
        lastPage: chunk.at(-1)?.page ?? first,
        text,
        tokens: estimateTokens(text),
      });
    });
  }
  return sections;
}

/** A section's lines in pieces no larger than CHUNK_TOKENS, cut between lines. */
function chunkLines(lines: DocumentLine[]): DocumentLine[][] {
  const chunks: DocumentLine[][] = [];
  let piece: DocumentLine[] = [];
  let size = 0;
  for (const line of lines) {
    const cost = estimateTokens(line.text);
    // Prefer cutting where a page turns, once the piece is half full.
    const pageTurn = piece.length > 0 && piece.at(-1)!.page !== line.page && size > CHUNK_TOKENS / 2;
    if (piece.length > 0 && (size + cost > CHUNK_TOKENS || pageTurn)) {
      chunks.push(piece);
      piece = [];
      size = 0;
    }
    piece.push(line);
    size += cost;
  }
  if (piece.length > 0 || chunks.length === 0) chunks.push(piece);
  return chunks;
}

function lastPageOf(sections: Section[]): number {
  return sections.at(-1)?.lastPage ?? 1;
}

function firstWords(text: string): string {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').slice(0, 8).join(' ');
  return words.length > 0 ? `${words}…` : '';
}

/**
 * Word stems, compared by their first five letters: Turkish and other
 * agglutinative languages put the grammar on the end of the word, so
 * "yöntemi", "yöntemde" and "yöntemler" are the same word for this purpose.
 */
function stems(text: string): Set<string> {
  const out = new Set<string>();
  for (const word of text.toLocaleLowerCase().match(/\p{L}[\p{L}\p{N}]{3,}/gu) ?? []) {
    out.add(word.slice(0, 5));
  }
  return out;
}

/** Explicit references: "page 4", "sayfa 4", "s. 4", "§3", "section 2.1", "bölüm 2". */
function referencedPages(text: string): Set<number> {
  const pages = new Set<number>();
  for (const match of text.matchAll(/(?:^|[^\p{L}])(?:page|pages|sayfa\p{L}*|slayt\p{L}*|slide|s\.|p\.|pp\.)\s*(\d{1,4})/giu)) {
    pages.add(Number(match[1]));
  }
  // Turkish puts the number first: "5. sayfada", "3. slayttaki".
  for (const match of text.matchAll(/(\d{1,4})\.\s*(?:sayfa|slayt|bölüm)\p{L}*/giu)) {
    pages.add(Number(match[1]));
  }
  return pages;
}

function referencedTitles(text: string): string[] {
  return [...text.matchAll(/(?:section|bölüm|kısım|chapter)\s+((?:\d+\.)*\d+)/giu)].map((m) => m[1]!);
}

function referencedLandmarks(text: string): Set<string> {
  return new Set([...text.matchAll(/§\s?(\d+)/gu)].map((m) => `§${m[1]!}`));
}

/**
 * The sections the conversation is about, best first: those it names
 * outright (a page, a section number, a landmark), then those sharing the
 * most words with it, weighted by how rare the word is in the document.
 */
export function rankSections(sections: Section[], conversation: string): Section[] {
  const asked = stems(conversation);
  const pages = referencedPages(conversation);
  const titles = referencedTitles(conversation);
  const landmarks = referencedLandmarks(conversation);

  // How many sections each stem appears in: a word found everywhere says
  // nothing about which section is meant.
  const sectionStems = sections.map((s) => stems(`${s.title}\n${s.text}`));
  const spread = new Map<string, number>();
  for (const set of sectionStems) for (const stem of set) spread.set(stem, (spread.get(stem) ?? 0) + 1);

  const scored = sections.map((section, i) => {
    let score = 0;
    for (const stem of sectionStems[i]!) {
      if (asked.has(stem)) score += Math.log(1 + sections.length / (spread.get(stem) ?? 1));
    }
    // Density, not length: a long section shares more words by being long.
    score /= Math.sqrt(1 + section.tokens / 200);
    const named =
      landmarks.has(section.id) ||
      titles.some((n) => section.title.startsWith(n)) ||
      [...pages].some((p) => p >= section.firstPage && p <= section.lastPage);
    return { section, score: named ? Number.POSITIVE_INFINITY : score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.section);
}

export interface PreparedDocument {
  name: string;
  pageCount: number;
  unit: DocumentUnit;
  sections: Section[];
  /** Landmarks of the sections carried in full. */
  included: Set<string>;
  fullTokens: number;
}

/**
 * Chooses what of each document goes along, within the budget shared by all
 * of them. A small document goes whole. Otherwise its sections are taken in
 * order of relevance until its share of the budget is spent.
 */
export function prepareDocuments(
  documents: ExtractedDocument[],
  conversation: string,
  budget = DOCUMENT_TOKEN_BUDGET,
): PreparedDocument[] {
  const share = documents.length > 0 ? Math.floor(budget / documents.length) : 0;
  return documents.map((document) => {
    const sections = sectionize(document);
    const fullTokens = sections.reduce((n, s) => n + s.tokens, 0);
    const included = new Set<string>();
    if (fullTokens <= Math.min(share, WHOLE_DOCUMENT_TOKENS) || fullTokens <= share / 2) {
      sections.forEach((s) => included.add(s.id));
    } else {
      // The outline itself costs about a dozen tokens a line.
      let spent = sections.length * 12;
      const take = (section: Section) => {
        if (spent + section.tokens > share) return;
        included.add(section.id);
        spent += section.tokens;
      };
      rankSections(sections, conversation).forEach(take);
      // Nothing in the conversation points anywhere in particular: the
      // opening of a document is where it says what it is.
      if (included.size === 0) {
        for (const section of sections) {
          if (spent + section.tokens > share / 2) break;
          take(section);
        }
      }
    }
    return {
      name: document.name,
      pageCount: document.pageCount,
      unit: document.unit ?? 'page',
      sections,
      included,
      fullTokens,
    };
  });
}

const UNIT_LABEL: Record<DocumentUnit, [one: string, many: string]> = {
  page: ['p.', 'pages'],
  slide: ['slide ', 'slides'],
  sheet: ['sheet ', 'sheets'],
  chapter: ['ch. ', 'chapters'],
};

function pagesOf(section: Section, doc: Pick<PreparedDocument, 'pageCount' | 'unit'>): string {
  if (doc.pageCount <= 1) return '';
  const [label] = UNIT_LABEL[doc.unit];
  return section.firstPage === section.lastPage
    ? ` · ${label}${String(section.firstPage)}`
    : ` · ${label}${String(section.firstPage)}–${String(section.lastPage)}`;
}

/** The documents as Markdown, for the transfer package. */
export function renderDocuments(documents: PreparedDocument[]): string {
  if (documents.length === 0) return '';
  const parts: string[] = ['## Documents from the conversation', ''];
  for (const doc of documents) {
    const whole = doc.included.size === doc.sections.length;
    const carried = doc.sections.filter((s) => doc.included.has(s.id));
    const carriedTokens = carried.reduce((n, s) => n + s.tokens, 0);
    const pages = doc.pageCount > 1 ? `${String(doc.pageCount)} ${UNIT_LABEL[doc.unit][1]}, ` : '';
    parts.push(
      `### ${doc.name}`,
      whole
        ? `(${pages}carried in full)`
        : `(${pages}${String(doc.sections.length)} sections; ${String(carried.length)} carried in full, ` +
            `about ${String(carriedTokens)} of ${String(doc.fullTokens)} tokens)`,
      '',
    );
    if (!whole) {
      parts.push('Outline — sections marked ✓ are below:');
      for (const section of doc.sections) {
        const mark = doc.included.has(section.id) ? '✓' : ' ';
        parts.push(`- [${mark}] ${section.id} · ${section.title}${pagesOf(section, doc)}`);
      }
      parts.push('');
    }
    for (const section of carried) {
      parts.push(`#### ${section.id} · ${section.title}${pagesOf(section, doc)}`, section.text, '');
    }
  }
  if (documents.some((d) => d.included.size < d.sections.length)) {
    parts.push(
      'Sections without ✓ were left out to save space. If one matters to my question, ' +
        'ask me for it by its landmark (for example §3) instead of guessing what it says.',
      '',
    );
  }
  return parts.join('\n');
}
