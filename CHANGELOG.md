# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Still to do before a store release
- Run the end-to-end matrix in [docs/smoke-test.md](docs/smoke-test.md) with the unpacked
  extension loaded, then submit using [docs/store-listing.md](docs/store-listing.md).
- Verify the send buttons (they render only after typing), Claude artifact markup, and ChatGPT's
  model label on a paid plan.

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
  issue.
- [docs/smoke-test.md](docs/smoke-test.md), [docs/store-listing.md](docs/store-listing.md) and
  [docs/firefox-port.md](docs/firefox-port.md).

### Security
- A malformed selector in the remote config used to make `querySelector` throw and take down the
  content script. Invalid candidates are now skipped, and the config is validated per leaf
  (every target must be a list of strings, each under 500 characters) before it is used.
- Runtime messages are accepted only from this extension's own id, and only when well-formed.
- The attachment size cap is enforced where files are captured and again where they are stored.
- HTML sinks audited: every interpolated value is escaped or a constant, boolean or UUID.
- Manual test matrix across both fork directions, long chats, code blocks, and edge cases
  (empty chat, mid-generation, logged-out target).

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

[Unreleased]: https://github.com/dilaydikbiyik/unshackled-llm-bridge/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/dilaydikbiyik/unshackled-llm-bridge/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/dilaydikbiyik/unshackled-llm-bridge/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/dilaydikbiyik/unshackled-llm-bridge/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/dilaydikbiyik/unshackled-llm-bridge/releases/tag/v0.1.0
