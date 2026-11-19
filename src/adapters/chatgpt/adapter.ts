import { BaseAdapter } from '@adapters/base-adapter';
import { extractMarkdown } from '@adapters/dom-markdown';
import type { AdapterCapabilities, ReadOptions } from '@adapters/types';
import { collectVirtualized } from '@adapters/virtualized';
import { resolveSelector, resolveSelectorAll, safeMatches } from '@data/config/selector-config';
import { createConversation, type BridgeConversation, type ChatMessage } from '@domain/conversation/schema';
import type { PlatformId } from '@domain/platforms';

const ROLE_ATTR = 'data-message-author-role';

/**
 * Each turn carries a stable key — `fallback-turn-3:2:assistant` — that
 * survives the turn being destroyed and recreated as it scrolls. The number
 * after `turn-` is its position in the conversation, which is also how a
 * missing stretch is noticed.
 */
const TURN_KEY_ATTR = 'data-content-search-unit-key';
const TURN_KEY = /turn-(\d+):(\d+)/;

type Turn = Omit<ChatMessage, 'index'>;

/** ChatGPT (chatgpt.com) adapter. */
export class ChatGptAdapter extends BaseAdapter {
  readonly platform: PlatformId = 'chatgpt';
  protected readonly conversationPath = /\/c\/([\w-]+)/;
  readonly capabilities: AdapterCapabilities = {
    readConversation: true,
    injectText: true,
    uploadFile: true,
    readModelMode: true,
    openNewChat: true,
  };

  override async readConversation(options: ReadOptions = {}): Promise<BridgeConversation> {
    const visible = resolveSelectorAll(document, this.selectors['messageContainer']);

    let turns: Turn[];
    const scroller = options.complete ? this.partialConversationScroller(visible) : null;
    if (scroller) {
      options.onCollecting?.();
      turns = await collectVirtualized({
        scroller,
        present: () => resolveSelectorAll(document, this.selectors['messageContainer']),
        keyOf: (turn) => turn.getAttribute(TURN_KEY_ATTR) ?? '',
        compare: compareTurnKeys,
        bottomOf: (turn) =>
          turn.getBoundingClientRect().bottom - scroller.getBoundingClientRect().top + scroller.scrollTop,
        topOf: (turn) => turn.getBoundingClientRect().top - scroller.getBoundingClientRect().top,
        read: (turn) => this.readTurn(turn),
      });
    } else {
      turns = visible.map((turn) => this.readTurn(turn));
    }

    const messages: ChatMessage[] = turns.map((turn, index) => ({ ...turn, index }));
    const modelMode = await this.getModelMode();
    return createConversation({
      id: this.conversationId(),
      sourcePlatform: 'chatgpt',
      createdAt: new Date().toISOString(),
      messages,
      attachments: [],
      ...(modelMode.model ? { model: modelMode.model } : {}),
    });
  }

  /**
   * The scroller, if the page is holding only part of the conversation; null
   * when what is on the page is all of it.
   *
   * ChatGPT virtualizes long conversations — two or so turns exist in the DOM
   * at a time — and a fork read straight from the DOM carried only those. The
   * turn keys say when something is missing: a first turn that is not turn 0, a
   * gap in the numbering, or a scroller that is not at the bottom, which means
   * later turns may not be drawn.
   */
  private partialConversationScroller(visible: Element[]): HTMLElement | null {
    const positions = visible
      .map((turn) => TURN_KEY.exec(turn.getAttribute(TURN_KEY_ATTR) ?? '')?.[1])
      .filter((n): n is string => n !== undefined)
      .map(Number);
    // Markup without turn keys cannot say what is missing; read what is there.
    if (positions.length === 0 || positions.length !== visible.length) return null;

    const scroller = scrollerOf(visible[0]!, this.selectors['scrollContainer']);
    if (!scroller) return null;

    const first = Math.min(...positions);
    const last = Math.max(...positions);
    const contiguous = new Set(positions).size === last - first + 1;
    const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;
    return first > 0 || !contiguous || !atBottom ? scroller : null;
  }

  /** One turn, read while it is in the DOM. */
  private readTurn(container: Element): Turn {
    // Which turns are the user's is selector knowledge, so it comes from
    // config (ADR 002). It used to be read from a `data-message-author-role`
    // attribute hard-coded here; when ChatGPT's October 2026 rebuild dropped
    // that attribute, every turn silently became an assistant turn — the
    // adapter could not even be repaired remotely, which is the whole point of
    // shipping selectors as configuration.
    const userSelectors = this.selectors['userMessage'] ?? [];
    const isUser =
      userSelectors.some((selector) => safeMatches(container, selector)) ||
      container.matches(`[${ROLE_ATTR}="user"]`) ||
      container.querySelector(`[${ROLE_ATTR}="user"]`) !== null;
    const role = isUser ? 'user' : 'assistant';

    const roleEl = container.matches(`[${ROLE_ATTR}]`)
      ? container
      : container.querySelector(`[${ROLE_ATTR}]`);
    // Assistant turns render their answer in a dedicated node; which node is
    // selector knowledge, so it comes from config (ADR 002). User turns and
    // unmatched markup fall back to the whole turn — never to nothing.
    const contentEl =
      (role === 'assistant'
        ? resolveSelector(container, this.selectors['assistantContent'])?.element
        : null) ??
      roleEl ??
      container;
    return { role, content: extractMarkdown(contentEl), attachmentRefs: [] };
  }
}

function compareTurnKeys(a: string, b: string): number {
  const [, turnA = '0', partA = '0'] = TURN_KEY.exec(a) ?? [];
  const [, turnB = '0', partB = '0'] = TURN_KEY.exec(b) ?? [];
  return Number(turnA) - Number(turnB) || Number(partA) - Number(partB);
}

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
