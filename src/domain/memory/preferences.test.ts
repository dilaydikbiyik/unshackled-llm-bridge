import { describe, expect, it } from 'vitest';
import { createConversation, type BridgeConversation } from '@domain/conversation/schema';
import type { PlatformId } from '@domain/platforms';
import { learnPreferences } from './preferences';

let n = 0;
function chat(platform: PlatformId, user: string[], assistant: string[] = []): BridgeConversation {
  n += 1;
  const messages = [
    ...user.map((content, index) => ({ role: 'user' as const, content, index, attachmentRefs: [] })),
    ...assistant.map((content, i) => ({
      role: 'assistant' as const,
      content,
      index: user.length + i,
      attachmentRefs: [],
    })),
  ];
  return createConversation({
    id: `${platform}-${String(n)}`,
    sourcePlatform: platform,
    createdAt: '2026-11-19T00:00:00Z',
    messages,
    attachments: [],
  });
}

const ids = (conversations: BridgeConversation[]) => learnPreferences(conversations).map((p) => p.id);

describe('learnPreferences', () => {
  it('notices an instruction repeated across conversations', () => {
    const learned = learnPreferences([
      chat('chatgpt', ['bunu açıkla', 'daha kısa yaz lütfen']),
      chat('claude', ['kısaca anlat']),
      chat('gemini', ['uzatma, sadece sonucu söyle']),
    ]);

    expect(learned[0]).toMatchObject({ id: 'shorter', conversations: 3 });
    expect(learned[0]?.platforms.sort()).toEqual(['chatgpt', 'claude', 'gemini']);
  });

  it('treats a single request as a request, not a preference', () => {
    expect(ids([chat('chatgpt', ['daha kısa yaz']), chat('claude', ['merhaba'])])).toEqual([]);
  });

  it('counts a conversation once however many times it repeats the instruction', () => {
    const learned = learnPreferences([
      chat('chatgpt', ['daha kısa', 'daha kısa', 'daha kısa']),
      chat('claude', ['kısaca anlat']),
    ]);
    expect(learned[0]?.conversations).toBe(2);
  });

  it('reads both languages the users of this extension write in', () => {
    expect(ids([chat('chatgpt', ['be concise please']), chat('claude', ['kısa tut'])])).toEqual([
      'shorter',
    ]);
    expect(
      ids([chat('chatgpt', ['türkçe cevap ver']), chat('claude', ['answer in Turkish please'])]),
    ).toContain('answerTurkish');
  });

  it('learns from the user, never from what the assistant wrote', () => {
    // An assistant saying "in short" profiles the model, not the person.
    expect(
      ids([
        chat('chatgpt', ['explain'], ['Kısaca: daha kısa yazmak gerekir.']),
        chat('claude', ['explain'], ['In short, be concise.']),
      ]),
    ).toEqual([]);
  });

  it('ignores instructions that only appear inside pasted code', () => {
    const pasted = '```\nError: message too long\n```';
    expect(ids([chat('chatgpt', [pasted]), chat('claude', [pasted])])).toEqual([]);
  });

  it('keeps the stronger of two contradictory preferences', () => {
    const learned = ids([
      chat('chatgpt', ['daha kısa']),
      chat('claude', ['kısaca anlat']),
      chat('gemini', ['kısa tut']),
      chat('chatgpt', ['daha detaylı anlat']),
      chat('claude', ['daha ayrıntılı']),
    ]);
    expect(learned).toContain('shorter');
    expect(learned).not.toContain('moreDetail');
  });

  it('does not mistake a topic for an instruction', () => {
    // "kısa" in "kısa film" is a subject, not a request for brevity.
    expect(ids([chat('chatgpt', ['kısa film önerisi']), chat('claude', ['kısa film senaryosu'])])).toEqual([]);
  });

  it('ranks what was asked for most often first', () => {
    const learned = ids([
      chat('chatgpt', ['örnek ver', 'kısaca']),
      chat('claude', ['örnek göster', 'kısa tut']),
      chat('gemini', ['daha kısa']),
    ]);
    expect(learned).toEqual(['shorter', 'withExample']);
  });

  it('has nothing to say about an empty archive', () => {
    expect(learnPreferences([])).toEqual([]);
  });
});
