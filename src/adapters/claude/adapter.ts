import { BaseAdapter } from '@adapters/base-adapter';
import { extractMarkdown } from '@adapters/dom-markdown';
import type { AdapterCapabilities } from '@adapters/types';
import { resolveSelectorAll } from '@models/config/selector-config';
import { createConversation, type BridgeConversation, type ChatMessage } from '@models/conversation/schema';
import type { PlatformId } from '@shared/platforms';

const ARTIFACT_MARKER = '\n\n[artifact from Claude — not transferred]\n\n';

/** Claude (claude.ai) adapter. */
export class ClaudeAdapter extends BaseAdapter {
  readonly platform: PlatformId = 'claude';
  readonly capabilities: AdapterCapabilities = {
    readConversation: true,
    injectText: true,
    uploadFile: false,
    readModelMode: false,
    openNewChat: true,
  };

  override async readConversation(): Promise<BridgeConversation> {
    const containers = resolveSelectorAll(document, this.selectors['messageContainer']);
    const userSelectors = this.selectors['userMessage'] ?? [];

    const messages: ChatMessage[] = containers.map((container, index) => {
      const role = userSelectors.some((s) => container.matches(s)) ? 'user' : 'assistant';
      // Artifacts live in a separate pane and cannot be carried over as DOM;
      // replace their inline preview cells with an explicit marker instead of
      // dropping them silently.
      const clone = container.cloneNode(true) as Element;
      for (const selector of this.selectors['artifactCell'] ?? []) {
        clone
          .querySelectorAll(selector)
          .forEach((cell) => cell.replaceWith(document.createTextNode(ARTIFACT_MARKER)));
      }
      return { role, content: extractMarkdown(clone), index, attachmentRefs: [] };
    });

    return createConversation({
      id: this.conversationId(/\/chat\/([\w-]+)/),
      sourcePlatform: 'claude',
      createdAt: new Date().toISOString(),
      messages,
      attachments: [],
    });
  }
}
