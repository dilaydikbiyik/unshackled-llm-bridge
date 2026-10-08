import type { PlatformId } from '@domain/platforms';

/**
 * How much of a conversation travels to the target platform.
 * - `full`      — everything up to the fork point
 * - `trimmed`   — the middle elided to fit a token budget, elision marked
 * - `summary`   — compressed into a context brief (needs the user's API key)
 */
export type TransferMode = 'full' | 'trimmed' | 'summary';

/** The finished text handed to the target platform's composer. */
export interface TransferPackage {
  /** What lands in the composer: the whole package, or the continuation note. */
  text: string;
  estimatedTokens: number;
  /** Set for `attachment` delivery: the context that travels as a file. */
  contextFile?: { name: string; text: string };
  /** Set when summarization was requested but failed; the view shows a notice. */
  summaryError?: string;
}

/**
 * How much of the conversation the fork covers.
 * - `whole`        — the entire conversation (the default: what people mean by
 *                    "move this chat over there")
 * - `upToMessage`  — everything up to the message the fork started from, which
 *                    is the branching case: continue from here, differently
 * - `sinceLast`    — only what has been said since the last transfer between
 *                    these two conversations. This is what turns a one-off
 *                    hand-off into a relay: two assistants kept in step over
 *                    several exchanges, each told only what it has missed.
 */
export type TransferScope = 'whole' | 'upToMessage' | 'sinceLast';

/**
 * How the context reaches the target.
 * - `attachment` — the transcript travels as an uploaded file and the composer
 *                  carries one continuation sentence. This is what continuing a
 *                  conversation looks like: the target has the history, and the
 *                  user writes their next message into an empty composer.
 * - `inline`     — everything goes into the composer as text. The fallback for
 *                  targets that take no uploads, and when the user wants to
 *                  read and edit the whole package before it lands.
 */
export type TransferDelivery = 'attachment' | 'inline';

export interface TransferRequest {
  target: PlatformId;
  mode: TransferMode;
  scope: TransferScope;
  delivery: TransferDelivery;
  personaText?: string;
}

/**
 * The capability the fork dialog needs. Declaring it here — rather than having
 * the view import the controller that implements it — keeps the dependency
 * pointing inward: the view and the controller both depend on this contract,
 * and neither depends on the other.
 */
export type TransferPackageBuilder = (request: TransferRequest) => Promise<TransferPackage>;
