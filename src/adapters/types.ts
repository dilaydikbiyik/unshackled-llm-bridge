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
  /**
   * The conversation on the page. With `complete`, an adapter whose site keeps
   * only part of a long conversation in the DOM goes and reads the rest — which
   * may scroll the page, so it is asked for only when the user forks, never by
   * a background watcher.
   */
  readConversation(options?: ReadOptions): Promise<BridgeConversation>;
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
  /**
   * The site's own action bar for a turn — the row with copy, share and "⋯" —
   * so the fork control can sit among them like one of the site's own.
   * Null where the site has none or it cannot be found; the floating handle
   * covers those.
   */
  locateActionBar(turn: Element): Element | null;
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

export interface ReadOptions {
  complete?: boolean;
  /** Called when reading the whole conversation will take a moment. */
  onCollecting?: () => void;
}
