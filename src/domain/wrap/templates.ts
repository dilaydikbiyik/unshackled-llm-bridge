import type { ChatMessage } from '@domain/conversation/schema';
import type { PlatformId } from '@domain/platforms';
import { PLATFORMS } from '@domain/platforms';

/**
 * Tier-1 structural wrapping: no LLM, no cost, deterministic. Packages a
 * conversation slice in the structure the target platform parses best.
 * The fork dialog shows the result for preview/edit before injection.
 */
export interface WrapInput {
  sourcePlatform: PlatformId;
  model?: string;
  messages: ChatMessage[];
  /** > 0 when the slice was trimmed; rendered as an elision note. */
  trimmedCount?: number;
  /** Active persona text to carry along, if the user opted in. */
  personaText?: string;
  /** Replaces the transcript entirely (summarize-on-fork). */
  summary?: string;
}

export function wrapForTarget(input: WrapInput, target: PlatformId): string {
  const source = PLATFORMS[input.sourcePlatform].label;
  const model = input.model ? ` (model: ${input.model})` : '';
  const elision =
    input.trimmedCount && input.trimmedCount > 0
      ? `[${input.trimmedCount} earlier messages omitted for length]`
      : null;

  if (target === 'claude') {
    const parts: string[] = [];
    if (input.personaText) parts.push(`<about_me>\n${input.personaText}\n</about_me>`);
    parts.push(
      '<context>',
      `The following is a conversation I had with ${source}${model}. ` +
        'I am continuing it here. Read it, then answer my next message in this context.',
      '</context>',
    );
    if (input.summary) {
      parts.push('<conversation_summary>', input.summary, '</conversation_summary>');
    } else {
      const transcript = input.messages
        .map((m) => `<message role="${m.role}">\n${m.content}\n</message>`)
        .join('\n');
      parts.push('<conversation>', ...(elision ? [elision] : []), transcript, '</conversation>');
    }
    parts.push('');
    return parts.join('\n');
  }

  // Markdown structure for ChatGPT, Gemini and any future default target.
  const parts: string[] = [];
  if (input.personaText) parts.push('## About me', input.personaText, '');
  parts.push(
    '## Previous conversation context',
    `This conversation started with ${source}${model}. I am continuing it here.`,
    '',
  );
  if (input.summary) {
    parts.push('### Summary of the conversation so far', '', input.summary, '');
  } else {
    if (elision) parts.push(`_${elision}_`, '');
    const transcript = input.messages
      .map((m) => `**${m.role === 'user' ? 'Me' : source}:**\n${m.content}`)
      .join('\n\n---\n\n');
    parts.push(transcript, '');
  }
  parts.push('---', '');
  return parts.join('\n');
}
