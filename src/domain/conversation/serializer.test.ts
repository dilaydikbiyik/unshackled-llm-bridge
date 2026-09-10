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

/**
 * The parser is a trust boundary: archived JSON and cross-tab payloads are
 * data from storage, not values the type system has vouched for. Every
 * malformed shape must be rejected with a named error, never half-read.
 */
describe('conversation parser — malformed input', () => {
  const base = () => JSON.parse(serializeConversation(sample()));

  it.each([
    ['null', null],
    ['an array', []],
    ['a string', 'conversation'],
  ])('rejects %s at the root', (_label, value) => {
    expect(() => parseConversation(value)).toThrow(ConversationParseError);
  });

  it('rejects a payload with no schemaVersion', () => {
    const raw = base();
    delete raw.schemaVersion;
    expect(() => parseConversation(raw)).toThrow(/missing schemaVersion/);
  });

  it('rejects messages that are not an array', () => {
    expect(() => parseConversation({ ...base(), messages: {} })).toThrow(/messages must be an array/);
  });

  it('rejects attachments that are not an array', () => {
    expect(() => parseConversation({ ...base(), attachments: 'x' })).toThrow(
      /attachments must be an array/,
    );
  });

  it('rejects attachment refs that are not all strings', () => {
    const raw = base();
    raw.messages[0].attachmentRefs = ['ok', 42];
    expect(() => parseConversation(raw)).toThrow(/attachmentRefs must be string\[\]/);
  });

  it('rejects a message whose content is not text', () => {
    const raw = base();
    raw.messages[0].content = { html: '<b>x</b>' };
    expect(() => parseConversation(raw)).toThrow(/content must be a string/);
  });

  it('names the offending path in the error, so a bad archive entry is debuggable', () => {
    const raw = base();
    raw.messages[1].role = 'narrator';
    expect(() => parseConversation(raw)).toThrow(/messages\[1\]\.role/);
  });
});

describe('conversation parser — tolerant defaults', () => {
  it('accepts a payload with attachments omitted entirely', () => {
    const raw = JSON.parse(serializeConversation(sample()));
    delete raw.attachments;
    expect(parseConversation(raw).attachments).toEqual([]);
  });

  it('drops optional fields of the wrong type rather than carrying them through', () => {
    const raw = { ...JSON.parse(serializeConversation(sample())), model: 42, title: null };
    const parsed = parseConversation(raw);
    expect('model' in parsed).toBe(false);
    expect('title' in parsed).toBe(false);
  });

  it('defaults a missing attachment size to zero instead of failing', () => {
    const raw = JSON.parse(serializeConversation(sample()));
    delete raw.attachments[0].size;
    expect(parseConversation(raw).attachments[0]?.size).toBe(0);
  });
});
