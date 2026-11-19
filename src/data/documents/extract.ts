import type { DocumentLine, DocumentUnit, ExtractedDocument } from '@domain/documents/landmarks';
import { htmlLines, notebookLines, rtfLines } from './markup';
import { epubLines, odfLines, pptxLines, xlsxLines } from './office';

/**
 * Text out of the files a user uploaded, on their own machine.
 *
 * The bytes are already in the local sandbox (attachment capture), so nothing
 * here touches the network: PDFs are read with pdf.js running in this page's
 * extension context, DOCX is unzipped and its XML read, and text formats are
 * decoded. A format that holds no text — images, scanned PDFs — comes back as
 * null, and the file travels as a file, as before.
 */

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'jsonl', 'xml', 'yaml', 'yml', 'toml', 'ini',
  'log', 'tex', 'rst', 'py', 'js', 'ts', 'tsx', 'jsx', 'java', 'kt', 'go', 'rs',
  'c', 'h', 'cpp', 'hpp', 'cs', 'rb', 'php', 'swift', 'sql', 'sh', 'r', 'm', 'scala', 'lua',
]);

type Kind = 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'odf' | 'epub' | 'html' | 'rtf' | 'ipynb' | 'text';

const BY_EXTENSION: Record<string, Kind> = {
  pdf: 'pdf', docx: 'docx', pptx: 'pptx', xlsx: 'xlsx', xlsm: 'xlsx',
  odt: 'odf', odp: 'odf', ods: 'odf', epub: 'epub', html: 'html', htm: 'html', xhtml: 'html',
  rtf: 'rtf', ipynb: 'ipynb',
};

const BY_MIME: Record<string, Kind> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.oasis.opendocument.text': 'odf',
  'application/vnd.oasis.opendocument.presentation': 'odf',
  'application/vnd.oasis.opendocument.spreadsheet': 'odf',
  'application/epub+zip': 'epub',
  'text/html': 'html',
  'application/rtf': 'rtf',
  'text/rtf': 'rtf',
};

/** What a page of each kind is called in a landmark. */
const UNITS: Partial<Record<Kind, DocumentUnit>> = { pptx: 'slide', xlsx: 'sheet', epub: 'chapter' };

function kindOf(name: string, mime: string): Kind | null {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  const known = BY_EXTENSION[ext] ?? BY_MIME[mime];
  if (known) return known;
  if (mime.startsWith('text/') || TEXT_EXTENSIONS.has(ext)) return 'text';
  return null;
}

/** Whether a file is one this module can turn into text. */
export function canExtractText(name: string, mime: string): boolean {
  return kindOf(name, mime) !== null;
}

export async function extractDocument(
  bytes: ArrayBuffer,
  name: string,
  mime: string,
): Promise<ExtractedDocument | null> {
  const kind = kindOf(name, mime);
  if (!kind) return null;
  const decoded = () => new TextDecoder().decode(bytes);
  let lines: DocumentLine[] | null = null;
  let pageCount = 0;
  switch (kind) {
    case 'pdf':
      ({ lines, pageCount } = await pdfLines(bytes));
      break;
    case 'docx':
      lines = await docxLines(bytes);
      break;
    case 'pptx':
      lines = await pptxLines(bytes);
      break;
    case 'xlsx':
      lines = await xlsxLines(bytes);
      break;
    case 'odf':
      lines = await odfLines(bytes);
      break;
    case 'epub':
      lines = await epubLines(bytes);
      break;
    case 'html':
      lines = htmlLines(decoded());
      break;
    case 'rtf':
      lines = rtfLines(decoded());
      break;
    case 'ipynb':
      lines = notebookLines(decoded());
      break;
    case 'text':
      lines = textLines(decoded(), name);
      break;
  }
  if (!lines) return null;
  // Text-free: a scanned PDF, an empty file. Not worth a section of nothing.
  if (!lines.some((l) => l.text.trim().length > 0)) return null;
  const unit = UNITS[kind];
  return {
    name,
    pageCount: pageCount || Math.max(1, ...lines.map((l) => l.page)),
    lines,
    ...(unit ? { unit } : {}),
  };
}

/** Markdown headings are marked; anything else is plain lines. */
export function textLines(text: string, name: string): DocumentLine[] {
  const markdown = /\.(md|markdown)$/i.test(name);
  return text.split(/\r?\n/).map((raw) => {
    const heading = markdown ? /^#{1,6}\s+(.*)$/.exec(raw) : null;
    return heading ? { text: heading[1]!.trim(), page: 1, heading: true } : { text: raw, page: 1 };
  });
}

