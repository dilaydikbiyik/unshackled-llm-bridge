import type { DocumentLine } from '@domain/documents/landmarks';

/**
 * Formats whose text is wrapped in markup: HTML (and the XHTML inside EPUB),
 * RTF, and Jupyter notebooks. Read with string processing rather than a DOM
 * parser so the same code runs in a content script, a worker or a test.
 */

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–',
  hellip: '…', laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', copy: '©',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code.startsWith('#x') || code.startsWith('#X')) return String.fromCodePoint(parseInt(code.slice(2), 16));
    if (code.startsWith('#')) return String.fromCodePoint(Number(code.slice(1)));
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/** Tags out, entities decoded, whitespace collapsed. */
export function plainText(markup: string): string {
  return decodeEntities(markup.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

const BLOCK = /<\/?(p|div|li|tr|br|section|article|blockquote|pre|table|ul|ol|dd|dt|figcaption)\b[^>]*>/gi;

/** HTML as lines, with h1–h6 marked as headings. */
export function htmlLines(html: string, page = 1): DocumentLine[] {
  const body = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  const cleaned = body
    .replace(/<(script|style|noscript|svg|nav|header|footer)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const lines: DocumentLine[] = [];
  // Headings are split out first, so their text never merges with a paragraph.
  for (const part of cleaned.split(/(<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>)/i)) {
    const heading = /^<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>$/i.exec(part);
    if (heading) {
      const text = plainText(heading[1]!);
      if (text) lines.push({ text, page, heading: true });
      continue;
    }
    for (const block of part.replace(BLOCK, '\n').split('\n')) {
      const text = plainText(block);
      if (text) lines.push({ text, page });
    }
  }
  return lines;
}

/**
 * RTF, reduced to its text: groups that hold no body text (fonts, colours,
 * styles, pictures) are dropped, paragraph marks become line breaks, and
 * escaped characters are decoded — `\'xx` as Windows-1252 or the code page the
 * document declares, `\uN` as Unicode.
 */
export function rtfLines(rtf: string): DocumentLine[] {
  const codepage = /\\ansicpg(\d+)/.exec(rtf)?.[1] ?? '1252';
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(`windows-${codepage}`);
  } catch {
    decoder = new TextDecoder('windows-1252');
  }
  let text = rtf
    .replace(/\{\\\*[^{}]*(\{[^{}]*\}[^{}]*)*\}/g, '')
    .replace(/\{\\(fonttbl|colortbl|stylesheet|info|pict)[\s\S]*?\}\s*\}/g, '')
    .replace(/\\(par|line|row)\b ?/g, '\n')
    .replace(/\\tab\b ?/g, '\t')
    .replace(/\\u(-?\d+)\??/g, (_, n: string) => String.fromCharCode((Number(n) + 65536) % 65536))
    .replace(/\\'([0-9a-f]{2})/gi, (_, hex: string) => decoder.decode(new Uint8Array([parseInt(hex, 16)])))
    .replace(/\\[a-z]+-?\d* ?/gi, '')
    .replace(/\\([{}\\])/g, '$1')
    .replace(/[{}]/g, '');
  text = text.replace(/\r/g, '');
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ text: line, page: 1 }));
}

interface NotebookCell {
  cell_type?: string;
  source?: string | string[];
}

/**
 * A Jupyter notebook: markdown cells with their headings, code cells fenced
 * with the notebook's language. Outputs are left out — they are what running
 * the code produces, and often images or thousands of lines.
 */
export function notebookLines(json: string): DocumentLine[] | null {
  let notebook: { cells?: NotebookCell[]; metadata?: { kernelspec?: { language?: string } } };
  try {
    notebook = JSON.parse(json) as typeof notebook;
  } catch {
    return null;
  }
  if (!Array.isArray(notebook.cells)) return null;
  const language = notebook.metadata?.kernelspec?.language ?? 'python';
  const lines: DocumentLine[] = [];
  for (const cell of notebook.cells) {
    const source = Array.isArray(cell.source) ? cell.source.join('') : (cell.source ?? '');
    if (!source.trim()) continue;
    if (cell.cell_type === 'markdown') {
      for (const raw of source.split('\n')) {
        const heading = /^#{1,6}\s+(.*)$/.exec(raw);
        lines.push(heading ? { text: heading[1]!.trim(), page: 1, heading: true } : { text: raw, page: 1 });
      }
    } else if (cell.cell_type === 'code') {
      lines.push({ text: `\`\`\`${language}`, page: 1 });
      for (const raw of source.split('\n')) lines.push({ text: raw, page: 1 });
      lines.push({ text: '```', page: 1 });
    }
  }
  return lines;
}
