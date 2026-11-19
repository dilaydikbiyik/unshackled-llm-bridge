import { BaseAdapter } from '@adapters/base-adapter';
import { extractMarkdown } from '@adapters/dom-markdown';
import type { AdapterCapabilities, ReadOptions } from '@adapters/types';
import { safeQueryAll } from '@data/config/selector-config';
import { createConversation, type BridgeConversation, type ChatMessage } from '@domain/conversation/schema';
import type { PlatformId } from '@domain/platforms';

const ARTIFACT_MARKER = '\n\n[artifact from Claude — not transferred]\n\n';
/** The row a message sits in, numbered by its place in the conversation. */
const TRANSCRIPT_ROW = "[data-testid='transcript-row'][data-index]";

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

  override async readConversation(options: ReadOptions = {}): Promise<BridgeConversation> {
    const turns = await this.readTurns(options, (turn) => this.readTurn(turn));
    const messages: ChatMessage[] = turns.map((turn, index) => ({ ...turn, index }));

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

  /**
   * Claude virtualizes long conversations too: a conversation of eighteen
   * messages kept four in the DOM. Each sits in a transcript row numbered by
   * its place (`data-index`), and the row says how many there are in all
   * (`aria-setsize`, "Message 10 of 18").
   */
  protected override turnOrder(turn: Element): [number, number] | null {
    const index = turn.closest(TRANSCRIPT_ROW)?.getAttribute('data-index');
    return index !== null && index !== undefined && index !== '' ? [Number(index), 0] : null;
  }

  protected override turnTotal(): number | null {
    const size = document.querySelector('[aria-setsize]')?.getAttribute('aria-setsize');
    return size ? Number(size) : null;
  }

  private readTurn(container: Element): Omit<ChatMessage, 'index'> {
    const userSelectors = this.selectors['userMessage'] ?? [];
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
    return { role, content: extractMarkdown(clone), attachmentRefs: [] };
  }
}
