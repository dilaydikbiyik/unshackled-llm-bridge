import { describe, expect, it } from 'vitest';
import { createConversation, SCHEMA_VERSION, type BridgeConversation } from './schema';
import { ConversationParseError, parseConversation, serializeConversation } from './serializer';

function sample(): BridgeConversation {
  return createConversation({
    id: 'conv-1',
    sourcePlatform: 'chatgpt',
    model: 'gpt-4o',
    title: 'Brainstorm',
    createdAt: '2026-07-11T10:00:00.000Z',
    messages: [
      { role: 'user', content: 'Hello', index: 0, attachmentRefs: [] },
      { role: 'assistant', content: 'Hi! **bold**', index: 1, attachmentRefs: ['att-1'] },
    ],
    attachments: [{ id: 'att-1', name: 'spec.pdf', mime: 'application/pdf', size: 1024 }],
  });
}

describe('conversation serializer', () => {
  it('round-trips serialize → parse without loss', () => {
    const original = sample();
    const parsed = parseConversation(JSON.parse(serializeConversation(original)));
    expect(parsed).toEqual(original);
  });

  it('ignores unknown fields for forward compatibility', () => {
    const raw = {
      ...JSON.parse(serializeConversation(sample())),
      futureField: { anything: true },
    };
    raw.messages[0].futureMessageField = 'x';
    const parsed = parseConversation(raw);
    expect(parsed.messages[0]?.content).toBe('Hello');
    expect('futureField' in parsed).toBe(false);
  });

  it('rejects a payload with a newer schemaVersion', () => {
    const raw = { ...JSON.parse(serializeConversation(sample())), schemaVersion: SCHEMA_VERSION + 1 };
    expect(() => parseConversation(raw)).toThrow(ConversationParseError);
  });

  it('rejects invalid roles, platforms and dates', () => {
    const base = JSON.parse(serializeConversation(sample()));
    expect(() =>
      parseConversation({ ...base, sourcePlatform: 'copilot' }),
    ).toThrow(ConversationParseError);
    expect(() => parseConversation({ ...base, createdAt: 'not-a-date' })).toThrow(
      ConversationParseError,
    );
    const badRole = JSON.parse(serializeConversation(sample()));
    badRole.messages[0].role = 'narrator';
    expect(() => parseConversation(badRole)).toThrow(ConversationParseError);
  });

  it('fills message index from position when missing', () => {
    const raw = JSON.parse(serializeConversation(sample()));
    delete raw.messages[1].index;
    const parsed = parseConversation(raw);
    expect(parsed.messages[1]?.index).toBe(1);
  });
});
