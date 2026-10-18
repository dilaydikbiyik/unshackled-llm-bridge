import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@domain/conversation/schema';
import { estimateTokens, sliceTokens, TRUNCATION_MARK, trimToBudget } from './limits';

function messages(count: number, size: number): ChatMessage[] {
  return Array.from({ length: count }, (_, index) => ({
    role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
    content: `m${index}-${'x'.repeat(size)}`,
    index,
    attachmentRefs: [],
  }));
}

describe('transfer length guard', () => {
  it('scales the estimate with text length', () => {
    expect(estimateTokens('x'.repeat(400))).toBe(100);
  });

  it('leaves a slice untouched when it already fits', () => {
    const slice = messages(4, 40);
    const result = trimToBudget(slice, 10_000);
    expect(result.trimmedCount).toBe(0);
    expect(result.messages).toEqual(slice);
  });

  it('trims from the middle, keeping the opening and the latest messages', () => {
    const slice = messages(10, 400);
    const result = trimToBudget(slice, 400);

    expect(result.trimmedCount).toBeGreaterThan(0);
    expect(sliceTokens(result.messages)).toBeLessThanOrEqual(400);
    // The first message frames the conversation and the last is what the user
    // is actually continuing from — both must survive.
    expect(result.messages[0]?.index).toBe(0);
    expect(result.messages.at(-1)?.index).toBe(9);
  });

  it('never trims below two messages, even under an impossible budget', () => {
    const result = trimToBudget(messages(6, 4000), 1);
    expect(result.messages).toHaveLength(2);
  });
});

/**
 * Dropping whole messages stops at two, so a pair of very long ones — a pasted
 * document and a long answer — used to sail past the budget by any margin at
 * all, while the package reported that nothing had been trimmed. The target
 * then received a paste far bigger than it was told to expect.
 */
describe('trimToBudget — when dropping messages is not enough', () => {
  const huge = (chars: number, index: number): ChatMessage => ({
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: 'x'.repeat(chars),
    index,
    attachmentRefs: [],
  });

  it('keeps a pair of enormous messages within the budget', () => {
    const prepared = trimToBudget([huge(400_000, 0), huge(400_000, 1)], 24_000);

    expect(sliceTokens(prepared.messages)).toBeLessThanOrEqual(24_000);
    expect(prepared.truncatedCount).toBe(2);
  });

  it('says where the text was cut, rather than cutting silently', () => {
    const prepared = trimToBudget([huge(400_000, 0), huge(400_000, 1)], 24_000);
    expect(prepared.messages[0]?.content).toContain(TRUNCATION_MARK.trim());
  });

  it('keeps the head and the tail of a shortened message', () => {
    const message: ChatMessage = {
      role: 'assistant',
      content: `START${'x'.repeat(200_000)}END`,
      index: 0,
      attachmentRefs: [],
    };
    const [shortened] = trimToBudget([message, huge(200_000, 1)], 24_000).messages;

    expect(shortened?.content.startsWith('START')).toBe(true);
    expect(shortened?.content.endsWith('END')).toBe(true);
  });

  it('leaves a conversation that already fits completely alone', () => {
    const small = [huge(400, 0), huge(400, 1), huge(400, 2)];
    const prepared = trimToBudget(small, 24_000);

    expect(prepared).toMatchObject({ trimmedCount: 0, truncatedCount: 0 });
    expect(prepared.messages).toEqual(small);
  });

  it('prefers dropping middle messages to shortening the ones it keeps', () => {
    // Forty messages of 4,000 characters: about 40,000 tokens, well over.
    const many = Array.from({ length: 40 }, (_, i) => huge(4_000, i));
    const prepared = trimToBudget(many, 24_000);

    expect(prepared.trimmedCount).toBeGreaterThan(0);
    expect(prepared.truncatedCount).toBe(0);
    expect(sliceTokens(prepared.messages)).toBeLessThanOrEqual(24_000);
  });
});
