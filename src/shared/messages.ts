import type { AdapterHealth } from '@adapters/types';
import type { BridgeConversation } from '@models/conversation/schema';
import type { PlatformId } from '@shared/platforms';

/**
 * The single typed contract for content script ⟷ service worker ⟷ side panel
 * messaging. Every new message type is added to this union — no stringly-typed
 * ad hoc messages anywhere else.
 */
export interface ForkRequest {
  conversation: BridgeConversation;
  /** Fork keeps messages with index <= cutIndex. */
  cutIndex: number;
  targetPlatform: PlatformId;
}

export type RuntimeMessage =
  | { type: 'adapter/health-report'; health: AdapterHealth }
  | { type: 'health/list-request' }
  | { type: 'fork/initiate'; request: ForkRequest }
  | { type: 'fork/pending-check'; platform: PlatformId };

export type HealthListResponse = AdapterHealth[];
export type PendingForkResponse = ForkRequest | null;

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
