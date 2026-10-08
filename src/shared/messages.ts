import type { BridgeConversation } from '@domain/conversation/schema';
import type { PlatformId } from '@domain/platforms';
import type { AdapterHealth } from '@shared/health';
import type { Lang } from '@shared/i18n';

/** A package parked for a target platform's content script to claim. */
export interface ForkLineage {
  sourceConversationId: string;
  sourcePlatform: PlatformId;
  cutIndex: number;
  /**
   * Where the conversation came from, exactly. A platform's own "import from
   * another assistant" can only ever bring context in; carrying an answer back
   * to the conversation that asked for it needs the origin's address, and only
   * a client that belongs to no provider is in a position to keep it.
   */
  sourceUrl?: string;
}

export interface PendingInjection {
  text: string;
  attachmentIds: string[];
  /**
   * The whole package as text. Set when the context travels as a file, so a
   * failed upload degrades to an inline transfer instead of landing the target
   * with a continuation note and no conversation to continue.
   */
  fallbackText?: string;
  comparisonId?: string;
  /**
   * Travels with the package so the target knows which conversation it came
   * from, and can offer to take an answer back there.
   */
  lineage?: ForkLineage;
}

export interface InjectRequest {
  targetPlatform: PlatformId;
  injection: PendingInjection;
  lineage?: ForkLineage;
  /**
   * Open this exact conversation instead of a new chat. Set when the package
   * is going back to the conversation it was forked from.
   */
  openUrl?: string;
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
  /**
   * True for a file the extension produced — the transcript that travels with
   * a fork. It is stored like any other attachment so the replay path can
   * carry it, but it is not one of the user's files, and offering it back as
   * one makes every fork carry the previous fork's transcript as well.
   */
  generated?: boolean;
}

/** What a content script knows about a file before the store assigns identity. */
export type CapturedAttachmentInput = Omit<CapturedAttachmentMeta, 'id' | 'sha256'>;

export interface AttachmentPayload {
  meta: CapturedAttachmentMeta;
  dataBase64: string;
}

export interface ArchiveHit {
  id: string;
  sourcePlatform: PlatformId;
  title: string;
  snippet: string;
  updatedAt: string;
}

export type ExportFormat = 'markdown' | 'json';

export interface ExportedFile {
  filename: string;
  content: string;
}

export interface ComparisonState {
  id: string;
  text: string;
  targets: PlatformId[];
  createdAt: string;
  responses: Partial<Record<PlatformId, { content: string; updatedAt: string }>>;
}

export interface Ack {
  ok: boolean;
}

export interface Failure {
  ok: false;
  error: string;
}

export type SummarizeResponse = { ok: true; summary: string } | Failure;

/**
 * The messaging contract between content scripts, the service worker and the
 * side panel. Each entry pairs a request with the response it produces, so a
 * caller cannot send one message and read the answer to another:
 *
 *   sendToBackground({ type: 'attachment/get', id })  // Promise<AttachmentPayload | null>
 *
 * and the background's HandlerMap must implement every entry with exactly
 * that response type — a missing or mistyped handler does not compile.
 */
export interface MessageContract {
  'adapter/health-report': { request: { health: AdapterHealth }; response: Ack };
  'health/list-request': { request: Record<never, never>; response: AdapterHealth[] };
  'inject/initiate': { request: { request: InjectRequest }; response: Ack };
  'inject/pending-check': { request: { platform: PlatformId }; response: PendingInjection | null };
  'attachment/capture': {
    request: { meta: CapturedAttachmentInput; dataBase64: string };
    response: CapturedAttachmentMeta | Failure;
  };
  'attachment/list': { request: { conversationKey: string }; response: CapturedAttachmentMeta[] };
  'attachment/get': { request: { id: string }; response: AttachmentPayload | null };
  'archive/save': { request: { conversation: BridgeConversation }; response: Ack };
  'archive/search': { request: { query: string }; response: ArchiveHit[] };
  'archive/export': { request: { id: string; format: ExportFormat }; response: ExportedFile | null };
  'compare/start': {
    request: { text: string; targets: PlatformId[] };
    response: { comparisonId: string };
  };
  'compare/report': {
    request: { comparisonId: string; platform: PlatformId; content: string };
    response: Ack;
  };
  'summarize/run': { request: { transcript: string; language: Lang }; response: SummarizeResponse };
}

