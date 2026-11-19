import { BaseAdapter } from '@adapters/base-adapter';
import { extractMarkdown } from '@adapters/dom-markdown';
import type { AdapterCapabilities, ReadOptions } from '@adapters/types';
import { createConversation, type BridgeConversation, type ChatMessage } from '@domain/conversation/schema';
import type { PlatformId } from '@domain/platforms';

/**
 * Gemini (gemini.google.com) adapter. Messages render as <user-query> and
 * <model-response> custom elements; the composer is a Quill editor, which the
 * base adapter's execCommand injection path handles.
 */
export class GeminiAdapter extends BaseAdapter {
  readonly platform: PlatformId = 'gemini';
  protected readonly conversationPath = /\/app\/([\w-]+)/;
  readonly capabilities: AdapterCapabilities = {
    readConversation: true,
    injectText: true,
    uploadFile: true,
    readModelMode: true,
    openNewChat: true,
  };

  /**
   * Gemini keeps every turn once drawn but draws the earlier ones only when the
   * conversation is scrolled to its top: a forty-two-message conversation
   * opened with twenty on the page.
   */
  protected override readonly loadsEarlierTurns = true;

  override async readConversation(options: ReadOptions = {}): Promise<BridgeConversation> {
    const userSelectors = this.selectors['userMessage'] ?? [];
    const messages: ChatMessage[] = (
      await this.readTurns(options, (container) => {
        const role = userSelectors.some((s) => container.matches(s)) ? ('user' as const) : ('assistant' as const);
        return { role, content: extractMarkdown(container), attachmentRefs: [] };
      })
    ).map((turn, index) => ({ ...turn, index }));

    const modelMode = await this.getModelMode();
    return createConversation({
      id: this.conversationId(),
      sourcePlatform: 'gemini',
      createdAt: new Date().toISOString(),
      messages,
      attachments: [],
      ...(modelMode.model ? { model: modelMode.model } : {}),
    });
  }
}
