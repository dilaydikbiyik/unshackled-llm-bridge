/**
 * A content script outlives the extension that injected it. Reloading the
 * extension — which happens on every update, and constantly during
 * development — leaves the old script running in every open tab, attached to
 * a runtime that no longer exists. Its next `chrome.*` call throws
 * "Extension context invalidated", and the page collects an unhandled
 * rejection for every listener still firing.
 *
 * The honest response is not to retry: the script is orphaned and cannot be
 * repaired. It should recognise that, stop working, and leave the page as it
 * found it. The user reloads the tab and gets a live script.
 */
const INVALIDATED = 'Extension context invalidated';

export function isContextInvalidated(error: unknown): boolean {
  if (error instanceof Error) return error.message.includes(INVALIDATED);
  return typeof error === 'string' && error.includes(INVALIDATED);
}

/**
 * False once the extension this script belongs to has gone away. `chrome` is
 * resolved inside the try: outside an extension it is not merely undefined,
 * referencing it is a ReferenceError.
 */
export function isContextAlive(runtime?: { id?: string }): boolean {
  try {
    const target = runtime ?? (typeof chrome === 'undefined' ? undefined : chrome.runtime);
    return target?.id !== undefined;
  } catch {
    return false;
  }
}

/**
 * Runs `work`, and on an invalidated context calls `teardown` once instead of
 * letting the rejection escape. Any other error is the caller's to handle.
 */
export async function guardContext<T>(
  work: () => Promise<T>,
  teardown: () => void,
): Promise<T | undefined> {
  try {
    return await work();
  } catch (error) {
    if (!isContextInvalidated(error)) throw error;
    teardown();
    return undefined;
  }
}
