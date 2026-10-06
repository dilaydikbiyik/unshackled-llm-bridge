import { BaseAdapter } from '@adapters/base-adapter';
import { extractMarkdown } from '@adapters/dom-markdown';
import type { AdapterCapabilities, AdapterHealth } from '@adapters/types';
import type { PlatformSelectors } from '@data/config/selector-config';
import { createConversation, type BridgeConversation, type ChatMessage } from '@domain/conversation/schema';
import type { PlatformId } from '@domain/platforms';
import { assignRoles, findComposer, findTurns } from './detect';

/**
 * Reads any chat UI, with no selectors written for it.
 *
 * This is what keeps the project from being a list of three platforms. The
 * built-in adapters exist because maintained selectors read their sites more
 * precisely — roles from the markup rather than from alternation, code blocks
 * from known containers. Everywhere else, the heuristics in `detect.ts` do the
 * work, and the site becomes usable the moment the user adds it.
 *
 * It declares its capabilities honestly: it cannot know a site's model picker
 * or its new-chat route, so it does not claim to.
 */
export class GenericAdapter extends BaseAdapter {
  readonly platform: PlatformId;
  // Any path can be a conversation; the id falls back to a per-page UUID.
  protected readonly conversationPath = /\/([\w-]{6,})/;
  readonly capabilities: AdapterCapabilities = {
    readConversation: true,
    injectText: true,
    uploadFile: true,
    readModelMode: false,
    openNewChat: false,
  };

  constructor(platform: PlatformId, selectors: PlatformSelectors = {}) {
    super(selectors);
    this.platform = platform;
  }

  /** Ready as soon as there is something to type into. */
  override async isReady(): Promise<boolean> {
    return document.readyState !== 'loading' && findComposer() !== null;
  }

  override async readConversation(): Promise<BridgeConversation> {
    const turns = findTurns();
    const roles = assignRoles(turns);
    const messages: ChatMessage[] = turns.map((turn, index) => ({
      role: roles[index] ?? 'user',
      content: extractMarkdown(turn),
      index,
      attachmentRefs: [],
    }));

    return createConversation({
      id: this.conversationId(),
      sourcePlatform: this.platform,
      createdAt: new Date().toISOString(),
      messages,
      attachments: [],
    });
  }

  /**
   * Health is about the one thing the heuristics must find: somewhere to type.
   * Turns are not required — a site with an empty chat open is healthy, and
   * saying otherwise would cry wolf exactly as the old selector check did.
   */
  override async healthCheck(): Promise<AdapterHealth> {
    const composer = findComposer();
    return {
      platform: this.platform,
      ok: composer !== null,
      brokenSelectors: composer ? [] : ['composer'],
      checkedAt: new Date().toISOString(),
    };
  }

  protected override composerElement(): HTMLElement | null {
    return findComposer();
  }

  protected override dropElement(): HTMLElement | null {
    return findComposer();
  }
}
