import type { BridgeConversation } from '@domain/conversation/schema';
import type { PlatformId } from '@domain/platforms';

/**
 * How the user likes to be answered, learned from what they keep telling
 * assistants.
 *
 * People correct assistants constantly — "shorter", "in Turkish", "no bullet
 * points", "just the code" — and every provider forgets it at the border of its
 * own product. Tell ChatGPT ten times to keep it short and Claude has never
 * heard it once. This extension sees the user's conversations on every
 * platform, so it can notice the instructions they repeat and carry them to
 * whichever assistant comes next.
 *
 * It is deliberately narrow. It reads only the user's own messages, it looks
 * for explicit instructions rather than guessing at a personality, and it only
 * proposes: nothing reaches the profile until the user has seen the evidence
 * and accepted it. Pattern matching in two languages will miss things; what it
 * does report, it can show where it came from.
 */
export type PreferenceId =
  | 'answerTurkish'
  | 'answerEnglish'
  | 'shorter'
  | 'moreDetail'
  | 'noBullets'
  | 'codeFirst'
  | 'straightToPoint'
  | 'withExample'
  | 'useTables'
  | 'plainLanguage';

export interface LearnedPreference {
  id: PreferenceId;
  /** The line that goes to the next assistant, in the user's voice. */
  steer: string;
  /** Conversations in which the user asked for it — counted once each. */
  conversations: number;
  /** Where they asked, so the evidence shows it is not one platform's quirk. */
  platforms: PlatformId[];
}

interface Rule {
  id: PreferenceId;
  steer: string;
  patterns: RegExp[];
}

/**
 * Turkish and English, because those are the languages this extension's users
 * write in. Each pattern is an instruction about answers, not a topic: "kısa"
 * alone would match a question about short stories.
 */
const RULES: readonly Rule[] = [
  {
    id: 'answerTurkish',
    steer: 'Answer me in Turkish.',
    patterns: [/türkçe\s+(cevap|yanıt|yaz|anlat|açıkla|olsun)/i, /\bin turkish\b/i, /cevab[ıi]\s+türkçe/i],
  },
  {
    id: 'answerEnglish',
    steer: 'Answer me in English.',
    patterns: [/ingilizce\s+(cevap|yanıt|yaz|anlat|olsun)/i, /\b(answer|reply|respond)\s+in english\b/i],
  },
  {
    id: 'shorter',
    steer: 'Keep answers short and to the point.',
    patterns: [
      /daha\s+kısa/i,
      /kısa\s+(tut|yaz|cevap|olsun|kes)/i,
      /\bkısaca\b/i,
      /\buzatma\b/i,
      /\b(be|keep it)\s+(brief|short|concise)\b/i,
      /\bshorter\b/i,
      /\btoo long\b/i,
    ],
  },
  {
    id: 'moreDetail',
    steer: 'Give me thorough, detailed answers.',
    patterns: [/daha\s+(detaylı|ayrıntılı)/i, /\bdetaylandır/i, /\bmore detail/i, /\belaborate\b/i, /\bgo deeper\b/i],
  },
  {
    id: 'noBullets',
    steer: 'Write in prose rather than bullet lists.',
    patterns: [
      /madde\s+(madde\s+)?(olmasın|yazma|kullanma|yapma)/i,
      /madde\s+işareti\s+(olmasın|kullanma)/i,
      /\bparagraf\s+(olarak|halinde)/i,
      /\b(no|without)\s+bullet/i,
      /\bin prose\b/i,
    ],
  },
  {
    id: 'codeFirst',
    steer: 'Lead with the code, then explain briefly.',
    patterns: [/önce\s+kod/i, /sadece\s+kod/i, /\bjust\s+(the\s+)?code\b/i, /\bcode only\b/i, /\bonly the code\b/i],
  },
  {
    id: 'straightToPoint',
    steer: 'Get straight to the point, without preamble.',
    patterns: [
      /lafı\s+dolandırma/i,
      /direkt\s+(söyle|cevap|yaz)/i,
      /giriş\s+(yapma|kısmını\s+geç)/i,
      /\bget to the point\b/i,
      /\bno fluff\b/i,
      /\bskip the (intro|preamble)\b/i,
      /\bstraight answer\b/i,
    ],
  },
  {
    id: 'withExample',
    steer: 'Include a concrete example.',
    patterns: [/örnek\s+(ver|göster|ile)/i, /\b(give|show)\s+(me\s+)?an?\s+example\b/i, /\bwith an? example\b/i],
  },
  {
    id: 'useTables',
    steer: 'Use a table when comparing things.',
    patterns: [/tablo\s+(yap|olarak|halinde|şeklinde)/i, /\b(as|in) a table\b/i],
  },
  {
    id: 'plainLanguage',
    steer: 'Explain in plain, simple language.',
    patterns: [
      /basit(çe)?\s+(anlat|açıkla)/i,
      /\bbasitleştir/i,
      /\bsade\s+(anlat|bir dille)/i,
      /\beli5\b/i,
      /\bin simple terms\b/i,
      /\bexplain like\b/i,
    ],
  },
];

/**
 * Preferences that contradict each other. If both qualify, the one asked for in
 * more conversations wins: someone who wants short answers in most chats and
 * detail in a couple has a default, and the exceptions are requests.
 */
const OPPOSITES: readonly [PreferenceId, PreferenceId][] = [
  ['answerTurkish', 'answerEnglish'],
  ['shorter', 'moreDetail'],
];

/**
 * Asked once, it was a request about that answer. Asked again in another
 * conversation, it is a standing preference.
 */
export const MIN_CONVERSATIONS = 2;

export function learnPreferences(
  conversations: readonly BridgeConversation[],
): LearnedPreference[] {
  const hits = new Map<PreferenceId, { conversations: number; platforms: Set<PlatformId> }>();

  for (const conversation of conversations) {
    const asked = conversation.messages
      .filter((message) => message.role === 'user')
      // Code is quoted material, not an instruction: a pasted log saying
      // "too long" is not the user asking for brevity.
      .map((message) => message.content.replace(/```[\s\S]*?```/g, ' '))
      .join('\n');

    for (const rule of RULES) {
      if (!rule.patterns.some((pattern) => pattern.test(asked))) continue;
      const entry = hits.get(rule.id) ?? { conversations: 0, platforms: new Set() };
      entry.conversations += 1;
      entry.platforms.add(conversation.sourcePlatform);
      hits.set(rule.id, entry);
    }
  }

  for (const [a, b] of OPPOSITES) {
    const left = hits.get(a)?.conversations ?? 0;
    const right = hits.get(b)?.conversations ?? 0;
    if (left === 0 || right === 0) continue;
    hits.delete(left >= right ? b : a);
  }

  return RULES.filter((rule) => (hits.get(rule.id)?.conversations ?? 0) >= MIN_CONVERSATIONS)
    .map((rule) => {
      const entry = hits.get(rule.id)!;
      return {
        id: rule.id,
        steer: rule.steer,
        conversations: entry.conversations,
        platforms: [...entry.platforms],
      };
    })
    .sort((x, y) => y.conversations - x.conversations);
}
