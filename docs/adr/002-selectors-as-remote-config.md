# 002 — DOM selectors are remote config, not code

**Status:** Accepted

## Context

This extension works by reading and writing the DOM of three products it does not control. Those
products ship UI changes frequently, and their class names are build output (`css-1x2y3z`) that
change on every deploy.

If selectors are compiled into the extension, the repair path for a broken platform is: notice →
fix → build → submit to the Chrome Web Store → **wait one to two weeks for review** → users update.
For most of that window the extension is simply broken.

That review latency is the specific reason extensions in this category die. A tool that is broken
for two weeks at a time, several times a year, loses its users' trust well before it loses its
functionality.

## Decision

Every selector lives in `config/selectors.json`, fetched at runtime from the public repository with
ETag caching and a six-hour TTL, with the bundled copy as a fallback.

Repairing a broken platform is a commit to a JSON file. Users pick it up within hours, without
updating the extension and without waiting for a review.

Supporting rules:

- **Ordered candidate lists.** Each target holds several selectors tried in order, so a fix can be
  added ahead of the old one without breaking users still seeing the old markup.
- **Version-guarded.** A remote config with a lower `version` than the bundled one is ignored, so a
  stale or rolled-back file can never downgrade a working install.
- **Fail-safe.** Any fetch failure, non-200, or shape-validation failure falls through to the
  bundled copy. The extension works offline and works if GitHub is down.
- **Config only.** The fetch is a plain file download. It carries no conversation data, no
  identifiers, and no request body. This is what keeps it compatible with
  [ADR 001](001-local-only.md).

## Consequences

**What we gain.** Mean time to repair drops from weeks to hours. Selector fixes also become the
easiest possible contribution — a contributor edits one JSON file and a test fixture, with no need
to understand the rest of the codebase. `CONTRIBUTING.md` leads with that workflow for this reason.

**What it costs.** A runtime dependency on a network fetch, mitigated by the bundled fallback. And
the remote file is now a live input, so it is schema-validated on arrival and never `eval`'d.

**A real risk we accepted.** Anyone who can push to the repository can change what the extension
queries on three high-value domains. The mitigations are that the config can only express CSS
selectors (it cannot introduce behavior), the file is public and diffable, and the extension's host
permissions bound the blast radius to the three platforms it already runs on.

**The rule this creates.** No feature may put a selector fix behind a store review. Every future
change has to preserve that property, which is why it is written down here rather than left as an
implementation detail.

## What would change our mind

If the platforms shipped stable, documented DOM contracts — or an actual export API — the whole
mechanism would be unnecessary. The remote config exists because we are working against an
unstable, undocumented interface, and it should be retired the moment that stops being true.
