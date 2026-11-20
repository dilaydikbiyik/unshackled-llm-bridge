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
    expect(estimateTokens('word '.repeat(200))).toBeGreaterThan(estimateTokens('word '.repeat(100)) * 1.9);
  });

  // Measured with o200k: a Turkish paragraph and its English translation are
  // 87 and 71 tokens; the Chinese 77. Characters ÷ 4 had them at 83, 88 and 27.
  const turkish =
    'Hakem modelin her cevaba puan verecek ve gerekçesini açıklayacak. Ama burada önemli bir nokta var: hakemin verdiği puanın doğru olduğunu varsayamayız. Bu yüzden aynı cevapları insan olarak sen de değerlendirmelisin. Pilot sonunda özellikle şu soruyu cevapla: Bir iddiayı üç sınıftan birine tutarlı biçimde yerleştirebiliyor musun?';
  const english =
    "The judge model will score each answer and explain its reasoning. But there is an important point here: we cannot assume the judge's score is correct. That is why you should also evaluate the same answers yourself as a human. At the end of the pilot, answer this question in particular: can you consistently place a claim into one of the three classes?";
  const chinese =
    '评审模型将为每个回答打分并解释理由。但这里有一个重要的问题:我们不能假设评审给出的分数是正确的。因此,你也应该以人的身份评估同样的回答。在试点结束时,请特别回答这个问题:你能否始终如一地将一个论断归入三个类别之一?';

  it('counts Turkish as costlier than its English translation, as tokenizers do', () => {
    expect(estimateTokens(turkish)).toBeGreaterThan(estimateTokens(english));
  });

  it('lands within 15% of the real count for Turkish, English and Chinese', () => {
    for (const [text, real] of [
      [turkish, 87],
      [english, 71],
      [chinese, 77],
    ] as const) {
      expect(Math.abs(estimateTokens(text) - real) / real).toBeLessThan(0.15);
    }
  });

  it('counts a run of punctuation as about one token, not one per character', () => {
    expect(estimateTokens('});')).toBeLessThanOrEqual(2);
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

  it('trims a very long conversation quickly', () => {
    // 2,000 messages, about a megabyte: measured once each, not once per drop.
    const slice = messages(2000, 500);
    const started = performance.now();
    const result = trimToBudget(slice, 2000);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(sliceTokens(result.messages)).toBeLessThanOrEqual(2000);
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
