import type { AdapterHealth } from '@shared/health';
import type { BridgeConversation } from '@domain/conversation/schema';
import type { Lang } from '@shared/i18n';
import type { PlatformId } from '@domain/platforms';

/**
 * The single typed contract for content script ⟷ service worker ⟷ side panel
 * messaging. Every new message type is added to this union — no stringly-typed
 * ad hoc messages anywhere else.
 */

/** A package parked for a target platform's content script to claim. */
export interface PendingInjection {
  text: string;
  attachmentIds: string[];
  comparisonId?: string;
}

export interface ForkLineage {
  sourceConversationId: string;
  sourcePlatform: PlatformId;
  cutIndex: number;
}

export interface InjectRequest {
  targetPlatform: PlatformId;
  injection: PendingInjection;
  lineage?: ForkLineage;
}

export interface CapturedAttachmentMeta {
  id: string;
  name: string;
  mime: string;
  size: number;
  sha256: string;
  sourcePlatform: PlatformId;
  /** `${platform}:${pathname}` — groups files by the conversation they were seen in. */
  conversationKey: string;
  capturedAt: string;
}

export interface ArchiveHit {
  id: string;
  sourcePlatform: PlatformId;
  title: string;
  snippet: string;
  updatedAt: string;
}

export interface ComparisonState {
  id: string;
  text: string;
  targets: PlatformId[];
  createdAt: string;
  responses: Partial<Record<PlatformId, { content: string; updatedAt: string }>>;
}

export type RuntimeMessage =
  | { type: 'adapter/health-report'; health: AdapterHealth }
  | { type: 'health/list-request' }
  | { type: 'inject/initiate'; request: InjectRequest }
  | { type: 'inject/pending-check'; platform: PlatformId }
  | {
      type: 'attachment/capture';
      meta: Omit<CapturedAttachmentMeta, 'id' | 'sha256'>;
      dataBase64: string;
    }
  | { type: 'attachment/list'; conversationKey: string }
  | { type: 'attachment/get'; id: string }
  | { type: 'archive/save'; conversation: BridgeConversation }
  | { type: 'archive/search'; query: string }
  | { type: 'archive/export'; id: string; format: 'markdown' | 'json' }
  | { type: 'compare/start'; text: string; targets: PlatformId[] }
  | { type: 'compare/report'; comparisonId: string; platform: PlatformId; content: string }
  | { type: 'summarize/run'; transcript: string; language: Lang };

export type HealthListResponse = AdapterHealth[];
export type PendingInjectionResponse = PendingInjection | null;
export type AttachmentListResponse = CapturedAttachmentMeta[];
export type AttachmentGetResponse = { meta: CapturedAttachmentMeta; dataBase64: string } | null;
export type ArchiveSearchResponse = ArchiveHit[];
export type ArchiveExportResponse = { filename: string; content: string } | null;
export type CompareStartResponse = { comparisonId: string };
export type SummarizeResponse = { ok: true; summary: string } | { ok: false; error: string };

export function sendToBackground<TResponse = unknown>(msg: RuntimeMessage): Promise<TResponse> {
  return chrome.runtime.sendMessage(msg);
}

export type MessageHandler = (
  msg: RuntimeMessage,
  sender: chrome.runtime.MessageSender,
) => Promise<unknown>;

/** Registers an async handler; keeps the response channel open until it settles. */
export function onRuntimeMessage(handler: MessageHandler): void {
  chrome.runtime.onMessage.addListener((msg: RuntimeMessage, sender, sendResponse) => {
    handler(msg, sender)
      .then(sendResponse)
      .catch((err: unknown) => sendResponse({ error: String(err) }));
    return true;
  });
}
