import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@models/conversation/schema';
import { estimateTokens, sliceTokens, trimToBudget } from './limits';

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
