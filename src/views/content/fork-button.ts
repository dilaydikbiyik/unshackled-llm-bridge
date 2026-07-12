import type { PlatformAdapter } from '@adapters/types';

/**
 * In-page view: per-message hover "fork" button, isolated in shadow DOM so
 * host page styles never leak in either direction.
 *
 * TODO(phase-1.4): real implementation — anchor a floating button to each
 * message via the adapter's message containers, open the target picker, call
 * controllers/fork.forkConversation(). No-op until then so the content
 * script stays inert on the page.
 */
export function mountForkButtons(_adapter: PlatformAdapter): void {
  // Intentionally inert in phase 0.
}
