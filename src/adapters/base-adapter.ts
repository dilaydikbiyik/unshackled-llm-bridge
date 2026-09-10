import type { BridgeConversation } from '@domain/conversation/schema';
import { resolveSelector, type PlatformSelectors } from '@data/config/selector-config';
import { PLATFORMS, type PlatformId } from '@domain/platforms';
import { createFileTransfer, dispatchFileDrop } from './file-drop';
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

  /**
   * File replay via a synthetic drop: all three platforms accept drag-and-drop
   * uploads, and dispatching a drop is far less brittle than driving their
   * hidden file inputs. Synthetic events have isTrusted=false, which the
   * capture listener uses to avoid re-capturing our own replays.
   */
  async uploadFile(blob: Blob, name: string): Promise<void> {
    const target = this.resolve('dropZone')?.element ?? this.resolve('composer')?.element;
    if (!target) throw new AdapterNotImplementedError(this.platform, 'uploadFile');
    dispatchFileDrop(target, createFileTransfer(blob, name));
  }

  /**
   * Best-effort read of the model picker label. Honest version of "mode sync":
   * we record which model produced the conversation and surface it in the
   * transfer package; we never silently switch models on the target.
   */
  async getModelMode(): Promise<ModelMode> {
    const model = this.resolve('modelLabel')?.element.textContent?.trim();
    return model ? { model } : {};
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

  /**
   * The resolve check above passes a selector that matches *some* nodes. That
   * is exactly how a broken Claude selector hid: it still matched user turns
   * while every reply was dropped. A real conversation cannot have two or
   * more turns on one side and none on the other, so that shape is reported.
   * A single unanswered turn is not flagged — it is normal mid-generation.
   */
  protected async conversationShapeProblems(): Promise<string[]> {
    if (!this.capabilities.readConversation) return [];
    let messages;
    try {
      ({ messages } = await this.readConversation());
    } catch {
      return ['messageContainer (conversation unreadable)'];
    }
    const users = messages.filter((m) => m.role === 'user').length;
    const assistants = messages.length - users;
    if (users >= 2 && assistants === 0) return ['messageContainer (no assistant turns)'];
    if (assistants >= 2 && users === 0) return ['messageContainer (no user turns)'];
    return [];
  }

  async healthCheck(): Promise<AdapterHealth> {
    const broken = Object.keys(this.selectors).filter((target) => this.resolve(target) === null);
    broken.push(...(await this.conversationShapeProblems()));
    return {
      platform: this.platform,
      ok: broken.length === 0,
      brokenSelectors: broken,
      checkedAt: new Date().toISOString(),
    };
  }
}
