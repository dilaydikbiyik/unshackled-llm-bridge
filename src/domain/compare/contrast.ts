import type { PlatformId } from '@domain/platforms';

/**
 * What the answers agree on, and where they part.
 *
 * Reading three answers side by side still leaves the work to the reader: the
 * useful question is not what each said but where they differ, because that is
 * where one of them is probably wrong. No provider will ever build this — it
 * means showing a competitor's answer next to your own and pointing at the
 * place yours stands alone.
 *
 * Done structurally, by comparing sentences, so it needs no model and no key.
 * It reports overlap, not truth: a point every answer makes is agreed, not
 * correct, and the wording stays the answers' own.
 */
export interface AnswerContrast {
  platform: PlatformId;
  /** Points this answer makes that no other answer makes. */
  unique: string[];
}

export interface ComparisonContrast {
  /** Points every answer makes. */
  agreed: string[];
  contrasts: AnswerContrast[];
  /** 0–1: how much of what was said is common ground. */
  agreement: number;
}

/** Two sentences count as the same point above this much shared vocabulary. */
export const SIMILARITY_THRESHOLD = 0.5;
/** Shorter than this, a sentence is a transition ("Sure.", "In short:") and says nothing. */
const MIN_CONTENT_WORDS = 4;

export function contrastAnswers(
  answers: readonly { platform: PlatformId; content: string }[],
): ComparisonContrast {
  const present = answers.filter((answer) => answer.content.trim().length > 0);
  if (present.length < 2) {
    return { agreed: [], contrasts: present.map((a) => ({ platform: a.platform, unique: [] })), agreement: 0 };
  }

  const bySource = present.map((answer) => ({
    platform: answer.platform,
    points: sentences(answer.content).map((text) => ({ text, words: contentWords(text) })),
  }));

  const agreed: string[] = [];
  const contrasts: AnswerContrast[] = [];
  let shared = 0;
  let total = 0;

  for (const source of bySource) {
    const unique: string[] = [];
    for (const point of source.points) {
      total += 1;
      const echoedBy = bySource.filter(
        (other) =>
          other.platform !== source.platform &&
          other.points.some((candidate) => similarity(point.words, candidate.words) >= SIMILARITY_THRESHOLD),
      );

      if (echoedBy.length === 0) {
        unique.push(point.text);
        continue;
      }
      shared += 1;
      // Every other answer makes this point too — and it is recorded once,
      // from whichever answer stated it first.
      if (echoedBy.length === bySource.length - 1 && !agreed.some((seen) => similarity(contentWords(seen), point.words) >= SIMILARITY_THRESHOLD)) {
        agreed.push(point.text);
      }
    }
    contrasts.push({ platform: source.platform, unique });
  }

  return { agreed, contrasts, agreement: total === 0 ? 0 : shared / total };
}

/** Sentence-ish split: chat answers also break on list items and newlines. */
function sentences(content: string): string[] {
  return content
    .replace(/```[\s\S]*?```/g, ' ')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((line) => line.replace(/^[\s*\-–•\d.)]+/, '').trim())
    .filter((line) => contentWords(line).size >= MIN_CONTENT_WORDS);
}

function contentWords(text: string): Set<string> {
  const words = text.toLowerCase().match(/[\p{L}][\p{L}\p{N}+#._-]*/gu) ?? [];
  return new Set(words.filter((word) => word.length > 3));
}

function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const word of a) if (b.has(word)) overlap += 1;
  return overlap / Math.min(a.size, b.size);
}
