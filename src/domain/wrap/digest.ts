import type { ChatMessage } from '@domain/conversation/schema';

/**
 * What a handoff needs that a raw transcript does not state: where the work
 * stands. Derived structurally from the messages — no model, no API key, no
 * network — so it is deterministic and costs nothing.
 *
 * This is the difference between forking a conversation and pasting it. A
 * paste makes the target read the whole history and guess what is being asked;
 * a brief tells it up front, and the transcript stays underneath as evidence.
 */
export interface ConversationDigest {
  turnCount: number;
  /** Languages of the code blocks carried, most frequent first. */
  codeLanguages: string[];
  codeBlockCount: number;
  /** The last thing the user asked — what the target must actually answer. */
  openRequest: string | null;
  /** Names of files referenced in the slice, in order of first appearance. */
  attachmentNames: string[];
}

const CODE_BLOCK = /```([\w+-]*)\n[\s\S]*?```/g;
/** A request is useful as a heading only if it is short enough to read at a glance. */
const OPEN_REQUEST_LIMIT = 280;

export function digestConversation(
  messages: ChatMessage[],
  attachmentNames: string[] = [],
): ConversationDigest {
  const languages = new Map<string, number>();
  let codeBlockCount = 0;

  for (const message of messages) {
    for (const match of message.content.matchAll(CODE_BLOCK)) {
      codeBlockCount += 1;
      const lang = match[1]?.trim();
      if (lang) languages.set(lang, (languages.get(lang) ?? 0) + 1);
    }
  }

  const lastUser = [...messages].reverse().find((m) => m.role === 'user');

  return {
    turnCount: messages.length,
    codeLanguages: [...languages.entries()].sort((a, b) => b[1] - a[1]).map(([lang]) => lang),
    codeBlockCount,
    openRequest: lastUser ? condense(lastUser.content) : null,
    attachmentNames,
  };
}

/** The first sentence or so of a message, with code and markup stripped out. */
function condense(content: string): string | null {
  const prose = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!prose) return null;
  return prose.length <= OPEN_REQUEST_LIMIT ? prose : `${prose.slice(0, OPEN_REQUEST_LIMIT).trimEnd()}…`;
}

/**
 * The brief as lines, for whichever structure the target platform parses best.
 *
 * `withOpenRequest` is false when a summary replaces the transcript: the open
 * request is the user's own words, and summarizing exists precisely so those
 * words do not travel verbatim.
 */
export function digestLines(digest: ConversationDigest, withOpenRequest = true): string[] {
  const lines: string[] = [`Turns carried: ${String(digest.turnCount)}`];
  if (digest.codeBlockCount > 0) {
    const langs = digest.codeLanguages.length ? ` (${digest.codeLanguages.join(', ')})` : '';
    lines.push(`Code blocks: ${String(digest.codeBlockCount)}${langs}`);
  }
  if (digest.attachmentNames.length) {
    lines.push(`Files carried over: ${digest.attachmentNames.join(', ')}`);
  }
  if (withOpenRequest && digest.openRequest) {
    lines.push(`What I need next: ${digest.openRequest}`);
  }
  return lines;
}
