import type { BridgeConversation, ChatMessage } from '@domain/conversation/schema';

/**
 * Token count, estimated from what kind of characters the text is made of.
 *
 * It used to be characters ÷ 4, which is roughly right for English prose and
 * wrong for everything else: measured against GPT-4o/5's tokenizer (o200k) on
 * the FLORES-200 parallel corpus, it overcounted English by 23%, undercounted
 * Turkish by 11% and Chinese, Japanese and Korean by 58–67%. So the dialog
 * claimed a Turkish chat was smaller than its English translation — the
 * opposite of the truth — and a CJK chat sailed past the length warning.
 *
 * The weights below were fitted by least squares on FLORES-200 devtest in ten
 * languages plus this project's own source code, and checked on data the fit
 * never saw: within 5% for every language on FLORES dev (English +3.6%,
 * Turkish −3.0%), within 2% for English and Turkish chat text, and 2–15% over
 * on code. A word costs a little; an ASCII letter about a fifth of a token; a
 * letter outside ASCII (ğ, ş, é) much more, because tokenizers split around
 * it; a CJK character most of a token; a run of punctuation about one token.
 */
export function estimateTokens(text: string): number {
  let words = 0;
  let ascii = 0;
  let latin = 0;
  let cyrillic = 0;
  let arabic = 0;
  let cjk = 0;
  let punct = 0;
  let punctRuns = 0;
  let previous: 'space' | 'word' | 'punct' = 'space';
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    // A surrogate pair is one character outside the BMP: emoji, rare CJK.
    if (code >= 0xd800 && code <= 0xdbff) {
      i += 1;
      cjk += 1;
      if (previous !== 'word') words += 1;
      previous = 'word';
      continue;
    }
    const kind = classify(code);
    if (kind === SPACE) {
      previous = 'space';
      continue;
    }
    if (kind === PUNCT) {
      punct += 1;
      if (previous !== 'punct') punctRuns += 1;
      previous = 'punct';
      continue;
    }
    if (previous !== 'word') words += 1;
    previous = 'word';
    if (kind === ASCII) ascii += 1;
    else if (kind === CYRILLIC) cyrillic += 1;
    else if (kind === ARABIC) arabic += 1;
    else if (kind === CJK) cjk += 1;
    else latin += 1;
  }
  const estimate =
    0.2145 * words +
    0.179 * ascii +
    0.88 * latin +
    0.2416 * cyrillic +
    0.3173 * arabic +
    0.7447 * cjk +
    0.1124 * punct +
    1.1593 * punctRuns;
  return Math.ceil(estimate);
}

const SPACE = 0;
const ASCII = 1;
const OTHER_LETTER = 2;
const CYRILLIC = 3;
const ARABIC = 4;
const CJK = 5;
const PUNCT = 6;

function classify(code: number): number {
  if (code <= 0x20 || code === 0xa0 || (code >= 0x2000 && code <= 0x200b) || code === 0x3000) return SPACE;
  if ((code >= 0x30 && code <= 0x39) || (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) {
    return ASCII;
  }
  if (code < 0x80) return PUNCT;
  if (code >= 0x0400 && code <= 0x052f) return CYRILLIC;
  if ((code >= 0x0600 && code <= 0x06ff) || (code >= 0x0750 && code <= 0x077f)) return ARABIC;
  if (
    (code >= 0x1100 && code <= 0x11ff) ||
    (code >= 0x3040 && code <= 0x30ff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xac00 && code <= 0xd7af) ||
    (code >= 0xf900 && code <= 0xfaff)
  ) {
    return CJK;
  }
  // General and CJK punctuation, symbols, and Latin-1 signs (×, «, ©).
  if (
    (code >= 0x80 && code <= 0xbf) ||
    code === 0xd7 ||
    code === 0xf7 ||
    (code >= 0x2010 && code <= 0x2bff) ||
    (code >= 0x3001 && code <= 0x303f) ||
    (code >= 0xff00 && code <= 0xff20)
  ) {
    return PUNCT;
  }
  return OTHER_LETTER;
}

/** Above this, the fork dialog suggests trimming or summarizing. */
export const TRANSFER_TOKEN_BUDGET = 24_000;

/**
 * The most that is sent to the summarizer in one request.
 *
 * Summarizing was handed the whole slice however long it was. A conversation
 * big enough to be worth summarizing is exactly the one that can exceed the
 * model's context window, and the request then fails — on the feature meant to
 * rescue long conversations. Well under any current model's limit, so the
 * request fails for real reasons or not at all.
 */
export const SUMMARY_INPUT_BUDGET = 120_000;

export interface PreparedSlice {
  messages: ChatMessage[];
  /** How many messages were elided by trimming (0 = nothing dropped). */
  trimmedCount: number;
  /** How many surviving messages had their text shortened (0 = none). */
  truncatedCount: number;
}

/** A shortened message keeps at least this much, or shortening it is pointless. */
export const MIN_KEPT_CHARS = 600;

/** Marks where text was removed from the middle of a message. */
export const TRUNCATION_MARK = '\n\n[… part of this message removed for length …]\n\n';

export function sliceUpTo(conversation: BridgeConversation, cutIndex: number): ChatMessage[] {
  return conversation.messages.filter((m) => m.index <= cutIndex);
}

export function sliceTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
}

/**
 * Trims a slice to fit the budget: keeps the first message (it usually frames
 * the whole conversation) and the most recent messages, dropping from the
 * oldest middle outward.
 */
export function trimToBudget(
  messages: ChatMessage[],
  budgetTokens = TRANSFER_TOKEN_BUDGET,
): PreparedSlice {
  const kept = [...messages];
  let trimmedCount = 0;
  while (kept.length > 2 && sliceTokens(kept) > budgetTokens) {
    kept.splice(1, 1);
    trimmedCount += 1;
  }

  // Dropping whole messages stops at two, so a pair of very long ones — one
  // pasted document and one long answer — used to sail past the budget by any
  // margin at all, while the package reported that nothing had been trimmed.
  // What cannot be dropped is shortened, and says so where the text was cut.
  let truncatedCount = 0;
  if (sliceTokens(kept) > budgetTokens) {
    // The cut mark is text too, and is paid for out of each message's share.
    const allowanceTokens = budgetTokens / Math.max(kept.length, 1) - estimateTokens(TRUNCATION_MARK);
    for (const [index, message] of kept.entries()) {
      // Converted to characters at this message's own density: a token of
      // Chinese is a character or so, a token of English four.
      const perToken = message.content.length / Math.max(estimateTokens(message.content), 1);
      const allowanceChars = Math.max(MIN_KEPT_CHARS, Math.floor(allowanceTokens * perToken));
      if (message.content.length <= allowanceChars) continue;
      kept[index] = { ...message, content: shorten(message.content, allowanceChars) };
      truncatedCount += 1;
    }
  }

  return { messages: kept, trimmedCount, truncatedCount };
}

/**
 * Keeps the head and the tail of a message: the head says what it is, and the
 * tail is where a long answer lands its conclusion.
 */
function shorten(content: string, allowanceChars: number): string {
  const half = Math.floor((allowanceChars - TRUNCATION_MARK.length) / 2);
  if (half <= 0) return content.slice(0, allowanceChars);
  return `${content.slice(0, half)}${TRUNCATION_MARK}${content.slice(-half)}`;
}
