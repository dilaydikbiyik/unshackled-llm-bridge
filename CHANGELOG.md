# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed
- **Gemini's send button selector had drifted.** The button lost its `send-button` class, and its
  only label is a translated `aria-label` ("Mesaj gönder"). Its wrapper keeps a stable
  `data-test-id="send-button"`, so the selector now targets `[data-test-id='send-button'] button`.
  The English `aria-label` candidate is dropped, because it matched in only one locale. Selector
  config v6.
- The send buttons of all three platforms are now verified live. The check typed a character into a
  new chat's composer, counted matches, and deleted it; nothing was sent.
- CI actions moved to `checkout`, `setup-node` and `upload-artifact` v7, which run on Node 24,
  ahead of GitHub removing Node 20.
- A misplaced bullet in the 0.3.1 notes was removed.

### Added
- **Continuing a conversation, instead of pasting one.** The transcript now travels to the target
  as an uploaded Markdown file, and the composer carries a single sentence: what this is, where it
  came from, and what was being asked. The user's own next message goes into an empty composer,
  which is what continuing a conversation elsewhere actually looks like. Delivery as inline text
  stays available, and is selected automatically for any target that takes no uploads. If the
  upload fails on the far side, the full package is written into the composer instead — a
  continuation note with no conversation attached would be worse than a paste.

### Added
- **A handoff brief at the head of every package.** Derived structurally from the slice — no model,
  no API key, no network — it states how many turns travel, what code comes with them and in which
  languages, which files were replayed, and what the user actually needs next. Without it the
  target reads a transcript and infers the task; with it, the ask is the first thing it sees. This
  is the line between forking a conversation and pasting one, and it was fair criticism that the
  package did not show it. The brief omits the open request when a summary replaces the
  transcript, so summarizing still keeps the user's wording out of the package.

### Changed
- **A fork now carries the whole conversation by default.** Forking used to mean "everything up to
  the message you started from", so forking from an opening message transferred that message alone
  — no better than retyping it. The dialog gains a **Scope** control, defaulting to the whole
  conversation and labelling each option with how many messages it covers. Forking at a point, the
  branching case the project was built around, is one select away. Found by the owner on the first
  real fork; no test could have found it, because every test asserted the behaviour as designed.

### Fixed
- **Gemini messages arrived twice, with a label attached.** Every user turn is also rendered as
  `h5.cdk-visually-hidden` reading "Siz şunu dediniz: …" for screen readers, and the extractor took
  both. Accessibility-only nodes (`aria-hidden`, `hidden`, `sr-only`, `cdk-visually-hidden`,
  `screen-reader-*`) are now skipped everywhere: a transcript carries what the user sees.
- **The onboarding steps were numbered twice** — "1. 1. Open a conversation…" — because each step
  carried its own number inside an `<ol>`. Found on the first real install. The markers now come
  from the list, and a test asserts no step string starts with its own number, in either language.

### Verified
- **Full live re-check of all three platforms (2026-10-05), plus the end-to-end suite.** Every
  required selector target resolves on a real conversation on each platform, and both sides of the
  conversation match. ChatGPT's markup had drifted again — the CSS-module response root is gone and
  the answer now sits in `<hash>_content markdown prose …` — but the fallback chain absorbed it:
  `assistantContent` resolves through its third candidate, `.markdown`. No selector change was
  needed, which is the first time the candidate-list design has paid for itself unaided.
- The ChatGPT fixtures were updated to today's markup all the same. Three fixtures now cover the
  three variants, and each resolves a different candidate — so the list is demonstrably a working
  fallback chain rather than three guesses.

### Still to do before a store release — owner's steps
- Load the unpacked extension and run the end-to-end matrix in
  [docs/smoke-test.md](docs/smoke-test.md), then submit using
  [docs/store-listing.md](docs/store-listing.md).
- Claude artifact markup is unverified: none of the 60 most recent conversations contains an
  artifact, and producing one means sending a message. ChatGPT's model label is unverified on a
  paid plan.

## [0.4.0] — 2026-09-11

Architecture hardening, following a critical review of 0.3.1.

### Changed — architecture
- **Typed message contract** ([ADR 007](docs/adr/007-typed-contract-and-ports.md)). Every request
  is paired with its response. `sendToBackground()` infers the response type instead of letting
  the caller assert it, and the service worker's `HandlerMap` fails to compile if a handler is
  missing or returns the wrong shape.
