# unshackled-llm-bridge — Project Plan

> Privacy-first, local-only browser extension that forks, syncs, and bridges AI conversations
> across ChatGPT, Claude, and Gemini through a unified adapter layer.
>
> **Working rule:** check items off in real time as they complete. Add newly discovered work
> under the right phase instead of doing it silently.

---

## Guiding principles (read before coding)

- **Local-only, always.** No backend, no telemetry, no conversation data ever leaves the browser.
  This is the core promise and the main marketing line — every feature decision must pass this filter.
- **The core never knows a platform.** Only adapters touch platform DOM. Core logic speaks
  exclusively in the normalized conversation format. Adding a platform = adding one adapter file.
- **Selectors are config, not code.** All DOM selectors live in a versioned remote config
  (with a bundled fallback), so a platform UI change is fixed by a config push, not a
  1–2 week store review cycle.
- **User-triggered actions only.** Never send messages or upload files in the background on our
  own initiative. Every injection is a direct response to a user click. (ToS gray-zone discipline.)
- **English code/comments/commits, Turkish-first UI copy** with i18n from day one (`tr`, `en`).

---

## Phase 0 — Scaffolding & foundations

### 0.1 Repo & tooling
- [x] Init project: Vite + CRXJS + TypeScript (strict mode), Manifest V3
- [x] ESLint (flat config) + Prettier
- [x] Vitest setup (unit tests for core; adapters get fixture-based DOM tests in phase 1)
- [x] npm, single package (pnpm not installed on this machine — revisit if it becomes a workspace)
- [x] GitHub Actions: lint + typecheck + test + build on push/PR
- [ ] Decide extension name/branding for the store listing (repo name is the codename)
- [ ] Replace placeholder icon (flat purple square) with real branding

### 0.2 Project structure (MVC + adapter service layer)
- [x] Create skeleton:
  ```
  src/
    models/                  # M — domain models & data layer (never imports adapters/views)
      conversation/          # normalized schema + (de)serializers + tests
      store/                 # Dexie/IndexedDB layer (conversations, attachments, fork lineage)
      config/                # selector config loader + bundled fallback
      wrap/                  # structural wrapping templates (tier-1 "translation")
    views/                   # V — everything the user sees
      sidepanel/             # extension UI (Chrome Side Panel API)
      content/               # in-page UI (fork button, shadow DOM)
    controllers/             # C — orchestration, no DOM parsing, no rendering
      background/            # MV3 service worker (messaging hub, fork hand-off)
      content/               # content-script entry (wires adapter ⟷ background ⟷ views)
      fork.ts                # fork use-case
    adapters/                # platform service layer — the ONLY code touching platform DOM
      types.ts               # PlatformAdapter interface + capability flags
      base-adapter.ts        # shared selector plumbing + generic health check
      chatgpt/  claude/      # concrete adapters (gemini/ lands in phase 2)
      registry.ts            # platform detection → adapter factory
    shared/                  # messaging contracts, platform registry, utils
  config/
    selectors.json           # bundled selector fallback (source of truth for remote config)
  ```
- [x] Typed messaging layer between content scripts ⟷ service worker ⟷ side panel
      (single discriminated-union `RuntimeMessage` contract in `shared/messages.ts`)

### 0.3 Normalized conversation format (the contract everything depends on)
- [x] Design `BridgeConversation` JSON schema:
      `{ schemaVersion, id, sourcePlatform, model?, mode?, title?, createdAt, messages[], attachments[] }`
      with `ChatMessage = { role, content, index, attachmentRefs[] }`
- [x] Attachment refs point into the local store (blob IDs), never inline base64 in the schema
- [x] Version field + migration strategy from v1 (parser rejects newer versions loudly,
      migration hook marked for older ones)
- [x] Unit tests: round-trip serialize/deserialize, forward-compat with unknown fields

### 0.4 PlatformAdapter interface
- [x] Define and freeze the v1 interface:
      `readConversation()`, `injectText(text)`, `uploadFile(blob, name)`,
      `getModelMode()`, `openNewChat()`, `isReady()`, `observeMessages(cb)`, `healthCheck()`
- [x] Adapter capability flags (`capabilities.{readConversation,injectText,uploadFile,…}`)
      so the UI can degrade gracefully per platform instead of erroring

### Phase 0 status — DONE (2026-07-11)
Skeleton builds (`npm run build`), typecheck/lint clean, 5/5 unit tests green.
Bonus items pulled forward from phase 1 as working stubs: generic selector health
check + naive composer injection in `base-adapter.ts`, fork hand-off plumbing
(background session storage + pending-fork claim in content controller), first-pass
wrap templates, side panel health view. The phase 1 boxes for these stay unchecked —
they cover the platform-specific hardened versions.

