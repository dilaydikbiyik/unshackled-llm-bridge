import type { BridgeConversation } from '@models/conversation/schema';
import { resolveSelector, type PlatformSelectors } from '@models/config/selector-config';
import type { PlatformId } from '@shared/platforms';
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
 * check, and a naive composer injection. Platform-specific parsing lands in
 * phase 1.2/1.3 by overriding the relevant methods.
 */
export abstract class BaseAdapter implements PlatformAdapter {
  abstract readonly platform: PlatformId;
  abstract readonly capabilities: AdapterCapabilities;

  constructor(protected readonly selectors: PlatformSelectors) {}

  protected resolve(target: string) {
    return resolveSelector(document, this.selectors[target]);
  }

  async isReady(): Promise<boolean> {
    return document.readyState !== 'loading' && this.resolve('composer') !== null;
  }

  readConversation(): Promise<BridgeConversation> {
    throw new AdapterNotImplementedError(this.platform, 'readConversation');
  }

  /**
   * Naive generic injection: works for contenteditable and textarea composers.
   * TODO(phase-1.2/1.3): platform-specific hardening (ProseMirror transactions,
   * React synthetic event quirks, cursor position).
   */
  async injectText(text: string): Promise<void> {
    const match = this.resolve('composer');
    if (!match) throw new Error(`${this.platform}: composer selector did not resolve`);
    const el = match.element as HTMLElement;
    el.focus();
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      el.value = text;
    } else {
      el.textContent = text;
    }
    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
  }

  uploadFile(_blob: Blob, _name: string): Promise<void> {
    throw new AdapterNotImplementedError(this.platform, 'uploadFile');
  }

  getModelMode(): Promise<ModelMode> {
    throw new AdapterNotImplementedError(this.platform, 'getModelMode');
  }

  async openNewChat(): Promise<void> {
    throw new AdapterNotImplementedError(this.platform, 'openNewChat');
  }

  observeMessages(_onChange: () => void): Unsubscribe {
    throw new AdapterNotImplementedError(this.platform, 'observeMessages');
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