- **Service worker split into handlers and wiring.** `createHandlers(deps)` holds all behaviour
  and receives storage, tabs, the repository, the summarizer, a clock and a sleep function as
  ports. `index.ts` only wires in the real browser. The `switch` is gone.
- **`chrome.storage` behind a `KeyValueStore` port**, with in-memory and Chrome implementations.
  Settings, comparisons and health all go through it.
- **HTML safe by construction** ([ADR 008](docs/adr/008-html-safe-by-construction.md)). An `html`
  tagged template escapes every interpolation, `setHtml()` is the only way to insert markup, and a
  lint rule forbids `innerHTML` everywhere else. All views were converted.
- Base64 helpers and the comparison log key are each defined once, in `shared/`, instead of being
  duplicated across contexts.

### Added
- **End-to-end suite** ([ADR 009](docs/adr/009-e2e-against-routed-fixtures.md)). Playwright loads
  the built extension into Chromium and drives ChatGPT → Claude and Claude → Gemini forks, plus
  side-panel health, against fixture copies of the three sites. It asserts that the target's
  composer is filled and that its send button was never clicked. It runs as its own CI job.
- Tests for the data layer (against a fake IndexedDB), the summarizer (against a fake network,
  including the refusal and empty-answer paths), the remote config loader, and every view.
- **Coverage now describes the whole codebase.** Only type-only files and three wiring entry points
  are excluded. The 0.3 figure of 96% covered roughly half the code; the new figure covers all of
  it.

### Fixed
- **A failing service-worker handler looked like success.** It replied `{ error }`, and callers
  received that typed as a normal response. Failures now travel in a separate envelope and are
  rethrown as `BridgeError`.
- **The side panel stacked a storage listener on every render**, so each comparison update
  re-rendered it once for every render that had ever happened. It now subscribes once.
- **The first end-to-end run reached the real claude.ai** from a tab the extension opened, because
  Playwright cannot route that tab's first navigation. The browser under test now resolves no real
  host.

## [0.3.1] — 2026-09-10

### Fixed — from the first live check against the real sites
- **Claude replies were being dropped.** Assistant turns moved from `div.font-claude-message` to
  `.font-claude-response`. The old rule combined user and assistant turns in one selector, so it
  kept matching user messages and looked healthy while losing every reply. A fixture regression
  test now covers the live markup.
- **Gemini model picker and new-chat button** kept their `data-test-id` values but changed element
  type (`div` → `button`, `expandable-button` → `gem-nav-list-item`). Selectors are now
  tag-agnostic.
- **ChatGPT read zero messages.** Turns moved from `<article>` to `<section>`, so every fork from
  ChatGPT would have transferred an empty conversation. The answer node is now resolved from a
  new `assistantContent` config target instead of a `.markdown` class hard-coded in the adapter —
  which also brings the adapter back in line with ADR 002.
- **Image-only turns were blank.** A screenshot sent with no text became an empty message.
  Images are now marked in the transcript as `[image]` / `[image: alt]` on every platform, the
  same way Claude artifacts are marked rather than dropped.
- **The side panel cried wolf.** The health check treated every unresolved target as broken, so
  every new chat and every idle composer (no send button yet) reported the platform as degraded.
  Targets are now classed: page-level ones are always required, conversation ones only on a
  conversation URL, and situational ones (send button, model picker, artifacts) never. Found by
  running the new probe against the live sites.
- ChatGPT's logged-out composer (`#mobile-composer-prompt`) added as a fallback candidate.
- Selector config bumped to version 5, so installed copies pick the fixes up remotely.

### Added
- **The health check catches half-matching selectors.** Two or more turns on one side of a
  conversation and none on the other is reported as broken — the exact shape that hid the Claude
  bug behind a "healthy" status.
- **Fork lineage in the Markdown export:** a `## Forks` section lists where, and after which
  message, a conversation was forked.
- `npm run probe` prints a DevTools snippet, with the selector config embedded, that reports broken
  targets and half-matching message selectors on a live page. Counts only — safe to paste into an
  issue. Its verdict is also the snippet's return value, which DevTools always echoes: claude.ai
  replaces `console.log` with its own function, so a logged-only verdict was invisible there.
- [docs/smoke-test.md](docs/smoke-test.md), [docs/store-listing.md](docs/store-listing.md) and
  [docs/firefox-port.md](docs/firefox-port.md).

### Security
- A malformed selector in the remote config used to make `querySelector` throw and take down the
  content script. Invalid candidates are now skipped, and the config is validated per leaf
  (every target must be a list of strings, each under 500 characters) before it is used.
