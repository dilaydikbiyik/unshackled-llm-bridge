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

MVC, plus an adapter layer that is the only code allowed to touch platform DOM.

```
src/
  models/        M — domain & data. Conversation schema, local store, selector config,
                 wrap templates, summarization client. Imports no views, no adapters.
  views/         V — side panel UI and in-page UI (shadow DOM, so platform styles
                 can't leak in either direction).
  controllers/   C — orchestration. Background service worker (messaging hub, DB access,
                 API key), content-script entry, fork and attachment use-cases.
  adapters/      Platform service layer. One file per platform behind a single
                 PlatformAdapter interface; the core only ever speaks the normalized format.
  shared/        Messaging contract, platform registry, settings, i18n.
config/
  selectors.json Every DOM selector, versioned. See below.
```

**Adding a platform** is three edits: an adapter file, one case in `adapters/registry.ts`, and a
selector block in `config/selectors.json`. Nothing in `models/` or `views/` changes.

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
npm test           # unit + DOM fixture tests
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm run build      # production build into dist/
```

Adapter tests run against saved DOM fixtures. **When a live selector breaks, update
`config/selectors.json` and the corresponding fixture together** — a passing test against a stale
fixture proves nothing about the live site.

## Status

Phases 0–3 of [todo.md](todo.md) are implemented. The selectors have not yet been verified against
the live sites — the fixtures are reconstructions of known DOM shapes, so they validate the parsing
logic, not that today's markup matches. That verification is the top open item.

## License

MIT — see [LICENSE](LICENSE).
