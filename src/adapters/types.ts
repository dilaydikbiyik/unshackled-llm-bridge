import type { BridgeConversation } from '@domain/conversation/schema';
import type { AdapterHealth } from '@shared/health';
import type { PlatformId } from '@domain/platforms';

export type { AdapterHealth };

/**
 * Capability flags let the UI degrade gracefully per platform
 * instead of erroring on an unsupported action.
 */
export interface AdapterCapabilities {
  readConversation: boolean;
  injectText: boolean;
  uploadFile: boolean;
  readModelMode: boolean;
  openNewChat: boolean;
}

export interface ModelMode {
  model?: string;
  mode?: string;
}

export type Unsubscribe = () => void;

/**
 * The only layer that touches platform DOM. Core logic and views never
 * import a concrete adapter; they speak through this interface and the
 * normalized conversation format.
 */
export interface PlatformAdapter {
  readonly platform: PlatformId;
  readonly capabilities: AdapterCapabilities;

  isReady(): Promise<boolean>;
  readConversation(): Promise<BridgeConversation>;
  /** Writes into the composer. Never auto-sends — sending stays a user action. */
  injectText(text: string): Promise<void>;
  uploadFile(blob: Blob, name: string): Promise<void>;
  getModelMode(): Promise<ModelMode>;
  openNewChat(): Promise<void>;
  observeMessages(onChange: () => void): Unsubscribe;
  healthCheck(): Promise<AdapterHealth>;
}

export class AdapterNotImplementedError extends Error {
  constructor(platform: PlatformId, method: string) {
    super(`${platform} adapter does not implement ${method} yet`);
    this.name = 'AdapterNotImplementedError';
  }
}
