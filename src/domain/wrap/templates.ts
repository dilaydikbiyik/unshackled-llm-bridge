import type { ChatMessage } from '@domain/conversation/schema';
import { digestConversation, digestLines } from '@domain/wrap/digest';
import type { PlatformId } from '@domain/platforms';
import { platformLabel } from '@domain/platforms';

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
  /** Names of the files travelling with the package, for the brief. */
  attachmentNames?: string[];
}

export function wrapForTarget(input: WrapInput, target: PlatformId): string {
  const source = platformLabel(input.sourcePlatform);
  const model = input.model ? ` (model: ${input.model})` : '';
  const elision =
    input.trimmedCount && input.trimmedCount > 0
      ? `[${input.trimmedCount} earlier messages omitted for length]`
      : null;

  // Derived from the slice, not from the source platform: the brief states
  // where the work stands, which a transcript leaves the target to infer.
  const brief = digestLines(
    digestConversation(input.messages, input.attachmentNames ?? []),
    input.summary === undefined,
  );

  if (target === 'claude') {
    const parts: string[] = [];
    if (input.personaText) parts.push(`<about_me>\n${input.personaText}\n</about_me>`);
    parts.push(
      '<context>',
      `The following is a conversation I had with ${source}${model}. ` +
        'I am continuing it here. Read it, then answer my next message in this context.',
      '</context>',
    );
    if (brief.length) parts.push('<handoff>', ...brief, '</handoff>');
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
  if (brief.length) parts.push('### Where this stands', ...brief.map((line) => `- ${line}`), '');
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

/**
 * The one thing the composer carries when the context travels as a file.
 *
 * Continuing a conversation elsewhere is not the same as pasting it there. The
 * history belongs in the attachment, where the target reads it as a document;
 * the composer belongs to the user's next message. What stays visible is the
 * sentence that makes the file make sense.
 */
export function continuationNote(input: WrapInput, fileName: string): string {
  const source = platformLabel(input.sourcePlatform);
  const model = input.model ? ` (${input.model})` : '';
  const digest = digestConversation(input.messages, input.attachmentNames ?? []);

  const lines = [
    `Continuing a conversation I had with ${source}${model}. ` +
      `Its full transcript is attached as ${fileName} — read it first, ` +
      'then pick up where it left off.',
  ];
  if (digest.openRequest) lines.push('', `Where we left off: ${digest.openRequest}`);
  return lines.join('\n');
}
