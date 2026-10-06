import type { BridgeConversation } from '@domain/conversation/schema';
import { resolveSelector, type PlatformSelectors } from '@data/config/selector-config';
import { platformInfo, type PlatformId } from '@domain/platforms';
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
 * Targets that are legitimately absent in normal use — a send button renders
 * only after typing, a model picker is hidden on some plans, an artifact exists
 * only in chats that produced one. Their absence is never reported as broken.
 */
export const SITUATIONAL_TARGETS: ReadonlySet<string> = new Set([
  'sendButton',
  'modelLabel',
  'artifactCell',
]);

/**
 * Targets that only exist once a conversation exists. On a new, empty chat
 * they match nothing, and that is correct — so they are only checked on a
 * conversation page.
 */
export const CONVERSATION_TARGETS: ReadonlySet<string> = new Set([
  'messageContainer',
  'userMessage',
  'assistantContent',
]);

/**
 * Shared plumbing for concrete adapters: selector resolution, generic health
 * check, framework-safe composer injection, debounced message observation.
 * Platform-specific DOM parsing lives in each adapter.
 */
export abstract class BaseAdapter implements PlatformAdapter {
  abstract readonly platform: PlatformId;
  abstract readonly capabilities: AdapterCapabilities;

  /** Matches a conversation URL; group 1 is the platform's conversation id. */
  protected abstract readonly conversationPath: RegExp;

  constructor(protected readonly selectors: PlatformSelectors) {}

  protected resolve(target: string) {
    return resolveSelector(document, this.selectors[target]);
  }

  /** Stable id derived from the platform's conversation URL, else a fresh UUID. */
  protected conversationId(): string {
    const match = this.conversationPath.exec(location.pathname);
    return `${this.platform}-${match?.[1] ?? crypto.randomUUID()}`;
  }

  async isReady(): Promise<boolean> {
    return document.readyState !== 'loading' && this.composerElement() !== null;
  }

  /**
   * Where text is typed. Selector-driven by default; the generic adapter finds
   * it heuristically instead, which is the only difference between reading a
   * site we maintain and one the user added.
   */
  protected composerElement(): HTMLElement | null {
    return (this.resolve('composer')?.element as HTMLElement | undefined) ?? null;
  }

  /** Where files are dropped. Defaults to the composer when no zone is known. */
  protected dropElement(): HTMLElement | null {
    const zone = this.resolve('dropZone')?.element as HTMLElement | undefined;
    return zone ?? this.composerElement();
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
    const el = this.composerElement();
    if (!el) throw new Error(`${this.platform}: no composer found on the page`);
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
    const target = this.dropElement();
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
    else location.assign(platformInfo(this.platform).newChatUrl);
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

  /**
   * Reports only absences that mean something is actually broken. Checking
   * every target naively reported "degraded" on every new chat and whenever
   * the composer was empty — a false alarm users would learn to ignore.
   */
  async healthCheck(): Promise<AdapterHealth> {
    const onConversation = this.conversationPath.test(location.pathname);
    const broken = Object.keys(this.selectors).filter((target) => {
      if (SITUATIONAL_TARGETS.has(target)) return false;
      if (CONVERSATION_TARGETS.has(target) && !onConversation) return false;
      return this.resolve(target) === null;
    });
    broken.push(...(await this.conversationShapeProblems()));
    return {
      platform: this.platform,
      ok: broken.length === 0,
      brokenSelectors: broken,
      checkedAt: new Date().toISOString(),
    };
  }
}
