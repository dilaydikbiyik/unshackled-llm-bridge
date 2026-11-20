import type { BridgeConversation, ChatMessage } from '@domain/conversation/schema';
import type { PlatformId } from '@domain/platforms';
import type {
  TransferMode,
  TransferPackage,
  TransferPackageBuilder,
  TransferRequest,
  TransferScope,
} from '@domain/transfer';
import {
  estimateTokens,
  sliceTokens,
  sliceUpTo,
  SUMMARY_INPUT_BUDGET,
  trimToBudget,
  TRANSFER_TOKEN_BUDGET,
} from '@domain/wrap/limits';
import { continuationNote, wrapForTarget } from '@domain/wrap/templates';
import { compactMessages, translationNote } from '@domain/language/compact';
import {
  prepareDocuments,
  renderDocuments,
  type ExtractedDocument,
} from '@domain/documents/landmarks';
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
   * How far this conversation has already been carried to a given target, so a
   * relay can send only what that one has missed. A function of the target
   * because the answer differs per pair: a platform that has seen nothing must
   * not be offered the latest turns alone.
   */
  relayedThrough?: (target: PlatformId) => number | undefined;
  /** Injected so the build logic is testable without the extension runtime. */
  summarize?: Summarizer;
  /**
   * Compact context: the conversation's language, and a way to get a
   * translator to English for it — created on first use, since creating one
   * may download a model and Chrome allows that only after a user gesture.
   */
  compact?: {
    from: string;
    translator: () => Promise<((text: string) => Promise<string>) | null>;
  };
  /** Reads uploaded documents as text; a document that has none is left out. */
  loadDocuments?: (ids: string[]) => Promise<ExtractedDocument[]>;
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
    documentIds,
    compact,
  }: TransferRequest): Promise<TransferPackage> => {
    // Resolved per request: the dialog lets the user switch scope without the
    // controller rebuilding the builder.
    const original = messagesInScope(conversation, cutIndex, scope, relayedThrough?.(target));
    // Translated before trimming, so the budget is measured on what is sent.
    // A summary is written fresh, so there is nothing to translate there.
    const compacted = compact && mode !== 'summary' ? await compactSlice(original) : null;
    const slice = compacted ?? original;
    const documents = await documentsFor(documentIds, slice);
    const withDocuments = (text: string) => (documents ? `${text}\n\n${documents}` : text);
    const documentTokens = documents ? estimateTokens(documents) : 0;
    const base = {
      sourcePlatform: conversation.sourcePlatform,
      attachmentNames: conversation.attachments.map((a) => a.name),
      ...(conversation.model ? { model: conversation.model } : {}),
      ...(personaText ? { personaText } : {}),
      ...(compacted && context.compact ? { translationNote: translationNote(context.compact.from) } : {}),
    };
    const compactInfo = compact
      ? compacted
        ? { uncompactedTokens: sliceTokens(mode === 'trimmed' ? trimToBudget(original).messages : original) + documentTokens }
        : mode === 'summary'
          ? {}
          : { compactFailed: true }
      : {};

    if (mode === 'summary') {
      // Trimmed first: the conversations worth summarizing are the ones large
      // enough to be refused, and failing there defeats the point of the mode.
      const forSummary = trimToBudget(slice, SUMMARY_INPUT_BUDGET).messages;
      const transcript = forSummary.map((m) => `${m.role}: ${m.content}`).join('\n\n');
      const result = await summarize(transcript, language);
      if (result.ok) {
        const text = withDocuments(
          wrapForTarget({ ...base, messages: [], summary: result.summary }, target),
        );
        return { text, estimatedTokens: estimateTokens(text) };
      }
      // Degrade to a full transfer rather than losing the fork entirely.
      const text = withDocuments(wrapForTarget({ ...base, messages: slice }, target));
      return {
        text,
        estimatedTokens: sliceTokens(slice) + documentTokens,
        summaryError: result.error,
      };
    }

    const prepared =
      mode === 'trimmed'
        ? trimToBudget(slice)
        : { messages: slice, trimmedCount: 0, truncatedCount: 0 };
    const wrapped = {
      ...base,
      messages: prepared.messages,
      trimmedCount: prepared.trimmedCount,
      truncatedCount: prepared.truncatedCount,
    };
    const text = withDocuments(wrapForTarget(wrapped, target));
    const estimatedTokens = sliceTokens(prepared.messages) + documentTokens;

    if (delivery === 'attachment') {
      const name = contextFileName(conversation.sourcePlatform);
      return {
        text: continuationNote(wrapped, name),
        estimatedTokens,
        contextFile: { name, text },
        ...compactInfo,
      };
    }
    return { text, estimatedTokens, ...compactInfo };
  };

  /** The slice with its earlier messages in English, or null if that is not possible. */
  async function compactSlice(slice: ChatMessage[]): Promise<ChatMessage[] | null> {
    if (!context.compact || context.compact.from === 'en') return null;
    const translate = await context.compact.translator();
    if (!translate) return null;
    try {
      return await compactMessages(slice, translate);
    } catch {
      return null;
    }
  }

  /**
   * The documents, cut to what this part of the conversation is about. Read
   * once per document and kept: the dialog rebuilds on every change.
   */
  async function documentsFor(
    ids: string[] | undefined,
    slice: ChatMessage[],
  ): Promise<string | null> {
    if (!ids?.length || !context.loadDocuments) return null;
    const docs = await context.loadDocuments(ids);
    if (docs.length === 0) return null;
    const about = slice.map((m) => m.content).join('\n');
    return renderDocuments(prepareDocuments(docs, about));
  }
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
