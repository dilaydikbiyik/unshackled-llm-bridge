import { BaseAdapter } from '@adapters/base-adapter';
import { extractMarkdown } from '@adapters/dom-markdown';
import type { AdapterCapabilities } from '@adapters/types';
import { resolveSelector, resolveSelectorAll, safeMatches } from '@data/config/selector-config';
import { createConversation, type BridgeConversation, type ChatMessage } from '@domain/conversation/schema';
import type { PlatformId } from '@domain/platforms';

const ROLE_ATTR = 'data-message-author-role';

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

  override async readConversation(): Promise<BridgeConversation> {
    const containers = resolveSelectorAll(document, this.selectors['messageContainer']);

    // Which turns are the user's is selector knowledge, so it comes from
    // config (ADR 002). It used to be read from a `data-message-author-role`
    // attribute hard-coded here; when ChatGPT's October 2026 rebuild dropped
    // that attribute, every turn silently became an assistant turn — the
    // adapter could not even be repaired remotely, which is the whole point of
    // shipping selectors as configuration.
    const userSelectors = this.selectors['userMessage'] ?? [];
    const isUser = (el: Element): boolean =>
      userSelectors.some((selector) => safeMatches(el, selector)) ||
      el.matches(`[${ROLE_ATTR}="user"]`) ||
      el.querySelector(`[${ROLE_ATTR}="user"]`) !== null;

    const messages: ChatMessage[] = containers.map((container, index) => {
      const roleEl = container.matches(`[${ROLE_ATTR}]`)
        ? container
        : container.querySelector(`[${ROLE_ATTR}]`);
      const role = isUser(container) ? 'user' : 'assistant';
      // Assistant turns render their answer in a dedicated node; which node is
      // selector knowledge, so it comes from config (ADR 002). User turns and
      // unmatched markup fall back to the whole role element — never to nothing.
      // The answer node is looked for in the whole turn, not only inside a
      // role element that newer markup no longer has.
      const contentEl =
        (role === 'assistant'
          ? resolveSelector(container, this.selectors['assistantContent'])?.element
          : null) ??
        roleEl ??
        container;
      return { role, content: extractMarkdown(contentEl), index, attachmentRefs: [] };
    });

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
}
