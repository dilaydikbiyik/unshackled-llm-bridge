import type { ChatMessage } from './schema';

/**
 * Where a message the user pointed at sits in the whole conversation.
 *
 * On a page that keeps only part of a long conversation, the handle counts the
 * turns it can see: "the second message" may be the fourteenth. The visible
 * stretch is found in the whole conversation by its text — the latest place
 * it matches, since that is the one on screen when the user scrolled down to it
 * — and the position is shifted by where it starts. When it is not found the
 * visible position is kept: forking from the wrong point is recoverable in the
 * dialog, refusing to fork is not.
 */
export function alignCutIndex(
  visible: readonly Pick<ChatMessage, 'role' | 'content'>[],
  whole: readonly Pick<ChatMessage, 'role' | 'content'>[],
  visibleIndex: number,
): number {
  if (visible.length === 0 || whole.length <= visible.length) return visibleIndex;
  const same = (a: Pick<ChatMessage, 'role' | 'content'>, b: Pick<ChatMessage, 'role' | 'content'>) =>
    a.role === b.role && a.content === b.content;
  for (let start = whole.length - visible.length; start >= 0; start -= 1) {
    if (visible.every((message, i) => same(message, whole[start + i]!))) {
      return Math.min(start + visibleIndex, whole.length - 1);
    }
  }
  return visibleIndex;
}