---

## Phase 1 — MVP: core + ChatGPT/Claude adapters + Fork (shippable alone)

### 1.1 Selector config system
- [ ] `selectors.json` schema: per-platform, per-feature selector sets with a `version` and
      `minExtensionVersion`
- [ ] Loader: fetch remote config (GitHub raw or jsDelivr from this repo) with ETag caching,
      fall back to bundled copy on failure — **config fetch only; never conversation data**
- [ ] Selector resolution helper with multiple fallback selectors per target
      (try in order, report which matched)
- [ ] Health check: adapter self-test that reports which selectors are broken
      (surfaced in side panel as "ChatGPT support degraded" instead of silent failure)

### 1.2 ChatGPT adapter
- [ ] `readConversation()`: parse message list from DOM → normalized format
      (roles, markdown/code blocks preserved, message order stable)
- [ ] `injectText()`: write into composer (contenteditable/textarea — handle both), do NOT auto-send;
      leave the send action to the user
- [ ] `openNewChat()`: navigate/click to a fresh conversation
- [ ] `observeMessages()`: MutationObserver for live message tracking (needed later for archive)
- [ ] Fixture tests: saved DOM snapshots → expected normalized output

### 1.3 Claude adapter
- [ ] Same surface as 1.2 for claude.ai
- [ ] Handle Claude-specific rendering (artifacts blocks read as fenced content or skipped
      with a marker — decide and document)
- [ ] Fixture tests

### 1.4 Fork engine
- [ ] Per-message hover UI: floating "fork" button anchored to each assistant/user message
      (shadow DOM to isolate styles from host page)
- [ ] Fork flow: cut conversation at message N → normalized package → pick target platform →
      open target in new tab → adapter injects context package into composer
- [ ] Context packaging: wrap history as a clearly-delimited "previous conversation context"
      preamble + the actual continuation prompt area left for the user
- [ ] Handoff across tabs: pending-fork stored in `chrome.storage.session`, target content script
      picks it up when adapter `isReady()`
- [ ] Length guard: estimate token size; over threshold → offer "transfer full / transfer trimmed"
      (trimmed = oldest messages elided with a note; smart summarization comes in Phase 3)
- [ ] Fork history: record fork lineage in local store (which chat spawned which)

### 1.5 Structural wrapping (tier-1 "prompt translation" — rule-based, free, deterministic)
- [ ] Per-target-platform wrap templates: Claude → XML-ish sectioning + role framing;
      ChatGPT → markdown sections; keep templates in config, not code
- [ ] Wrap is applied at fork/transfer time; user can preview + edit before it lands in composer
- [ ] Unit tests: same normalized convo → each platform's expected wrapped output

### 1.6 Side panel UI (v1)
- [ ] Side panel skeleton: current-page platform detection, adapter health status
- [ ] Fork target picker (platform list w/ capability flags)
- [ ] Transfer preview screen (show wrapped package, editable, "copy instead" escape hatch —
      clipboard fallback ALWAYS available when injection fails)
- [ ] i18n scaffolding (`tr` + `en`), Turkish copy written for all v1 surfaces
- [ ] Onboarding: 3-step first-run explainer (what it does, privacy promise, how to fork)

### 1.7 Phase 1 hardening & release
- [ ] Error boundary strategy: every adapter call wrapped; failures degrade to clipboard flow
- [ ] Manual test matrix: fork in both directions × short/long chats × code blocks × edge cases
      (empty chat, mid-generation, logged-out target)
- [ ] Privacy page + store listing copy (privacy-first angle front and center)
- [ ] Chrome Web Store submission (expect 1–2 week review; submit early builds)
- [ ] Tag v0.1.0

---

## Phase 2 — File sandbox + Gemini + resilience

### 2.1 Local file sandbox
- [ ] Capture: listen to file-input `change` + drop events on supported platforms,
      persist `File` → Dexie as Blob with metadata `{ name, mime, size, sourcePlatform, hash }`
- [ ] Dedupe by content hash; quota awareness (warn near IndexedDB quota; evaluate OPFS for >50MB)
- [ ] Replay: synthesize `DataTransfer` + dispatch `drop` on target platform's dropzone
      (more resilient than programmatic input assignment — verify per platform)
- [ ] Attachment picker in side panel: "files from this conversation" auto-suggested on fork,
      full sandbox browser as secondary view
