import { BaseAdapter } from '@adapters/base-adapter';
import { extractMarkdown } from '@adapters/dom-markdown';
import type { AdapterCapabilities } from '@adapters/types';
import { resolveSelectorAll, safeQueryAll } from '@data/config/selector-config';
import { createConversation, type BridgeConversation, type ChatMessage } from '@domain/conversation/schema';
import type { PlatformId } from '@domain/platforms';

const ARTIFACT_MARKER = '\n\n[artifact from Claude — not transferred]\n\n';

/** Claude (claude.ai) adapter. */
export class ClaudeAdapter extends BaseAdapter {
  readonly platform: PlatformId = 'claude';
  protected readonly conversationPath = /\/chat\/([\w-]+)/;
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

    // The turn rule names every shape Claude has used, so on a page where an
    // older marker sits inside a newer one both would match and the turn would
    // be read twice. A match nested in another match is the same turn.
    const turns = containers.filter(
      (container) => !containers.some((other) => other !== container && other.contains(container)),
    );

    const messages: ChatMessage[] = turns.map((container, index) => {
      const role = userSelectors.some((s) => container.matches(s)) ? 'user' : 'assistant';
      // Artifacts live in a separate pane and cannot be carried over as DOM;
      // replace their inline preview cells with an explicit marker instead of
      // dropping them silently.
      const clone = container.cloneNode(true) as Element;
      // A turn carries more than its answer. Claude now leads a reply with a
      // status line from its reasoning and tool use — "Checking how Microsoft
      // partners…" — and reading the whole turn carried that into the package
      // as if it were part of what Claude said. Which regions are chrome is
      // selector knowledge, so it comes from config.
      for (const selector of this.selectors['turnChrome'] ?? []) {
        safeQueryAll(clone, selector).forEach((region) => region.remove());
      }
      for (const selector of this.selectors['artifactCell'] ?? []) {
        clone
          .querySelectorAll(selector)
          .forEach((cell) => cell.replaceWith(document.createTextNode(ARTIFACT_MARKER)));
      }
      return { role, content: extractMarkdown(clone), index, attachmentRefs: [] };
    });

    const modelMode = await this.getModelMode();
    return createConversation({
      id: this.conversationId(),
      sourcePlatform: 'claude',
      createdAt: new Date().toISOString(),
      messages,
      attachments: [],
      ...(modelMode.model ? { model: modelMode.model } : {}),
    });
  }
}