/**
 * DOCX is a zip of XML. Paragraphs are `<w:p>`, their text `<w:t>`, and a
 * heading is a paragraph whose style says so — in any language Word was set to
 * ("Heading1", "Başlık1", "Titre1", "Überschrift1"…), so the style is matched
 * by its trailing level digit and a name that is not "Normal"-like body text.
 */
export async function docxLines(bytes: ArrayBuffer): Promise<DocumentLine[] | null> {
  const { unzipSync, strFromU8 } = await import('fflate');
  let xml: string;
  try {
    const files = unzipSync(new Uint8Array(bytes), { filter: (f) => f.name === 'word/document.xml' });
    const doc = files['word/document.xml'];
    if (!doc) return null;
    xml = strFromU8(doc);
  } catch {
    return null;
  }
  const lines: DocumentLine[] = [];
  let page = 1;
  for (const [paragraph] of xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)) {
    const text = [...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>/g)]
      .map((m) => (m[1] === undefined ? '\t' : decodeXml(m[1])))
      .join('');
    const style = /<w:pStyle w:val="([^"]+)"/.exec(paragraph)?.[1] ?? '';
    const heading = /^(heading|başlık|baslik|titre|überschrift|titolo|título|kop|nagłówek|заголовок)\s*\d$/i.test(style) || /^Title$/i.test(style);
    if (text.trim()) lines.push({ text, page, ...(heading ? { heading: true } : {}) });
    // Word records the page breaks it rendered; a document saved by another
    // tool may have none, and is then one page.
    if (/<w:lastRenderedPageBreak\/>|<w:br w:type="page"\/>/.test(paragraph)) page += 1;
  }
  return lines;
}

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

interface TextItem {
  str: string;
  transform: number[];
  height: number;
  hasEOL?: boolean;
}

/**
 * pdf.js, run in this context rather than in a worker: a content script cannot
 * start a worker from the extension's origin inside someone else's page. Its
 * worker module is loaded as a plain module and handed to pdf.js, which then
 * runs it on this thread — slower, which for reading text once is fine.
 */
async function pdfLines(bytes: ArrayBuffer): Promise<{ lines: DocumentLine[] | null; pageCount: number }> {
  ensurePromiseTry();
  // The legacy build: the modern one needs Map.getOrInsertComputed,
  // Uint8Array.toHex and Math.sumPrecise, which only the newest Chrome has —
  // on an older Chrome, or a Chromium that lags behind it, a PDF read as
  // nothing.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs');
  (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker;

  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes.slice(0)),
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  });
  try {
    const pdf = await task.promise;
    const lines: DocumentLine[] = [];
    for (let n = 1; n <= pdf.numPages; n += 1) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      lines.push(...linesOfPage(content.items as TextItem[], n));
      page.cleanup();
    }
    return { lines, pageCount: pdf.numPages };
  } catch {
    return { lines: null, pageCount: 0 };
  } finally {
    void task.destroy();
  }
}

/** Text items into lines: a new line where pdf.js marks one or the baseline moves. */
export function linesOfPage(items: TextItem[], page: number): DocumentLine[] {
  const lines: DocumentLine[] = [];
  let text = '';
  let size = 0;
  let baseline: number | null = null;
  const flush = () => {
    if (text.trim()) lines.push({ text: text.replace(/\s+/g, ' ').trim(), page, size });
    text = '';
    size = 0;
  };
  for (const item of items) {
    const y = item.transform[5] ?? 0;
    if (baseline !== null && Math.abs(y - baseline) > Math.max(2, size * 0.5) && text) flush();
    baseline = y;
    text += item.str;
    size = Math.max(size, item.height || Math.hypot(item.transform[2] ?? 0, item.transform[3] ?? 0));
    if (item.hasEOL) flush();
  }
  flush();
  return lines;
}

/**
 * pdf.js 5 calls `Promise.try`, which Chrome has had only since version 128
 * (and Node since 22.10). On anything older, reading a PDF hung until it
 * timed out. Defined only where it is missing, with the standard's meaning.
 */
function ensurePromiseTry(): void {
  const P = Promise as PromiseConstructor & { try?: unknown };
  if (typeof P.try === 'function') return;
  Object.defineProperty(Promise, 'try', {
    configurable: true,
    writable: true,
    value: <T>(fn: (...args: unknown[]) => T | PromiseLike<T>, ...args: unknown[]) =>
      new Promise<T>((resolve) => resolve(fn(...args))),
  });
}
