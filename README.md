# unshackled-llm-bridge

Break free from vendor lock-in. A privacy-first, local-only browser extension to fork, sync, and
bridge your AI conversations across ChatGPT, Claude, and Gemini through a unified adapter layer.

Most "chat exporter" extensions are text porters: they move a blob of text and stop. This is an
**ecosystem bridge** — it carries the conversation, the files you uploaded, the model that produced
it, and your personal context across platforms, and it never sends any of it to a server.

## What it does

| Feature | What you get |
|---|---|
| **Fork a conversation** | Hover any message, hit `⑂ Fork`, pick a target platform. The history up to that point is repackaged in the structure the target parses best and dropped into its composer. |
| **File sandbox** | Files you upload are mirrored into local browser storage and replayed on the target platform automatically — no re-uploading the same 50-page PDF everywhere. |
| **Structural prompt translation** | Claude gets XML-style sectioning, ChatGPT and Gemini get markdown sections. Deterministic, free, no API key needed. |
| **Summarize on transfer** *(optional)* | With your own Anthropic API key, long conversations are compressed into a dense context brief before transfer. Browser → API directly; no middleman. |
| **Parallel comparison** | Compose once, inject into several platforms, read the answers side by side. |
| **Portable persona** | A "who I am, how I want answers" profile you can attach to any transfer — platform-independent memory. |
| **Universal archive** | Opt-in local indexing of visited conversations, searchable across platforms, exportable to Markdown or JSON. |

## The promises

- **Local-only.** No backend, no account, no telemetry. Your conversations never leave the browser.
  The only network request the extension makes on its own is fetching its selector config from this
  repo — never conversation data.
- **You always press send.** Injection fills the composer; it never dispatches a message on its own.
- **Nothing is silently lost.** If automatic injection fails, the package is offered on your
  clipboard. If a Claude artifact can't be carried over, it is marked in the transcript rather than
  dropped.

## Install (development)

```bash
npm install
npm run build
```

Then in Chrome: `chrome://extensions` → enable Developer mode → **Load unpacked** → select `dist/`.

## Architecture

Six layers with dependencies pointing strictly inward, **enforced by the linter** rather than
described and hoped for.

```
views ─┐
       ├─→ controllers ─→ adapters ─→ data ─→ shared ─→ domain
       └──────────────────────────────────────────────────↗
```

| Layer | Contains | May import |
|---|---|---|
| `domain/` | Entities and rules: conversation schema, platform registry, wrap templates, trimming policy, transfer contracts | **nothing** |
| `shared/` | Contracts every layer speaks: the messaging union, settings, i18n, adapter health | `domain` |
| `data/` | Infrastructure: IndexedDB store, remote selector config, Anthropic client | `domain`, `shared` |
| `adapters/` | The only code that touches platform DOM | `data`, `domain`, `shared` |
| `controllers/` | Orchestration: service worker, content-script entry, fork and attachment use-cases | anything below |
| `views/` | Side panel and in-page UI (shadow DOM, so platform styles can't leak either way) | `domain`, `shared` |

`eslint.config.js` encodes these as `no-restricted-imports` rules, so crossing a boundary fails
`npm run lint` and fails CI. It is not decoration — turning the rules on immediately caught a view
that was reaching into the data layer to resolve selectors.

Where a view needs behavior from a controller, the dependency is inverted: the fork dialog accepts
a `TransferPackageBuilder`, an interface defined in `domain`. The view and the controller both
depend on that contract and neither depends on the other — which is also why the fork logic is
unit-testable with no browser and no extension runtime.

**Adding a platform** is three edits: an adapter file, one case in `adapters/registry.ts`, and a
selector block in `config/selectors.json`. Nothing in `domain/`, `data/` or `views/` changes.

### Why these choices

The decisions that shaped this — and what would reverse them — are recorded in
[docs/adr](docs/adr/):

| # | Decision |
|---|---|
| [001](docs/adr/001-local-only.md) | No backend: everything stays in the browser |
| [002](docs/adr/002-selectors-as-remote-config.md) | DOM selectors are remote config, not code |
| [003](docs/adr/003-adapter-layer.md) | One adapter interface per platform; the core never sees DOM |
| [004](docs/adr/004-enforced-layer-boundaries.md) | Layer boundaries enforced by the linter |
| [005](docs/adr/005-file-replay-via-drop.md) | Files replay as synthetic drops, not input assignment |
| [006](docs/adr/006-user-presses-send.md) | The extension never sends a message |

### Selectors are config, not code

The platforms restyle their UIs constantly and their class names are build output. If selectors
were hard-coded, every UI change would mean a fix that waits out a 1–2 week store review — which is
exactly how extensions in this category die.

Instead, `config/selectors.json` is fetched from this repo at runtime with ETag caching and a
bundled fallback. A broken selector is fixed by pushing a config update; users pick it up within
hours without updating the extension. A stale remote config can never downgrade a newer bundled
one, and any fetch failure degrades silently to the bundled copy.

When a platform breaks, the side panel says which selectors failed and offers a **diagnostics
report** you can paste into an issue. It contains selector state and nothing else — no conversation
content, and it is never sent automatically.

## Permissions, and why each one exists

| Permission | Why |
|---|---|
| `storage` | The local file sandbox, archive, settings, and your persona. |
| `sidePanel` | The extension's UI surface. |
| `tabs` | Opening the target platform when you transfer a conversation. |
| Host access to the three platform domains | Reading the conversation and filling the composer. |

Nothing else is requested. Any new permission has to earn a row in this table.

## Development

```bash
npm run dev        # Vite dev server with HMR
npm test           # 97 unit + DOM fixture tests
npm run coverage   # tests with coverage thresholds
npm run typecheck  # tsc --noEmit, strict
npm run lint       # eslint, including the architecture boundary rules
npm run verify     # everything CI runs, in one command
npm run build      # production build into dist/
```

Adapter tests run against saved DOM fixtures. **When a live selector breaks, update
`config/selectors.json` and the corresponding fixture together** — a passing test against a stale
fixture proves nothing about the live site.

## Status

Phases 0–3 of [todo.md](todo.md) are implemented: typecheck, lint and 97 tests pass (96% line / 86% branch
coverage over the logic unit tests can reach), and the production build is clean.

**Live verification.** All three platforms have been checked against the live sites, and the
check found real drift on each — including ChatGPT reading zero messages and Claude dropping every
reply. Both are fixed and covered by fixtures that mirror the live markup. What remains unverified
is listed in `todo.md`: send buttons, Claude artifacts, and ChatGPT's model label on paid plans.

## License

MIT — see [LICENSE](LICENSE).