- [ ] Wire `attachmentRefs` end-to-end: fork with files = context injection + file replay
- [ ] Size/type guard rails per platform (each platform's upload limits in selector config)

### 2.2 Gemini adapter
- [ ] Full adapter surface (read/inject/newChat/observe/upload)
- [ ] Gemini-specific wrap template (structured headers)
- [ ] Fixture tests

### 2.3 Mode/model sync (honest version)
- [ ] `getModelMode()` per platform (read which model/mode the chat used)
- [ ] On fork: record source model in the context preamble ("this conversation was with GPT-4o")
      + best-effort suggest equivalent target model in UI — do NOT silently auto-switch models
- [ ] Model-equivalence map lives in remote config

### 2.4 Resilience & ops
- [ ] Remote selector config goes live (repo-hosted JSON + update cadence documented)
- [ ] Broken-selector reporting: local-only diagnostics screen the user can copy into a GitHub issue
      (no auto-telemetry — privacy promise)
- [ ] Weekly smoke-test checklist per platform; consider Playwright against saved DOM fixtures
- [ ] Tag v0.2.0

---

## Phase 3 — Smart layer (opt-in API key) + comparison + portable memory

### 3.1 Tier-2 smart translation/summarization (BYO API key)
- [ ] Settings: user provides own API key (Anthropic and/or OpenAI); stored in
      `chrome.storage.local`, clearly explained, never synced
- [ ] Summarize-on-fork: long conversation → cheap model (e.g. Haiku) compresses history
      into a dense context brief before transfer
- [ ] Style adaptation: optional rewrite of the continuation prompt for target platform idioms
- [ ] All smart features clearly labeled as "uses your API key, direct browser→provider call,
      still no middleman server"
- [ ] Cost hint: rough token estimate + price shown before any API call

### 3.2 Parallel comparison ("same prompt, N platforms")
- [ ] Compose once in side panel → inject into 2–3 platforms (tabs opened, user sends each —
      or one-click send per tab, still user-triggered per platform)
- [ ] Response capture via `observeMessages()` → side-by-side compare view in side panel
- [ ] Save comparison sessions to local store
- [ ] Rate-limit friendliness: staggered injection, never burst

### 3.3 Portable memory / persona
- [ ] Persona editor: "who I am, how I want answers" profile (multiple profiles allowed)
- [ ] Auto-preamble: one click (or per-platform toggle) prepends active persona to new chats
- [ ] Persona included in fork packages optionally

### 3.4 Universal archive & search (stretch)
- [ ] Passive archiving (opt-in): `observeMessages()` persists visited conversations locally
- [ ] Full-text search across platforms in side panel ("did I discuss this in ChatGPT or Claude?")
- [ ] Export: any conversation/fork-tree → Markdown / JSON
- [ ] Tag v0.3.0

---

## Cross-cutting / continuous

- [ ] **Security review before each release:** injection surfaces (we write into host DOM),
      remote config parsing (validate schema, no eval), message-passing origin checks
- [ ] **Permissions minimalism:** only `storage`, `sidePanel`, `tabs` + explicit host permissions
      for the 3 platforms; every added permission must be justified in README
- [ ] **Firefox port evaluation** after v0.2 (MV3 support differences, sidebar API)
- [ ] **Docs:** README expansion (architecture diagram, adapter-writing guide for contributors),
      CONTRIBUTING.md once selector config is community-updatable
- [ ] **Store review buffer:** never let a selector fix depend on store review — that's what
      remote config is for; verify this stays true as features grow

---

## Explicitly out of scope (decided, don't revisit without reason)

- ❌ Any hosted backend / account system / sync server — breaks the local-only promise
- ❌ Auto-sending messages without a user click per message
- ❌ Scraping/archiving conversations the user hasn't opted into
- ❌ Tier-3 server-side translation service
- ❌ CAPTCHA/bot-detection workarounds of any kind — if a platform blocks an action, we surface
  it to the user and fall back to clipboard

---

## Open questions (answer before the relevant phase)

- [ ] Phase 1: how to represent Claude artifacts / ChatGPT canvas content in the normalized
      format? (fenced block vs. skip-with-marker)
- [ ] Phase 1: fork button placement — per-message hover vs. message context menu?
      Prototype both, pick by feel.
- [ ] Phase 2: OPFS vs. IndexedDB threshold for large files; what's the real quota behavior
      per browser?
- [ ] Phase 3: comparison view — side panel is narrow; does compare need its own extension page
      (`chrome-extension://` full tab)?
