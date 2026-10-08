import type { BridgeConversation, ChatMessage } from '@domain/conversation/schema';
import type {
  TransferMode,
  TransferPackage,
  TransferPackageBuilder,
  TransferRequest,
  TransferScope,
} from '@domain/transfer';
import { sliceTokens, sliceUpTo, trimToBudget, TRANSFER_TOKEN_BUDGET } from '@domain/wrap/limits';
import { continuationNote, wrapForTarget } from '@domain/wrap/templates';
import type { Lang } from '@shared/i18n';
import { sendToBackground, type SummarizeResponse } from '@shared/messages';

/** Compresses a transcript remotely; the service worker owns the API key. */
export type Summarizer = (transcript: string, language: Lang) => Promise<SummarizeResponse>;

const defaultSummarizer: Summarizer = (transcript, language) =>
  sendToBackground({ type: 'summarize/run', transcript, language });

export interface ForkContext {
  conversation: BridgeConversation;
  cutIndex: number;
  language: Lang;
  /**
   * The index already carried to the other side, so a relay can send only what
   * has been said since. Absent on a conversation that has never been relayed.
   */
  relayedThrough?: number;
  /** Injected so the build logic is testable without the extension runtime. */
  summarize?: Summarizer;
}

/**
 * Produces the builder the fork dialog calls. The dialog knows only the
 * `TransferPackageBuilder` contract from the domain, so this controller can
 * change how packages are assembled without the view knowing.
 */
export function createTransferPackageBuilder(context: ForkContext): TransferPackageBuilder {
  const { conversation, cutIndex, language, relayedThrough } = context;
  const summarize = context.summarize ?? defaultSummarizer;

  return async ({
    target,
    mode,
    scope,
    delivery,
    personaText,
  }: TransferRequest): Promise<TransferPackage> => {
    // Resolved per request: the dialog lets the user switch scope without the
    // controller rebuilding the builder.
    const slice = messagesInScope(conversation, cutIndex, scope, relayedThrough);
    const base = {
      sourcePlatform: conversation.sourcePlatform,
      attachmentNames: conversation.attachments.map((a) => a.name),
      ...(conversation.model ? { model: conversation.model } : {}),
      ...(personaText ? { personaText } : {}),
    };

    if (mode === 'summary') {
      const transcript = slice.map((m) => `${m.role}: ${m.content}`).join('\n\n');
      const result = await summarize(transcript, language);
      if (result.ok) {
        const text = wrapForTarget({ ...base, messages: [], summary: result.summary }, target);
        return { text, estimatedTokens: Math.ceil(text.length / 4) };
      }
      // Degrade to a full transfer rather than losing the fork entirely.
      const text = wrapForTarget({ ...base, messages: slice }, target);
      return { text, estimatedTokens: sliceTokens(slice), summaryError: result.error };
    }

    const prepared: { messages: typeof slice; trimmedCount: number } =
      mode === 'trimmed' ? trimToBudget(slice) : { messages: slice, trimmedCount: 0 };
    const wrapped = { ...base, messages: prepared.messages, trimmedCount: prepared.trimmedCount };
    const text = wrapForTarget(wrapped, target);
    const estimatedTokens = sliceTokens(prepared.messages);

    if (delivery === 'attachment') {
      const name = contextFileName(conversation.sourcePlatform);
      return {
        text: continuationNote(wrapped, name),
        estimatedTokens,
        contextFile: { name, text },
      };
    }
    return { text, estimatedTokens };
  };
}

/** Stable, readable, and safe as a filename on every platform. */
export function contextFileName(sourcePlatform: string): string {
  return `${sourcePlatform}-conversation.md`;
}

/** The messages a scope covers. `whole` ignores the fork point entirely. */
export function messagesInScope(
  conversation: BridgeConversation,
  cutIndex: number,
  scope: TransferScope,
  relayedThrough?: number,
): ChatMessage[] {
  if (scope === 'whole') return conversation.messages;
  if (scope === 'upToMessage') return sliceUpTo(conversation, cutIndex);
  // A relay with no previous hand-off has nothing to be "since", so it carries
  // everything — the first leg of a relay is an ordinary transfer.
  if (relayedThrough === undefined) return conversation.messages;
  return conversation.messages.filter((m) => m.index > relayedThrough);
}

/** True when the slice is large enough that the dialog should nudge trimming. */
export function exceedsTransferBudget(
  conversation: BridgeConversation,
  cutIndex: number,
  scope: TransferScope,
  relayedThrough?: number,
): boolean {
  return (
    sliceTokens(messagesInScope(conversation, cutIndex, scope, relayedThrough)) >
    TRANSFER_TOKEN_BUDGET
  );
}

export type { TransferMode };
