import type { BridgeConversation } from '@domain/conversation/schema';
import { platformLabel, type PlatformId } from '@domain/platforms';

/**
 * A profile distilled from the user's own conversations, across every platform
 * they use.
 *
 * Providers ship memory too, but a provider's memory is theirs: it lives in
 * their account, describes you to them, and reaches only the conversations you
 * had with them. What they call portability is an import — one direction,
 * towards them. This one is assembled locally from the local archive, belongs
 * to the user, reads the same whichever assistant it is handed to, and is
 * editable before it goes anywhere.
 *
 * It is derived structurally. No model is involved, nothing is sent anywhere,
 * and the result is the same every time — which also means it claims only what
 * can honestly be counted, and leaves the wording to the user.
 */
export interface MemoryProfile {
  /** Platforms the user actually works on, most used first. */
  platforms: { platform: PlatformId; conversations: number }[];
  /** Recurring subjects, most frequent first. */
  topics: string[];
  /** Programming languages seen in code blocks, most frequent first. */
  codeLanguages: string[];
  conversationCount: number;
  /** ISO dates of the first and last conversation, when there are any. */
  span: { from: string; to: string } | null;
}

/** How many of each kind the profile keeps: enough to be useful, short enough to read. */
export const TOPIC_LIMIT = 12;
const CODE_LANGUAGE_LIMIT = 8;
/** Below this, a repeated word is a coincidence rather than a subject. */
const MIN_TOPIC_OCCURRENCES = 3;
const MIN_TOPIC_LENGTH = 4;

/**
 * Words that recur in any corpus and describe nobody. Kept deliberately small:
 * a long stop list quietly becomes an editorial opinion about what the user is
 * allowed to be interested in, and the frequency threshold does most of the
 * work already.
 */
const STOP_WORDS = new Set([
  'this', 'that', 'with', 'from', 'have', 'what', 'when', 'which', 'would', 'could', 'should',
  'about', 'there', 'their', 'then', 'than', 'they', 'them', 'your', 'yours', 'just', 'like',
  'make', 'made', 'does', 'done', 'into', 'over', 'some', 'more', 'most', 'other', 'because',
  'here', 'also', 'only', 'very', 'much', 'need', 'want', 'know', 'take', 'give', 'help',
  'sure', 'thanks', 'please', 'okay', 'yeah',
  // Turkish, since the UI is Turkish-first and so are many of the archives.
  'için', 'daha', 'gibi', 'olan', 'olarak', 'ancak', 'sonra', 'önce', 'kadar', 'çok', 'bir',
  'bana', 'benim', 'sana', 'senin', 'bunu', 'şunu', 'nasıl', 'neden', 'tamam', 'evet', 'hayır',
  'yani', 'ama', 'veya', 'ile', 'mi', 'mı', 'mu', 'mü',
]);

const CODE_BLOCK = /```([\w+-]*)\n[\s\S]*?```/g;
const WORD = /[\p{L}][\p{L}\p{N}+#._-]*/gu;

export function distilMemory(conversations: readonly BridgeConversation[]): MemoryProfile {
  const platforms = new Map<PlatformId, number>();
  const topics = new Map<string, number>();
  const languages = new Map<string, number>();
  const dates: string[] = [];

  for (const conversation of conversations) {
    platforms.set(
      conversation.sourcePlatform,
      (platforms.get(conversation.sourcePlatform) ?? 0) + 1,
    );
    if (conversation.createdAt) dates.push(conversation.createdAt);

    // Only what the user wrote. An assistant's prose is its own vocabulary,
    // and counting it would describe the model rather than the person.
    const asked = conversation.messages.filter((m) => m.role === 'user');
    const seenHere = new Set<string>();

    for (const message of asked) {
      for (const match of message.content.matchAll(CODE_BLOCK)) {
        const language = match[1]?.trim().toLowerCase();
        if (language) languages.set(language, (languages.get(language) ?? 0) + 1);
      }
      for (const match of message.content.replace(CODE_BLOCK, ' ').matchAll(WORD)) {
        const word = match[0].toLowerCase();
        if (word.length < MIN_TOPIC_LENGTH || STOP_WORDS.has(word)) continue;
        seenHere.add(word);
      }
    }

    // Counted once per conversation: a word repeated forty times in one thread
    // is that thread's subject, not a standing interest.
    for (const word of seenHere) topics.set(word, (topics.get(word) ?? 0) + 1);
  }

  for (const conversation of conversations) {
    for (const message of conversation.messages) {
      if (message.role === 'user') continue;
      for (const match of message.content.matchAll(CODE_BLOCK)) {
        const language = match[1]?.trim().toLowerCase();
        if (language) languages.set(language, (languages.get(language) ?? 0) + 1);
      }
    }
  }

  dates.sort();
  return {
    platforms: byFrequency(platforms).map(([platform, count]) => ({
      platform,
      conversations: count,
    })),
    topics: byFrequency(topics)
      .filter(([, count]) => count >= MIN_TOPIC_OCCURRENCES)
      .slice(0, TOPIC_LIMIT)
      .map(([word]) => word),
    codeLanguages: byFrequency(languages).slice(0, CODE_LANGUAGE_LIMIT).map(([language]) => language),
    conversationCount: conversations.length,
    span:
      dates.length > 0 && dates[0] && dates.at(-1)
        ? { from: dates[0].slice(0, 10), to: dates.at(-1)!.slice(0, 10) }
        : null,
  };
}

/**
 * The profile as a first draft for the user to edit. Written as statements of
 * fact that can be checked, not as a character sketch: everything here was
 * counted, and anything else is the user's to add in their own words.
 */
export function draftProfileText(profile: MemoryProfile): string {
  if (profile.conversationCount === 0) return '';
  const lines: string[] = [];

  if (profile.platforms.length > 0) {
    lines.push(
      `I work across ${profile.platforms.map((p) => platformLabel(p.platform)).join(', ')}.`,
    );
  }
  if (profile.codeLanguages.length > 0) {
    lines.push(`Code I share is usually ${profile.codeLanguages.join(', ')}.`);
  }
  if (profile.topics.length > 0) {
    lines.push(`Subjects I keep returning to: ${profile.topics.join(', ')}.`);
  }
  lines.push(
    `Drawn from ${String(profile.conversationCount)} of my own conversations` +
      (profile.span ? `, ${profile.span.from} to ${profile.span.to}` : '') +
      '. Edit this freely — it is mine, not a platform’s.',
  );
  return lines.join('\n');
}

function byFrequency<T>(counts: Map<T, number>): [T, number][] {
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}
