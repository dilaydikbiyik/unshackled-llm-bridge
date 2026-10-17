/**
 * The one message that travels the other way: service worker to content script.
 *
 * Everything else in this extension is a content script asking the worker for
 * something, which is why `MessageContract` is shaped the way it is. A keyboard
 * shortcut inverts that — the worker hears the key and the page has to act — so
 * it gets its own small, explicit channel rather than bending the contract.
 */
export const FORK_COMMAND = 'fork-conversation';

export interface ForkCommandMessage {
  type: 'command/fork';
}

export function isForkCommand(message: unknown, senderId: string, ownId: string): boolean {
  if (senderId !== ownId) return false;
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as ForkCommandMessage).type === 'command/fork'
  );
}
