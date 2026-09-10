# 005 — Files replay as synthetic drops, not input assignment

**Status:** Accepted

## Context

The feature: you upload a 50-page PDF to ChatGPT, then fork the conversation to Claude, and the PDF
should already be there. That means capturing the file locally and re-attaching it on the target.

Re-attaching is the hard half. Browsers deliberately make `<input type="file">` unwritable from
script — you cannot assign `input.value` or construct a `FileList`. The available approaches:

1. **Assign to the file input's `files` property** using a `DataTransfer`. Works, but requires
   locating each platform's file input, which is usually hidden, unlabeled, and re-rendered by the
   framework.
2. **Dispatch a synthetic drop event** carrying a `DataTransfer`.
3. **Drive the visible attach button** and interact with the OS file picker — impossible from a
   web extension.

## Decision

Synthetic drop. `createFileTransfer()` wraps the stored blob back into a named `File` inside a
`DataTransfer`, and `dispatchFileDrop()` fires the full `dragenter → dragover → drop` sequence at
the platform's drop zone.

The full sequence matters: several platforms only arm their drop handler after seeing
`dragenter`/`dragover`, and ignore a bare `drop`.

## Consequences

**More durable than the alternative.** All three platforms support drag-and-drop upload as a
first-class, user-facing feature, so the handler is stable in a way a hidden input's markup is not.
Drop zones are also coarse — the composer wrapper or `<main>` — which means far less to break than
a specific `input` node.

**One clean security property.** Synthetic events carry `isTrusted: false`. The capture listener
only records `isTrusted` events, so a replayed file can never be re-captured into the store. That
single check eliminates the infinite-loop failure mode without any bookkeeping.

**What it costs.**

- *Not directly testable in the DOM shim.* happy-dom implements `DataTransfer` but drops it from
  `DragEvent`'s init, so a test cannot observe the file arriving through the event. Rather than
  testing around the shim, payload construction was split into a pure function and tested on its
  own merits, with the dispatch tested for sequence and bubbling. This is honest about what is
  verified: the payload and the event sequence, not the browser's delivery of one to the other.
- *Replay is paced.* Platforms process uploads serially, so replays are spaced ~600ms apart.
  Attaching several files is visibly gradual.
- *Unverified against live sites.* Like every selector-dependent path, this is correct in principle
  and untested against today's markup. It is the top open item in `todo.md`.

**Guard rail.** Files over 25 MB are not captured. IndexedDB quota is shared and finite, and
silently filling it to mirror a video is a worse failure than not mirroring it.

## What would change our mind

If a platform ships an upload API — or if drop handling turns out to be materially less reliable
than input assignment on a specific platform — the adapter interface already allows one platform to
override `uploadFile` without affecting the others. The default should stay the one that works
everywhere.
