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
      if (!part.translate || !/\p{L}/u.test(part.text)) return part.text;
      // Translators trim; the spacing around a kept piece of code is part of
      // the sentence and is put back.
      const lead = /^\s*/.exec(part.text)![0];
      const trail = /\s*$/.exec(part.text)![0];
      const core = part.text.slice(lead.length, part.text.length - trail.length);
      return `${lead}${await translate(core)}${trail}`;
    }),
  );
  return parts.join('');
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