- Runtime messages are accepted only from this extension's own id, and only when well-formed.
- The attachment size cap is enforced where files are captured and again where they are stored.
- HTML sinks audited: every interpolated value is escaped or a constant, boolean or UUID.

## [0.3.0] — 2026-09-10

### Changed — architecture
- **Layered architecture with enforced boundaries.** `models/` was split into `domain/` (pure
  entities and rules, importing nothing) and `data/` (IndexedDB, remote config, the Anthropic
  client). Dependencies now point strictly inward and are enforced by `no-restricted-imports`
  rules, so crossing a layer boundary fails lint and CI. See [ADR 004](docs/adr/004-enforced-layer-boundaries.md).
- The platform registry moved from `shared/` to `domain/`, breaking a `domain ↔ shared` import
  cycle. `domain/` now has zero outward dependencies.
- `AdapterHealth` moved to `shared/health.ts`, so `shared/` no longer imports from `adapters/`.
- The fork dialog no longer imports its controller. It receives a `TransferPackageBuilder` —
  a contract defined in `domain/` — by injection. The fork button likewise receives a
  `locateMessages()` callback instead of reaching into the data layer for selectors, a violation
  the new lint rules caught on first run.
- `escapeHtml` deduplicated into a single `views/escape.ts`, now escaping single quotes as well.

### Added
- Six Architecture Decision Records in [`docs/adr/`](docs/adr/), covering local-only storage,
  selectors as remote config, the adapter layer, enforced boundaries, file replay via synthetic
  drop, and never auto-sending.
- Coverage reporting with 80% thresholds over the logic unit tests can reach; every excluded path
  carries a stated reason in `vitest.config.ts`.
- `npm run verify` runs lint, typecheck, coverage and build — the same gate CI applies.
- Tests for the shared adapter plumbing (injection, health check, debounced observation,
  never clicking send), DOM→markdown conversion including `javascript:` link stripping, the fork builder (now injectable, so testable without an extension runtime), HTML
  escaping, i18n catalog parity, markdown export, platform detection, and the conversation
  parser's malformed-input paths — 97 tests in total.
- A designed icon set (16/32/48/128) replacing the placeholder.

### Security
- Platform detection is covered by a test asserting that look-alike hosts (`evilclaude.ai`,
  `claude.ai.attacker.example`) are rejected — suffix matching respects the dot boundary.
- Export filenames strip path separators, so a conversation titled `../../etc/passwd` exports as
  `etc-passwd.json`.

## [0.2.0] — 2026-09-10

### Added
- **Fork engine.** A per-message `⑂ Fork` affordance opens an in-page dialog to pick a target
  platform, choose full / trimmed / summarized transfer, attach captured files and a persona, and
  edit the package before it lands in the target's composer.
- **Gemini adapter**, completing the three-platform set.
- **File sandbox.** Uploads are captured to IndexedDB (deduplicated by SHA-256, 25 MB cap) and
  replayed on the target via a synthetic drag-and-drop sequence.
- **Summarize on transfer** with the user's own Anthropic API key — browser to API directly.
- **Parallel comparison** in the side panel, with tab opens staggered to avoid bursts.
- **Portable persona** profiles attachable to any transfer.
- **Universal archive**: opt-in local indexing with cross-platform search and Markdown/JSON export.
- **Remote selector config** with ETag caching, a version guard, and a bundled fallback.
- Local-only **diagnostics report** for broken selectors.
- Turkish-first UI with an English translation; first-run onboarding.
- `README.md`, `PRIVACY.md` and `CONTRIBUTING.md`.

### Changed
- Injection failure now degrades to a clipboard toast; a transfer package is never lost.

## [0.1.0] — 2026-07-11

### Added
- Manifest V3 skeleton on Vite, CRXJS and strict TypeScript.
- The normalized `BridgeConversation` format with a versioned, forward-compatible parser.
- The `PlatformAdapter` interface with capability flags and a generic selector health check.
- ChatGPT and Claude adapters with DOM-fixture tests. Claude artifacts are marked in the
  transcript rather than silently dropped.

[Unreleased]: https://github.com/dilaydikbiyik/unshackled-llm-bridge/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/dilaydikbiyik/unshackled-llm-bridge/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/dilaydikbiyik/unshackled-llm-bridge/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/dilaydikbiyik/unshackled-llm-bridge/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/dilaydikbiyik/unshackled-llm-bridge/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/dilaydikbiyik/unshackled-llm-bridge/releases/tag/v0.1.0
