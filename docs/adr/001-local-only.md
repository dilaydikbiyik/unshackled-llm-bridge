# 001 — No backend: everything stays in the browser

**Status:** Accepted

## Context

The extension reads people's AI conversations. Those transcripts contain work products, medical
questions, legal drafts, private notes — some of the most sensitive text a person produces.

A server would make several features easier: cross-device sync, a shared selector-fix pipeline,
server-side summarization without asking users for an API key, and usage analytics to find out
which platforms break most often.

## Decision

There is no backend. No server, no account system, no telemetry, no analytics. Conversations,
files, personas and settings live in browser-local storage and never leave the device.

Two outbound requests are permitted, and only these two:

1. Fetching `config/selectors.json` from the public repository. A plain file download that sends
   nothing.
2. If, and only if, the user supplies their own API key: a direct browser → `api.anthropic.com`
   call to summarize a transfer. It does not pass through any infrastructure we operate.

## Consequences

**What we give up.** No cross-device sync. No aggregate view of which selectors are breaking, so
we depend on users reporting it. Summarization requires each user to bring an API key, which most
will not do, so the free structural-wrapping path has to be good enough to stand alone — and it is
the default for that reason.

**What we gain.** The privacy claim is structural rather than a promise: there is no server that
*could* leak, subpoena-respond, or get breached. It is the one thing this extension can offer that
a venture-funded competitor cannot copy without abandoning its business model, which makes it a
positioning advantage as well as an ethical one.

It also removes an entire category of work — no infrastructure, no uptime, no data-retention
policy, no GDPR data-subject request handling.

**Where it bites.** Diagnostics. When a selector breaks we learn about it from a user opening an
issue, which is slower than telemetry would be. Mitigated by making the report one click to copy
(see [ADR 002](002-selectors-as-remote-config.md)), never auto-sent.

## What would change our mind

Nothing short of a feature that is impossible locally *and* more valuable than the privacy
position — and cross-device sync is not it, since an encrypted-blob sync service that cannot read
the plaintext would satisfy the requirement without a readable backend. If the project ever adds
sync, that is the shape it must take.
