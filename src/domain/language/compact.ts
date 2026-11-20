import type { ChatMessage } from '@domain/conversation/schema';

/**
 * "Compact context": the history carried in English, the reply asked for in
 * the user's own language.
 *
 * Measured on the FLORES-200 parallel corpus, the same text costs GPT-4o/5
 * 1.43 times as many tokens in Turkish as in English (2.04× on DeepSeek), and
 * English is the cheapest language on every tokenizer measured except
 * DeepSeek's — Chinese, often suggested, saves less than half as much on GPT
 * (docs/research/dil-token-verimliligi.md). So the prose of earlier messages
 * is translated; what a translation would damage is not: code, inline code,
 * links and addresses pass through unchanged, and the latest message — the
 * one the target is answering — stays exactly as the user wrote it.
 *
 * Pure: the translation itself is a capability handed in by the caller.
 */

export type Segment = { translate: true; text: string } | { translate: false; text: string };

/**
 * Pieces of a message, in order, marked by whether translating them is safe.
 * Kept as written: fenced code blocks, inline code, URLs, e-mail addresses,
 * and Markdown link targets.
 */
const KEEP = /```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`|\]\([^)\s]+\)|https?:\/\/[^\s)>\]]+|[\w.+-]+@[\w-]+\.[\w.-]+/g;

export function segment(content: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const match of content.matchAll(KEEP)) {
    const start = match.index;
    if (start > last) out.push({ translate: true, text: content.slice(last, start) });
    out.push({ translate: false, text: match[0] });
    last = start + match[0].length;
  }
  if (last < content.length) out.push({ translate: true, text: content.slice(last) });
  return out;
}

/** Translates a whole message through `translate`, keeping what must be kept. */
export async function translateMessage(
  content: string,
  translate: (text: string) => Promise<string>,
): Promise<string> {
  const parts = await Promise.all(
    segment(content).map(async (part) => {
      if (!part.translate) return part.text;
      // Line by line: given a long block, Chrome's translator was seen to
      // drop a whole sentence ("Etiketler: istatistik maddeleri [Kesin] veya
      // [Olası]." vanished from a paragraph). Shorter input keeps it honest,
      // and keeps Markdown line structure — lists, headings, tables — intact.
      const lines = await Promise.all(part.text.split('\n').map((line) => translatePiece(line, translate)));
      return lines.join('\n');
    }),
  );
  return parts.join('');
}

/**
 * Below this share of the original's length, a translation is taken to have
 * lost something and the original is kept. English runs about as long as
 * Turkish, German or Spanish in characters (FLORES-200: 0.97, 0.86, 0.84);
 * half is far outside that.
 */
export const MIN_LENGTH_RATIO = 0.5;

async function translatePiece(text: string, translate: (text: string) => Promise<string>): Promise<string> {
  if (!/\p{L}/u.test(text)) return text;
  // A table row is translated cell by cell, so the pipes that make it a row
  // are never handed to the translator.
  if (/^\s*\|.*\|\s*$/.test(text)) {
    const cells = await Promise.all(text.split('|').map((cell) => translatePiece(cell, translate)));
    return cells.join('|');
  }
  // Translators trim; the spacing around a kept piece of code is part of the
  // sentence and is put back. So is a list or heading marker.
  const lead = /^\s*(?:[-*+]\s+|\d+[.)]\s+|#{1,6}\s+|>\s*)?/.exec(text)![0];
  const trail = /\s*$/.exec(text)![0];
  const core = text.slice(lead.length, text.length - trail.length);
  if (!/\p{L}/u.test(core)) return text;
  const translated = (await translate(core)).trim();
  // Scripts differ in density: compare only within alphabetic scripts, where
  // length is comparable; a CJK source is always taken as translated.
  const comparable = !/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(core);
  if (!translated || (comparable && translated.length < core.length * MIN_LENGTH_RATIO)) return text;
  return `${lead}${translated}${trail}`;
}

/**
 * The slice with every message but the last translated. The last is what the
 * target is about to answer, so it travels word for word.
 */
export async function compactMessages(
  messages: ChatMessage[],
  translate: (text: string) => Promise<string>,
): Promise<ChatMessage[]> {
  return Promise.all(
    messages.map(async (message, i) =>
      i === messages.length - 1 ? message : { ...message, content: await translateMessage(message.content, translate) },
    ),
  );
}

/** "Turkish" for "tr", in English — the language the package is written in. */
export function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** The sentence that tells the target what happened and how to answer. */
export function translationNote(from: string): string {
  const name = languageName(from);
  return (
    `Earlier messages were translated from ${name} into English to save space. ` +
    `Reply to me in ${name}.`
  );
}
