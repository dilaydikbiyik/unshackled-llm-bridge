import type { BridgeConversation } from '@models/conversation/schema';
import { PLATFORMS } from '@shared/platforms';

/** Renders a conversation as a self-contained Markdown document. */
export function conversationToMarkdown(conversation: BridgeConversation): string {
  const source = PLATFORMS[conversation.sourcePlatform].label;
  const lines = [
    `# ${conversation.title ?? 'Conversation'}`,
    '',
    `- Source: ${source}${conversation.model ? ` (${conversation.model})` : ''}`,
    `- Exported from: Unshackled LLM Bridge`,
    `- Created: ${conversation.createdAt}`,
    '',
  ];
  for (const message of conversation.messages) {
    lines.push(`## ${message.role === 'user' ? 'User' : source}`, '', message.content, '');
  }
  return lines.join('\n');
}

export function exportFilename(conversation: BridgeConversation, format: 'markdown' | 'json'): string {
  const base = (conversation.title ?? conversation.id)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base || 'conversation'}.${format === 'markdown' ? 'md' : 'json'}`;
}
