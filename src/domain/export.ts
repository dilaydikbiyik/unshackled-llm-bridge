import type { BridgeConversation } from '@domain/conversation/schema';
import { platformLabel, type PlatformId } from '@domain/platforms';

/** Renders a conversation as a self-contained Markdown document. */
/** Where a conversation was forked to — recorded at transfer time. */
export interface ForkNote {
  targetPlatform: PlatformId;
  cutIndex: number;
  createdAt: string;
}

export function conversationToMarkdown(
  conversation: BridgeConversation,
  forks: ForkNote[] = [],
): string {
  const source = platformLabel(conversation.sourcePlatform);
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
  if (forks.length > 0) {
    lines.push('## Forks', '');
    for (const fork of forks) {
      lines.push(
        `- ${fork.createdAt.slice(0, 10)} → ${platformLabel(fork.targetPlatform)}, ` +
          `continued after message ${fork.cutIndex + 1}`,
      );
    }
    lines.push('');
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
