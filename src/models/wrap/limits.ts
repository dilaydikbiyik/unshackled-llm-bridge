import type { BridgeConversation, ChatMessage } from '@models/conversation/schema';

/** Rough heuristic: ~4 characters per token. Good enough for a UI warning. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Above this, the fork dialog suggests trimming or summarizing. */
export const TRANSFER_TOKEN_BUDGET = 24_000;

export interface PreparedSlice {
  messages: ChatMessage[];
  /** How many messages were elided by trimming (0 = nothing dropped). */
  trimmedCount: number;
}

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
  return { messages: kept, trimmedCount };
}
