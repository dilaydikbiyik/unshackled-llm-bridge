import type { BridgeConversation } from '@models/conversation/schema';
import type { PlatformId } from '@shared/platforms';
import { PLATFORMS } from '@shared/platforms';

/**
 * Tier-1 structural wrapping: no LLM, no cost, deterministic. Packages a
 * conversation slice in the structure the target platform parses best.
 * TODO(phase-1.5): move templates into remote config and add a preview/edit
 * step in the side panel before injection.
 */
export function wrapForTarget(
  conversation: BridgeConversation,
  cutIndex: number,
  target: PlatformId,
): string {
  const slice = conversation.messages.filter((m) => m.index <= cutIndex);
  const source = PLATFORMS[conversation.sourcePlatform].label;
  const model = conversation.model ? ` (model: ${conversation.model})` : '';

  if (target === 'claude') {
    const transcript = slice
      .map((m) => `<message role="${m.role}">\n${m.content}\n</message>`)
      .join('\n');
    return [
      '<context>',
      `The following is a conversation I had with ${source}${model}. `,
      'I am continuing it here. Read it, then answer my next message in this context.',
      '</context>',
      '<conversation>',
      transcript,
      '</conversation>',
      '',
    ].join('\n');
  }

  const transcript = slice
    .map((m) => `**${m.role === 'user' ? 'Me' : source}:**\n${m.content}`)
    .join('\n\n---\n\n');
  return [
    `## Previous conversation context`,
    `This conversation started with ${source}${model}. I am continuing it here.`,
    '',
    transcript,
    '',
    '---',
    '',
  ].join('\n');
}
