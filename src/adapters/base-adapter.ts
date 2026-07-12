import type { BridgeConversation } from '@models/conversation/schema';
import { resolveSelector, type PlatformSelectors } from '@models/config/selector-config';
import { PLATFORMS, type PlatformId } from '@shared/platforms';
import {
  AdapterNotImplementedError,
  type AdapterCapabilities,
  type AdapterHealth,
  type ModelMode,
  type PlatformAdapter,
  type Unsubscribe,
} from './types';

/**
 * Shared plumbing for concrete adapters: selector resolution, generic health
 * check, framework-safe composer injection, debounced message observation.
 * Platform-specific DOM parsing lives in each adapter.
 */
export abstract class BaseAdapter implements PlatformAdapter {
  abstract readonly platform: PlatformId;
  abstract readonly capabilities: AdapterCapabilities;

  constructor(protected readonly selectors: PlatformSelectors) {}

  protected resolve(target: string) {
    return resolveSelector(document, this.selectors[target]);
  }

  /** Stable id derived from the platform's conversation URL, else a fresh UUID. */
  protected conversationId(pathPattern: RegExp): string {
    const match = pathPattern.exec(location.pathname);
    return `${this.platform}-${match?.[1] ?? crypto.randomUUID()}`;
  }

  async isReady(): Promise<boolean> {
    return document.readyState !== 'loading' && this.resolve('composer') !== null;
  }

  readConversation(): Promise<BridgeConversation> {
    throw new AdapterNotImplementedError(this.platform, 'readConversation');
  }

  /**
   * Framework-safe injection, never auto-sends:
   * - textarea/input: native value setter (bypasses React's value tracking so
   *   the change is not swallowed) + input event
   * - contenteditable: execCommand insertText — deprecated but the reliable
   *   path into ProseMirror/Lexical editors, which ignore textContent writes
   */
  async injectText(text: string): Promise<void> {
    const match = this.resolve('composer');
    if (!match) throw new Error(`${this.platform}: composer selector did not resolve`);
    const el = match.element as HTMLElement;
    el.focus();

    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      const proto = el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      const setValue = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setValue) setValue.call(el, text);
      else el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }

    document.execCommand('selectAll', false);
    document.execCommand('insertText', false, text);
  }

  uploadFile(_blob: Blob, _name: string): Promise<void> {
    throw new AdapterNotImplementedError(this.platform, 'uploadFile');
  }

  getModelMode(): Promise<ModelMode> {
    throw new AdapterNotImplementedError(this.platform, 'getModelMode');
  }

  async openNewChat(): Promise<void> {
    const button = this.resolve('newChatButton');
    if (button) (button.element as HTMLElement).click();
    else location.assign(PLATFORMS[this.platform].newChatUrl);
  }

  /** Debounced MutationObserver over the chat area; returns unsubscribe. */
  observeMessages(onChange: () => void): Unsubscribe {
    const root = document.querySelector('main') ?? document.body;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(onChange, 300);
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }

  async healthCheck(): Promise<AdapterHealth> {
    const broken = Object.keys(this.selectors).filter((target) => this.resolve(target) === null);
    return {
      platform: this.platform,
      ok: broken.length === 0,
      brokenSelectors: broken,
      checkedAt: new Date().toISOString(),
    };
  }
}
