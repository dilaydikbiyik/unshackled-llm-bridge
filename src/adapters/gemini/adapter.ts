import { BaseAdapter } from '@adapters/base-adapter';
import { extractMarkdown } from '@adapters/dom-markdown';
import type { AdapterCapabilities } from '@adapters/types';
import { resolveSelectorAll } from '@data/config/selector-config';
import { createConversation, type BridgeConversation, type ChatMessage } from '@domain/conversation/schema';
import type { PlatformId } from '@domain/platforms';

/**
 * Gemini (gemini.google.com) adapter. Messages render as <user-query> and
 * <model-response> custom elements; the composer is a Quill editor, which the
 * base adapter's execCommand injection path handles.
 */
export class GeminiAdapter extends BaseAdapter {
  readonly platform: PlatformId = 'gemini';
  readonly capabilities: AdapterCapabilities = {
    readConversation: true,
    injectText: true,
    uploadFile: true,
    readModelMode: true,
    openNewChat: true,
  };

  override async readConversation(): Promise<BridgeConversation> {
    const containers = resolveSelectorAll(document, this.selectors['messageContainer']);
    const userSelectors = this.selectors['userMessage'] ?? [];

    const messages: ChatMessage[] = containers.map((container, index) => {
      const role = userSelectors.some((s) => container.matches(s)) ? 'user' : 'assistant';
      return { role, content: extractMarkdown(container), index, attachmentRefs: [] };
    });

    const modelMode = await this.getModelMode();
    return createConversation({
      id: this.conversationId(/\/app\/([\w-]+)/),
      sourcePlatform: 'gemini',
      createdAt: new Date().toISOString(),
      messages,
      attachments: [],
      ...(modelMode.model ? { model: modelMode.model } : {}),
    });
  }
}
