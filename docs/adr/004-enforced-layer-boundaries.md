# 004 — Layer boundaries enforced by the linter

**Status:** Accepted

## Context

The project started as conventional MVC: `models/`, `views/`, `controllers/`. Two problems showed
up as it grew.

First, `models/` had quietly become two different things — pure domain rules (the conversation
schema, wrap templates, the trimming policy) sitting beside infrastructure (a Dexie database, a
remote config fetcher, an HTTP client). Those have opposite dependency needs: domain rules should
depend on nothing, infrastructure depends on the world.

Second, and worse: the layering existed only in the README. An audit found three real violations
that had accumulated without anyone noticing — a view importing a controller, `shared/` importing
upward into `adapters/`, and a `domain ↔ shared` import cycle. Documented architecture decays,
because nothing stops it decaying.

## Decision

Six layers, with dependencies pointing strictly inward:

```
views ─┐
       ├─→ controllers ─→ adapters ─→ data ─→ shared ─→ domain
       └──────────────────────────────────────────────────↗
```

| Layer | Contains | May import |
|---|---|---|
| `domain` | Entities and rules: conversation schema, platform registry, wrap templates, trimming policy, transfer contracts | **nothing** |
| `shared` | Cross-boundary contracts every layer speaks: messaging union, settings, i18n, adapter health | `domain` |
| `data` | Infrastructure: IndexedDB store, remote selector config, Anthropic client | `domain`, `shared` |
| `adapters` | The only code touching platform DOM | `data`, `domain`, `shared` |
| `controllers` | Orchestration; drives the views | anything below |
| `views` | Rendering and input; takes behavior by injection | `domain`, `shared` |

**The rules are enforced in `eslint.config.js` via `no-restricted-imports`, so a violation fails
`npm run lint`, which fails CI.**

## Consequences

**It works, and it proved it immediately.** Turning the rules on caught a violation the manual
audit had missed: `fork-button.ts`, a view, was importing the data layer to resolve selectors. The
fix was to inject a `locateMessages()` callback — better design, found by a machine in a second.

**Dependency inversion where views need behavior.** The fork dialog needs to build a transfer
package, which is controller work. Rather than importing the controller, it accepts a
`TransferPackageBuilder` — an interface defined in `domain`. The view and the controller both
depend on that contract; neither depends on the other.

This produced an unplanned benefit: because the builder is injected, the fork logic became testable
without any extension runtime. Injecting the summarizer likewise made the summarize-on-fork path
testable, including the "summarization failed, degrade to full transfer" case that would otherwise
have needed a live API key to exercise. Eleven of the project's tests exist because of this change.

**What it costs.** Some indirection. Passing a callback where a direct import would have been two
lines shorter is a real, if small, price — paid for by the boundary staying true a year from now.

**The escape hatch is deliberately awkward.** Suppressing a rule requires an inline disable comment
that shows up in review. The lint file says it outright: if a rule is in your way, the design is
probably wrong — argue the design, don't delete the rule.

## What would change our mind

If the rules started generating more suppressions than fixes, that would mean the layer model does
not match the problem, and the model should change — not the enforcement.
