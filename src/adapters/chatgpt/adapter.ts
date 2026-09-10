import { BaseAdapter } from '@adapters/base-adapter';
import { extractMarkdown } from '@adapters/dom-markdown';
import type { AdapterCapabilities } from '@adapters/types';
import { resolveSelector, resolveSelectorAll } from '@data/config/selector-config';
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

    const messages: ChatMessage[] = containers.map((container, index) => {
      const roleEl = container.matches(`[${ROLE_ATTR}]`)
        ? container
        : container.querySelector(`[${ROLE_ATTR}]`);
      const role = roleEl?.getAttribute(ROLE_ATTR) === 'user' ? 'user' : 'assistant';
      // Assistant turns render their answer in a dedicated node; which node is
      // selector knowledge, so it comes from config (ADR 002). User turns and
      // unmatched markup fall back to the whole role element — never to nothing.
      const contentEl =
        (roleEl && resolveSelector(roleEl, this.selectors['assistantContent'])?.element) ??
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
