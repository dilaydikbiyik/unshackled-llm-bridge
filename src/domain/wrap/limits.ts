import type { BridgeConversation, ChatMessage } from '@domain/conversation/schema';

/** Rough heuristic: ~4 characters per token. Good enough for a UI warning. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
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
    const allowanceChars = Math.max(
      MIN_KEPT_CHARS,
      Math.floor((budgetTokens * 4) / Math.max(kept.length, 1)),
    );
    for (const [index, message] of kept.entries()) {
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