export type MessageType = keyof MessageContract;
export type MessageOf<T extends MessageType> = { type: T } & MessageContract[T]['request'];
export type ResponseOf<T extends MessageType> = MessageContract[T]['response'];
export type RuntimeMessage = { [T in MessageType]: MessageOf<T> }[MessageType];

/** Where a message came from, reduced to what handlers are allowed to see. */
export interface SenderInfo {
  tabId?: number;
}

export type HandlerMap = {
  [T in MessageType]: (message: MessageOf<T>, sender: SenderInfo) => Promise<ResponseOf<T>>;
};

/**
 * A handler that throws must not look like a successful response of the
 * expected type, so failures travel in a distinct envelope and are rethrown
 * on the calling side.
 */
const ERROR_KEY = '__bridgeError';
type ErrorEnvelope = { [ERROR_KEY]: string };

export class BridgeError extends Error {
  override name = 'BridgeError';
}

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  return typeof value === 'object' && value !== null && ERROR_KEY in value;
}

export async function sendToBackground<T extends MessageType>(
  message: MessageOf<T>,
): Promise<ResponseOf<T>> {
  const response: unknown = await chrome.runtime.sendMessage(message);
  if (isErrorEnvelope(response)) throw new BridgeError(response[ERROR_KEY]);
  return response as ResponseOf<T>;
}

/**
 * Only this extension's own contexts may drive the hub, and only with a
 * message the hub knows how to handle. Anything else gets no response at all.
 */
export function isAcceptableMessage(
  message: unknown,
  senderId: string | undefined,
  ownId: string,
  handlers: HandlerMap,
): message is RuntimeMessage {
  if (senderId === undefined || senderId !== ownId) return false;
  if (typeof message !== 'object' || message === null) return false;
  const type = (message as { type?: unknown }).type;
  return typeof type === 'string' && Object.prototype.hasOwnProperty.call(handlers, type);
}

export function dispatch(
  handlers: HandlerMap,
  message: RuntimeMessage,
  sender: SenderInfo,
): Promise<unknown> {
  // The map is keyed by message type, so this pairing is sound by construction;
  // TypeScript cannot correlate the union with the mapped type on its own.
  const handler = handlers[message.type] as (m: RuntimeMessage, s: SenderInfo) => Promise<unknown>;
  return handler(message, sender);
}

export function errorEnvelope(error: unknown): ErrorEnvelope {
  return { [ERROR_KEY]: error instanceof Error ? error.message : String(error) };
}

/** Registers the handler map; keeps the response channel open until it settles. */
export function onRuntimeMessage(handlers: HandlerMap): void {
  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (!isAcceptableMessage(message, sender.id, chrome.runtime.id, handlers)) return false;
    const info: SenderInfo = sender.tab?.id !== undefined ? { tabId: sender.tab.id } : {};
    dispatch(handlers, message, info)
      .then(sendResponse)
      .catch((error: unknown) => sendResponse(errorEnvelope(error)));
    return true;
  });
}

// Named response aliases, kept for readability at use sites.
export type HealthListResponse = ResponseOf<'health/list-request'>;
export type PendingInjectionResponse = ResponseOf<'inject/pending-check'>;
export type AttachmentListResponse = ResponseOf<'attachment/list'>;
export type AttachmentGetResponse = ResponseOf<'attachment/get'>;
export type ArchiveSearchResponse = ResponseOf<'archive/search'>;
export type ArchiveExportResponse = ResponseOf<'archive/export'>;
export type CompareStartResponse = ResponseOf<'compare/start'>;
