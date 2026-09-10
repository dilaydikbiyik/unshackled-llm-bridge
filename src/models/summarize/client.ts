import Anthropic from '@anthropic-ai/sdk';
import type { Lang } from '@shared/i18n';

/**
 * Tier-2 smart transfer: compresses a long conversation into a dense context
 * brief before it is handed to the target platform.
 *
 * Privacy contract: the call goes browser → api.anthropic.com directly, with
 * the user's own key from chrome.storage.local. There is no middleman server,
 * which is why `dangerouslyAllowBrowser` is correct here — the "danger" it
 * guards against is shipping a shared key to untrusted clients, and this key
 * belongs to the person running the extension.
 */

const SYSTEM_PROMPT = `You compress AI chat transcripts into a context brief that lets a different
assistant continue the conversation without having read it.

Preserve, in this order:
1. What the user is ultimately trying to achieve.
2. Decisions already made and explicitly rejected options — so they are not re-litigated.
3. Constraints, preferences, and facts the user supplied.
4. Where the conversation left off and what the open question is.

Keep code, names, numbers, and identifiers verbatim. Drop pleasantries and
restatements. Write it as notes addressed to the assistant that takes over,
not as a summary addressed to the user.`;

export interface SummarizeOptions {
  apiKey: string;
  model: string;
  transcript: string;
  language: Lang;
}

export async function summarizeTranscript(options: SummarizeOptions): Promise<string> {
  const client = new Anthropic({ apiKey: options.apiKey, dangerouslyAllowBrowser: true });

  const languageNote =
    options.language === 'tr'
      ? 'Write the brief in Turkish.'
      : 'Write the brief in the language of the transcript.';

  const response = await client.messages.create({
    model: options.model,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `${languageNote}\n\n<transcript>\n${options.transcript}\n</transcript>`,
      },
    ],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('The model declined to summarize this conversation.');
  }

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  if (!text) throw new Error('The summary came back empty.');
  return text;
}
