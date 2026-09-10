# 006 — The extension never sends a message

**Status:** Accepted

## Context

Every transfer ends the same way: text is placed in the target platform's composer. Pressing send
would be one more line — `sendButton.click()` — and it would make the product feel faster. Parallel
comparison in particular would go from "we opened three tabs, now send in each" to one click.

There are three reasons not to, and they point the same direction.

**Automation posture.** Reading a page the user is looking at and filling a field they could have
filled is assistive. Dispatching messages to a service on their behalf is automation, and it sits
much closer to the line these platforms' terms of service draw. The distinction that keeps this
extension defensible is that every outbound message is a human pressing a button.

**Rate-limit shape.** An extension that can send is an extension that can burst. Parallel
comparison would fire N identical prompts within milliseconds — precisely the signature abuse
detection looks for, and a good way to get users' accounts flagged for using a tool that was
supposed to help them.

**Correctness.** Injection is best-effort against a DOM we do not control. If the wrong text lands
in the composer, a human catches it. Auto-send turns a visible glitch into a message the user did
not write, sent under their name.

## Decision

The extension fills composers. It never sends.

The rule extends to anything user-visible and outward-facing:

- Injection fills the composer and stops.
- Parallel comparison opens tabs in the background, staggered ~800ms apart, and the user sends each
  one.
- Nothing is archived until archiving is switched on; it is off by default.
- No request is made on the extension's own initiative, with the single exception of fetching
  selector config (see [ADR 002](002-selectors-as-remote-config.md)).

The related rule, from the same instinct: **content is never silently lost.** If injection fails,
the package is offered on the clipboard rather than discarded. If summarization fails, the transfer
degrades to a full transcript rather than an empty one. If a Claude artifact cannot cross over, the
transcript says so where it was. Every one of those has a test.

## Consequences

**What it costs.** More clicks. Parallel comparison across three platforms is three sends. This is
the single most likely piece of user feedback the project will get, and the answer is no.

**What it buys.** The extension cannot mis-send on a user's behalf — not through a bug, not through
a selector pointing at the wrong element, not through a platform UI change landing text somewhere
unexpected. The worst failure mode is text in the wrong box, which a human sees before it goes
anywhere.

It also keeps the "assistive, not automated" line clean, which is what makes the tool safe to
recommend to someone whose account matters to them.

## What would change our mind

A platform shipping a sanctioned API for programmatic sends would move that path out of the gray
area entirely — and would be the right way to offer it. Convenience alone is not sufficient
grounds, and a user asking for it is not either: this is a decision about their account safety, not
their preference.
