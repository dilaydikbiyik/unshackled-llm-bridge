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
  text: string;
  estimatedTokens: number;
  /** Set when summarization was requested but failed; the view shows a notice. */
  summaryError?: string;
}

/**
 * How much of the conversation the fork covers.
 * - `whole`        — the entire conversation (the default: what people mean by
 *                    "move this chat over there")
 * - `upToMessage`  — everything up to the message the fork started from, which
 *                    is the branching case: continue from here, differently
 */
export type TransferScope = 'whole' | 'upToMessage';

export interface TransferRequest {
  target: PlatformId;
  mode: TransferMode;
  scope: TransferScope;
  personaText?: string;
}

/**
 * The capability the fork dialog needs. Declaring it here — rather than having
 * the view import the controller that implements it — keeps the dependency
 * pointing inward: the view and the controller both depend on this contract,
 * and neither depends on the other.
 */
export type TransferPackageBuilder = (request: TransferRequest) => Promise<TransferPackage>;
