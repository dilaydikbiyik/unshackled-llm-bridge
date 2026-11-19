import type { BridgeConversation } from '@domain/conversation/schema';
import { resolveSelector, resolveSelectorAll, type PlatformSelectors } from '@data/config/selector-config';
import { platformInfo, type PlatformId } from '@domain/platforms';
import { createFileTransfer, dispatchFileDrop } from './file-drop';
import { collectVirtualized } from './virtualized';
import {
  AdapterNotImplementedError,
  type AdapterCapabilities,
  type AdapterHealth,
  type ModelMode,
  type PlatformAdapter,
  type ReadOptions,
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
  // Opening a new chat falls back to navigating to the platform's URL, so a
  // missing button costs nothing. ChatGPT's October 2026 rebuild left its new
  // chat control with no stable handle at all — only a translated aria-label,
  // which this project does not use as a primary selector — and reporting the
  // platform as degraded over a control that cannot fail is crying wolf.
  'newChatButton',
  // Regions inside a turn that are not its answer — a reasoning status line,
  // the action buttons. They are removed when present; a reply with no
  // reasoning to report simply has none.
  'turnChrome',
  // The element a long conversation scrolls in: there is none on a page with
  // no conversation open, and reading falls back to the nearest scrolling
  // ancestor when it is missing.
  'scrollContainer',
  // A turn's action bar appears only once its answer is complete, and a
  // conversation can be open with none on screen.
  'turnActions',
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

  /**
   * Stable id derived from the platform's conversation URL.
   *
   * A chat that has no id in its URL yet — a new chat before the platform
   * assigns one, or a local UI served from `/` — used to mint a fresh UUID on
   * every read. Two reads of the same conversation then disagreed about which
   * conversation it was, and with archiving on, every observed change was
   * stored as a brand-new record. The fallback is now minted once per page.
   */
  private pageId: string | null = null;

  protected conversationId(): string {
    const match = this.conversationPath.exec(location.pathname);
    if (match?.[1]) return `${this.platform}-${match[1]}`;
    this.pageId ??= crypto.randomUUID();
    return `${this.platform}-${this.pageId}`;
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

  readConversation(_options?: ReadOptions): Promise<BridgeConversation> {
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

  locateTurns(): Element[] {
    return resolveSelectorAll(document, this.selectors['messageContainer']);
  }

  /**
   * A bar inside the turn, else the first one after it within the turn's own
   * block. ChatGPT renders a reply's actions beside the reply, not inside it;
   * the climb stops at the first ancestor that also holds another turn, so a
   * reply never claims the next turn's bar.
   */
  locateActionBar(turn: Element): Element | null {
    const bars = this.selectors['turnActions'];
    if (!bars?.length) return null;
    const inside = resolveSelectorAll(turn, bars);
    if (inside.length > 0) return inside.at(-1) ?? null;

    let scope = turn.parentElement;
    for (let depth = 0; scope && depth < 5; depth += 1, scope = scope.parentElement) {
      const others = this.locateTurnsIn(scope).filter((t) => t !== turn && !t.contains(turn) && !turn.contains(t));
      if (others.length > 0) return null;
      const after = resolveSelectorAll(scope, bars).find(
        (bar) => (turn.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
      );
      if (after) return after;
    }
    return null;
  }

  protected locateTurnsIn(root: ParentNode): Element[] {
    return resolveSelectorAll(root, this.selectors['messageContainer']);
  }

  /**
   * Where a turn sits in the whole conversation — [position, part] — when the
   * page says so. Sites that virtualize a long conversation keep only the
   * turns near the screen in the DOM, but label each with its place; that
   * label is how a missing stretch is noticed and how turns recreated by
   * scrolling are recognised. Null where the site gives no such label.
   */
  protected turnOrder(_turn: Element): [number, number] | null {
    return null;
  }

  /**
   * Set by sites that keep every turn once drawn but only draw the earlier
   * ones when the conversation is scrolled to the top (Gemini): there is no
   * label to say what is missing, so a complete read loads until nothing
   * more arrives.
   */
  protected readonly loadsEarlierTurns: boolean = false;

  /** How many turns the conversation has in all, where the site says. */
  protected turnTotal(): number | null {
    return null;
  }

  /**
   * Reads every turn — scrolling through the conversation for the ones the
   * page is not holding, when `complete` is asked for and the turn labels
   * show some are missing. Otherwise reads what is on the page.
   */
  protected async readTurns<T>(options: ReadOptions, read: (turn: Element) => T): Promise<T[]> {
    const present = () => this.outermostTurns();
    const visible = present();
    if (options.complete && this.loadsEarlierTurns) {
      await this.loadEarlierTurns(visible, options);
      return present().map(read);
    }
    const scroller = options.complete ? this.partialConversationScroller(visible) : null;
    if (!scroller) return visible.map(read);

    options.onCollecting?.();
    const key = (turn: Element) => (this.turnOrder(turn) ?? [Number.MAX_SAFE_INTEGER, 0]).join(':');
    return collectVirtualized({
      scroller,
      present,
      keyOf: key,
      compare: (a, b) => {
        const [pa = 0, sa = 0] = a.split(':').map(Number);
        const [pb = 0, sb = 0] = b.split(':').map(Number);
        return pa - pb || sa - sb;
      },
      bottomOf: (turn) =>
        turn.getBoundingClientRect().bottom - scroller.getBoundingClientRect().top + scroller.scrollTop,
      topOf: (turn) => turn.getBoundingClientRect().top - scroller.getBoundingClientRect().top,
      read,
    });
  }

  /**
   * Scrolls to the top until no earlier turns arrive, then puts the turn the
   * user was looking at back where it was — the content above it has grown,
   * so the old offset would show something else.
   */
  private async loadEarlierTurns(visible: Element[], options: ReadOptions): Promise<void> {
    const first = visible[0];
    if (!first) return;
    const scroller = scrollerOf(first, this.selectors['scrollContainer']);
    if (!scroller || scroller.scrollTop <= 0) return;

    const box = () => scroller.getBoundingClientRect().top;
    const anchor = visible.find((t) => t.getBoundingClientRect().bottom > box()) ?? first;
    const anchorTop = anchor.getBoundingClientRect().top - box();
    const original = scroller.scrollTop;
    options.onCollecting?.();
    try {
      let count = visible.length;
      for (let attempt = 0, stable = 0; attempt < 40 && stable < 2; attempt += 1) {
        scroller.scrollTop = 0;
        await new Promise((resolve) => setTimeout(resolve, EARLIER_SETTLE_MS));
        const now = this.outermostTurns().length;
        stable = now === count ? stable + 1 : 0;
        count = now;
      }
    } finally {
      scroller.scrollTop = original;
      if (anchor.isConnected) {
        scroller.scrollTop += anchor.getBoundingClientRect().top - box() - anchorTop;
      }
    }
  }

  /**
   * The turns on the page, a match nested inside another match dropped: a
   * turn rule naming several of a site's shapes can match one turn twice.
   */
  protected outermostTurns(): Element[] {
    const all = this.locateTurns();
    return all.filter((turn) => !all.some((other) => other !== turn && other.contains(turn)));
  }

  /**
   * The scroller, if the page is holding only part of the conversation; null
   * when what is on the page is all of it. Something is missing when the
   * first turn is not the conversation's first, when the positions have a
   * gap, when the site's own count is larger, or when the conversation is not
   * scrolled to the bottom (later turns may not be drawn).
   */
  private partialConversationScroller(visible: Element[]): HTMLElement | null {
    const orders = visible.map((turn) => this.turnOrder(turn));
    if (orders.length === 0 || orders.some((o) => o === null)) return null;
    const positions = orders.map((o) => o![0]);

    const scroller = scrollerOf(visible[0]!, this.selectors['scrollContainer']);
    if (!scroller) return null;

    const first = Math.min(...positions);
    const last = Math.max(...positions);
    const contiguous = new Set(positions).size === last - first + 1;
    const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;
    const total = this.turnTotal();
    const short = total !== null && new Set(positions).size < total;
    return first > 0 || !contiguous || !atBottom || short ? scroller : null;
  }

  /**
   * Looks for the file's name on the page, outside the composer.
   *
   * The composer itself carries the name — the continuation note says which
   * file is attached — so finding it there would confirm every upload,
   * including the ones that never happened.
   */
  attachmentVisible(name: string): boolean {
    const composer = this.composerElement();
    for (const element of document.querySelectorAll<HTMLElement>('body *')) {
      if (element === composer || composer?.contains(element)) continue;
      if (element.children.length > 0) continue;
      if ((element.textContent ?? '').includes(name)) return true;
    }
    return false;
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

/** How long a site gets to load a batch of earlier turns after reaching the top. */
export const EARLIER_SETTLE_MS = 900;

/** The configured scroller, else the nearest ancestor that actually scrolls. */
function scrollerOf(turn: Element, configured: string[] | undefined): HTMLElement | null {
  const fromConfig = configured ? resolveSelectorAll(document, configured)[0] : undefined;
  if (fromConfig instanceof HTMLElement) return fromConfig;
  for (let el = turn.parentElement; el; el = el.parentElement) {
    const overflow = getComputedStyle(el).overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && el.scrollHeight > el.clientHeight) return el;
  }
  return null;
}
