# 003 — One adapter interface per platform; the core never sees DOM

**Status:** Accepted

## Context

Three platforms, each with a different DOM shape, a different composer implementation
(React-controlled `textarea`, ProseMirror, Quill), and different conventions for what a message
even is. More platforms will follow — Grok, Mistral, DeepSeek, whatever ships next year.

The naive structure is a set of `if (platform === 'chatgpt')` branches threaded through the
features. It works for two platforms and collapses at four: every feature grows a branch per
platform, and every new platform means editing every feature.

## Decision

A single `PlatformAdapter` interface — `readConversation`, `injectText`, `uploadFile`,
`getModelMode`, `openNewChat`, `isReady`, `observeMessages`, `healthCheck` — with one
implementation per platform. Adapters are the **only** code permitted to touch platform DOM.

Everything above them speaks one normalized format, `BridgeConversation`. The fork engine, the wrap
templates, the archive and the comparison view have no idea which platform they are dealing with.

Two supporting choices:

- **Capability flags.** Each adapter declares what it can actually do. The UI degrades gracefully
  on `false` rather than erroring on an unsupported action — an honest `false` is a working
  feature, a dishonest `true` is a bug report.
- **A shared base class.** Selector resolution, the health check, framework-safe composer
  injection, debounced observation and file replay live in `BaseAdapter`, so a new adapter usually
  only overrides `readConversation`.

## Consequences

**Adding a platform is three edits:** an adapter file, one `case` in the registry, and a selector
block in config. Nothing in `domain/`, `data/` or `views/` changes. This is the property the design
exists to produce, and it is stated as a check in `CONTRIBUTING.md`: if adding a platform requires
editing core code, the interface is wrong and the interface gets fixed, not special-cased.

**Testability.** Because adapters convert DOM to a plain data structure, they are testable against
saved DOM fixtures with no browser and no network. That is what makes the parsing logic verifiable
at all.

**What it costs.** An interface that must be general enough for three quite different products,
which means some platform-specific capability is unavailable through it. Claude's artifacts are the
live example: they cannot be represented in the normalized format, so they are marked in the
transcript rather than silently dropped (see [ADR 006](006-user-presses-send.md) for the general
principle).

## What would change our mind

If a platform's capabilities diverged so far that the interface became a lowest common denominator
that served nobody, the answer would be capability-specific sub-interfaces that adapters opt into —
not branching in the core.
