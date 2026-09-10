import type { BridgeConversation } from '@models/conversation/schema';
import { sliceTokens, sliceUpTo, trimToBudget, TRANSFER_TOKEN_BUDGET } from '@models/wrap/limits';
import { wrapForTarget } from '@models/wrap/templates';
import type { Lang } from '@shared/i18n';
import { sendToBackground, type SummarizeResponse } from '@shared/messages';
import type { PlatformId } from '@shared/platforms';

export type TransferMode = 'full' | 'trimmed' | 'summary';

export interface BuildPackageOptions {
  conversation: BridgeConversation;
  cutIndex: number;
  target: PlatformId;
  mode: TransferMode;
  personaText?: string;
  language: Lang;
}

export interface BuiltPackage {
  text: string;
  estimatedTokens: number;
  /** Set when summarization was requested but failed; the caller shows a notice. */
  summaryError?: string;
}

/**
 * Builds the text that lands in the target platform's composer. Summarization
 * runs in the service worker (it holds the API key); everything else is local
 * and deterministic.
 */
export async function buildTransferPackage(options: BuildPackageOptions): Promise<BuiltPackage> {
  const { conversation, cutIndex, target, mode, personaText, language } = options;
  const slice = sliceUpTo(conversation, cutIndex);

  const base = {
    sourcePlatform: conversation.sourcePlatform,
    ...(conversation.model ? { model: conversation.model } : {}),
    ...(personaText ? { personaText } : {}),
  };

  if (mode === 'summary') {
    const transcript = slice.map((m) => `${m.role}: ${m.content}`).join('\n\n');
    const result = await sendToBackground<SummarizeResponse>({
      type: 'summarize/run',
      transcript,
      language,
    });
    if (result.ok) {
      const text = wrapForTarget({ ...base, messages: [], summary: result.summary }, target);
      return { text, estimatedTokens: Math.ceil(text.length / 4) };
    }
    // Degrade to a full transfer rather than losing the fork entirely.
    const text = wrapForTarget({ ...base, messages: slice }, target);
    return { text, estimatedTokens: sliceTokens(slice), summaryError: result.error };
  }

  const prepared = mode === 'trimmed' ? trimToBudget(slice) : { messages: slice, trimmedCount: 0 };
  const text = wrapForTarget(
    { ...base, messages: prepared.messages, trimmedCount: prepared.trimmedCount },
    target,
  );
  return { text, estimatedTokens: sliceTokens(prepared.messages) };
}

/** True when the slice is large enough that the dialog should nudge trimming. */
export function needsLengthWarning(conversation: BridgeConversation, cutIndex: number): boolean {
  return sliceTokens(sliceUpTo(conversation, cutIndex)) > TRANSFER_TOKEN_BUDGET;
}
