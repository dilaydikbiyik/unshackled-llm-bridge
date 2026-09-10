import type { PlatformId } from '@domain/platforms';

export const SCHEMA_VERSION = 1;

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  role: MessageRole;
  /** Markdown-normalized text content. */
  content: string;
  /** Zero-based position in the conversation. */
  index: number;
  /** Ids into the local attachment store — never inline data. */
  attachmentRefs: string[];
}

export interface AttachmentMeta {
  id: string;
  name: string;
  mime: string;
  size: number;
  /** Content hash for dedupe (phase 2.1). */
  sha256?: string;
}

/**
 * The platform-agnostic conversation contract. Core logic and views speak
 * only this format; only adapters know how a platform's DOM maps onto it.
 */
export interface BridgeConversation {
  schemaVersion: number;
  id: string;
  sourcePlatform: PlatformId;
  model?: string;
  mode?: string;
  title?: string;
  /** ISO 8601. */
  createdAt: string;
  messages: ChatMessage[];
  attachments: AttachmentMeta[];
}

export function createConversation(
  init: Omit<BridgeConversation, 'schemaVersion'>,
): BridgeConversation {
  return { schemaVersion: SCHEMA_VERSION, ...init };
}
