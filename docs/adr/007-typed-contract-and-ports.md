# 007 — A typed message contract, and the browser behind ports

**Status:** Accepted

## Context

Three contexts talk over `chrome.runtime` messaging: content scripts on the platform pages, the
service worker, and the side panel. In 0.3 the messages were a typed union, but the answers were
not. `sendToBackground<T>()` let the caller *assert* what came back, so a caller could send one
message and read the reply as the answer to another, and it would compile. A handler that threw
replied `{ error }`, and callers received it typed as a successful response.

The service worker was a single `switch` that called `chrome.storage`, `chrome.tabs` and IndexedDB
directly. That made the hub — the part every feature passes through — untestable without a browser,
so it was excluded from coverage. Around half the codebase was excluded for the same reason, and
the headline coverage figure described only the other half.

## Decision

**One contract.** `MessageContract` pairs every request with its response. From it:

- `sendToBackground(message)` returns `Promise<ResponseOf<type>>`. The response type follows from
  the message and cannot be asserted.
- `HandlerMap` requires a handler for every entry, returning exactly its response type. If an entry
  is added without a handler, or a handler returns the wrong shape, the code does not compile.
- A handler failure crosses the channel in a distinct envelope and is rethrown at the caller as a
  `BridgeError`, so it can no longer pass as a successful answer.
- The gate (`isAcceptableMessage`) accepts only this extension's own id and only message types
  that have a handler.

**Ports.** The service worker's behaviour lives in `createHandlers(deps)`. Everything it touches in
the outside world arrives through `BackgroundDeps`: a `KeyValueStore` for each storage area, a tab
opener, the repository, the summarizer, a clock and a sleep function. `index.ts` wires in the real
browser, and tests wire in fakes. Settings go through the same `KeyValueStore` port.

## Consequences

**The hub is tested.** Opt-in archiving, exactly-once package claiming, the attachment size cap,
staggered comparison tabs and summarize fallbacks are each a unit test against in-memory fakes. The
coverage exclusions shrank to type-only files and three entry files that do nothing but wiring.
The figure now describes the whole codebase.

**The compiler enforces the contract.** Adding a message means adding one entry to the contract,
and the compiler then points at each place that has to change.

**What it costs.** More type machinery in `shared/messages.ts`, and one `as` cast inside `dispatch`,
where TypeScript cannot relate a union member to its mapped-type handler by itself. That cast is
sound because the map is keyed by message type, and it is the only one.

## What would change our mind

If the extension grew to dozens of message types across several bounded areas, a single contract
file would become a merge-conflict hotspot. The answer then would be per-area contracts merged into
one type, not going back to untyped responses.
