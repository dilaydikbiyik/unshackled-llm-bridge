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
  /**
   * Whether a file of this name appears to have landed on the page.
   *
   * A synthetic drop is dispatched, not acknowledged: if the site ignores it,
   * nothing says so. Platforms show an uploaded file by name, so the name
   * appearing outside the composer is the one signal available without
   * knowing the site.
   */
  attachmentVisible(name: string): boolean;
  /**
   * The elements that are the conversation's turns, for the in-page UI to
   * attach to. It belongs to the adapter because finding turns is the adapter's
   * job: the handle used to look them up with configured selectors itself, and
   * on a site the user added there are none — the generic adapter could read
   * the conversation, but the handle had nothing to attach to.
   */
  locateTurns(): Element[];
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
