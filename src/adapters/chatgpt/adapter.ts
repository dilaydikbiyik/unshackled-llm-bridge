import { BaseAdapter } from '@adapters/base-adapter';
import { extractMarkdown } from '@adapters/dom-markdown';
import type { AdapterCapabilities } from '@adapters/types';
import { resolveSelectorAll } from '@models/config/selector-config';
import { createConversation, type BridgeConversation, type ChatMessage } from '@models/conversation/schema';
import type { PlatformId } from '@shared/platforms';

const ROLE_ATTR = 'data-message-author-role';

/** ChatGPT (chatgpt.com) adapter. */
export class ChatGptAdapter extends BaseAdapter {
  readonly platform: PlatformId = 'chatgpt';
  readonly capabilities: AdapterCapabilities = {
    readConversation: true,
    injectText: true,
    uploadFile: false,
    readModelMode: false,
    openNewChat: true,
  };

  override async readConversation(): Promise<BridgeConversation> {
    const containers = resolveSelectorAll(document, this.selectors['messageContainer']);

    const messages: ChatMessage[] = containers.map((container, index) => {
      const roleEl = container.matches(`[${ROLE_ATTR}]`)
        ? container
        : container.querySelector(`[${ROLE_ATTR}]`);
      const role = roleEl?.getAttribute(ROLE_ATTR) === 'user' ? 'user' : 'assistant';
      // Assistant turns render markdown in a dedicated node; user turns are plain.
      const contentEl = roleEl?.querySelector('.markdown') ?? roleEl ?? container;
      return { role, content: extractMarkdown(contentEl), index, attachmentRefs: [] };
    });

    return createConversation({
      id: this.conversationId(/\/c\/([\w-]+)/),
      sourcePlatform: 'chatgpt',
      createdAt: new Date().toISOString(),
      messages,
      attachments: [],
    });
  }
}
