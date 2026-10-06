import { isPlatformId, type PlatformId } from '@domain/platforms';
import {
  SCHEMA_VERSION,
  type AttachmentMeta,
  type BridgeConversation,
  type ChatMessage,
  type MessageRole,
} from './schema';

export class ConversationParseError extends Error {
  constructor(message: string) {
    super(`Invalid BridgeConversation: ${message}`);
    this.name = 'ConversationParseError';
  }
}

const ROLES: readonly MessageRole[] = ['user', 'assistant', 'system'];

export function serializeConversation(conversation: BridgeConversation): string {
  return JSON.stringify(conversation);
}

/**
 * Validates unknown input into a BridgeConversation.
 *
 * Forward-compat rules: unknown top-level and per-message fields are ignored,
 * a newer minor payload still parses. A schemaVersion above ours is rejected
 * loudly rather than half-read.
 */
export function parseConversation(raw: unknown): BridgeConversation {
  const obj = asRecord(raw, 'root');

  const schemaVersion = obj.schemaVersion;
  if (typeof schemaVersion !== 'number') throw new ConversationParseError('missing schemaVersion');
  if (schemaVersion > SCHEMA_VERSION) {
    throw new ConversationParseError(
      `schemaVersion ${schemaVersion} is newer than supported ${SCHEMA_VERSION}`,
    );
  }
  // TODO(phase-0.3): when SCHEMA_VERSION bumps past 1, run migrations for older versions here.

  const id = asString(obj.id, 'id');
  const sourcePlatform = asPlatform(obj.sourcePlatform);
  const createdAt = asString(obj.createdAt, 'createdAt');
  if (Number.isNaN(Date.parse(createdAt))) {
    throw new ConversationParseError(`createdAt is not a valid date: ${createdAt}`);
  }

  if (!Array.isArray(obj.messages)) throw new ConversationParseError('messages must be an array');
  const messages = obj.messages.map(parseMessage);

  const attachmentsRaw = obj.attachments ?? [];
  if (!Array.isArray(attachmentsRaw)) {
    throw new ConversationParseError('attachments must be an array');
  }
  const attachments = attachmentsRaw.map(parseAttachment);

  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    sourcePlatform,
    createdAt,
    messages,
    attachments,
    ...(typeof obj.model === 'string' ? { model: obj.model } : {}),
    ...(typeof obj.mode === 'string' ? { mode: obj.mode } : {}),
    ...(typeof obj.title === 'string' ? { title: obj.title } : {}),
  };
}

function parseMessage(raw: unknown, i: number): ChatMessage {
  const obj = asRecord(raw, `messages[${i}]`);
  const role = obj.role;
  if (typeof role !== 'string' || !ROLES.includes(role as MessageRole)) {
    throw new ConversationParseError(`messages[${i}].role is invalid: ${String(role)}`);
  }
  const refsRaw = obj.attachmentRefs ?? [];
  if (!Array.isArray(refsRaw) || refsRaw.some((r) => typeof r !== 'string')) {
    throw new ConversationParseError(`messages[${i}].attachmentRefs must be string[]`);
  }
  return {
    role: role as MessageRole,
    content: asString(obj.content, `messages[${i}].content`),
    index: typeof obj.index === 'number' ? obj.index : i,
    attachmentRefs: refsRaw as string[],
  };
}

function parseAttachment(raw: unknown, i: number): AttachmentMeta {
  const obj = asRecord(raw, `attachments[${i}]`);
  return {
    id: asString(obj.id, `attachments[${i}].id`),
    name: asString(obj.name, `attachments[${i}].name`),
    mime: asString(obj.mime, `attachments[${i}].mime`),
    size: typeof obj.size === 'number' ? obj.size : 0,
    ...(typeof obj.sha256 === 'string' ? { sha256: obj.sha256 } : {}),
  };
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ConversationParseError(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new ConversationParseError(`${path} must be a string`);
  return value;
}

function asPlatform(value: unknown): PlatformId {
  if (!isPlatformId(value)) {
    throw new ConversationParseError(`sourcePlatform is invalid: ${String(value)}`);
  }
  return value;
}
