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
    domain/                  # pure entities + rules, imports nothing (split out of models/ in 0.3.0)
      conversation/          # normalized schema + (de)serializers + tests
      wrap/                  # structural wrapping templates + trimming policy
    data/                    # infrastructure: never imports adapters/controllers/views
      store/                 # Dexie/IndexedDB layer (conversations, attachments, fork lineage)
      config/                # selector config loader + bundled fallback
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
- [x] `selectors.json` schema: per-platform, per-feature selector sets with a `version` and
      `minExtensionVersion`
- [x] Loader: fetches remote config from this repo with ETag caching + 6h TTL, validates shape,
      falls back to the bundled copy on any failure — **config fetch only; never conversation data**.
      A stale remote config can never downgrade a newer bundled one.
- [x] Selector resolution helper with multiple fallback selectors per target
      (try in order, report which matched)
- [x] Health check: adapter self-test that reports which selectors are broken
      (surfaced in side panel as "ChatGPT support degraded" instead of silent failure)

### 1.2 ChatGPT adapter
- [x] `readConversation()`: parse message list from DOM → normalized format
      (roles, markdown/code blocks preserved, message order stable)
- [x] `injectText()`: contenteditable via execCommand insertText, textarea via native
      value setter (React-safe); never auto-sends
- [x] `openNewChat()`: click new-chat button, fall back to URL navigation
- [x] `observeMessages()`: debounced MutationObserver (generic impl in base adapter)
- [x] Fixture tests: DOM fixtures → expected normalized output (rule: a selector change
      updates config/selectors.json AND the fixture together)
- [ ] Verify selectors against live chatgpt.com and fix drift (fixtures are best-effort
      reconstructions, not captured snapshots)

### 1.3 Claude adapter
- [x] Same surface as 1.2 for claude.ai
- [x] Artifacts: DECIDED — inline preview cells are replaced with an explicit
      `[artifact from Claude — not transferred]` marker (never dropped silently);
      live DOM is cloned, not mutated
- [x] Fixture tests
- [ ] Verify selectors against live claude.ai and fix drift

### 1.4 Fork engine
- [x] Per-message hover UI: a single floating "fork" button repositioned onto the hovered message
      (shadow DOM; nothing is injected into the platform's own DOM tree)
- [x] Fork flow: cut conversation at message N → normalized package → pick target platform →
      open target in new tab → adapter injects context package into composer
- [x] Context packaging: history wrapped as a clearly-delimited "previous conversation context"
      preamble; the continuation prompt area is left for the user
- [x] Handoff across tabs: pending package stored in `chrome.storage.session`, target content
      script claims it once the adapter reports `isReady()`
- [x] Length guard: token estimate; over threshold → "transfer full / trimmed / summarized".
      Trimming keeps the first message (frames the conversation) and the latest ones, elides the
      middle, and marks the elision in the output
- [x] Fork history: fork lineage recorded in the local store (which chat spawned which)

### 1.5 Structural wrapping (tier-1 "prompt translation" — rule-based, free, deterministic)
- [x] Per-target-platform wrap templates: Claude → XML-ish sectioning + role framing;
      ChatGPT/Gemini → markdown sections
- [x] Wrap is applied at fork/transfer time; user can preview + edit before it lands in composer
- [x] Unit tests: same normalized convo → each platform's expected wrapped output
- [ ] Move templates from code into remote config (deferred: they are structural, not selectors,
      so they don't share the "fix without a store review" urgency)

### 1.6 Side panel UI (v1)
- [x] Side panel skeleton: adapter health status per platform
- [x] Fork target picker — lives in the in-page dialog rather than the side panel, so it sits next
      to the message being forked
- [x] Transfer preview screen (wrapped package shown, editable, "copy instead" escape hatch —
      clipboard fallback ALWAYS available when injection fails)
- [x] i18n scaffolding (`tr` + `en`), Turkish copy written for all surfaces
- [x] Onboarding: 3-step first-run explainer (what it does, privacy promise, how to fork)

### 1.7 Phase 1 hardening & release
- [x] Error boundary strategy: injection failure degrades to a clipboard toast; the package is
      never lost
- [x] Privacy page (PRIVACY.md) + README written privacy-first
- [ ] Manual test matrix: fork in both directions × short/long chats × code blocks × edge cases
      (empty chat, mid-generation, logged-out target) — **needs a real browser session**
- [ ] Chrome Web Store listing copy + submission (expect 1–2 week review)
- [ ] Tag v0.1.0

---

## Phase 2 — File sandbox + Gemini + resilience

### 2.1 Local file sandbox
- [x] Capture: file-input `change` + `drop` listeners persist `File` → Dexie as a Blob with
      metadata. Only `isTrusted` events are captured, so our own replays can never loop back in
- [x] Dedupe by SHA-256 content hash, scoped per conversation
- [x] Replay: `DataTransfer` + full `dragenter → dragover → drop` sequence on the target's drop
      zone (more resilient than driving hidden file inputs), paced so the platform UI keeps up
- [x] Attachment picker: files from the current conversation are auto-suggested in the fork dialog
- [x] Wire attachments end-to-end: fork with files = context injection + file replay
- [x] Size guard rail: 25 MB cap per file, to stay well inside the IndexedDB quota
- [ ] Per-platform upload limits in selector config; evaluate OPFS if the cap proves too low

### 2.2 Gemini adapter
- [x] Full adapter surface (read/inject/newChat/observe/upload)
- [x] Gemini uses the markdown wrap template (structured headers)
- [x] Fixture tests
- [ ] Verify selectors against live gemini.google.com and fix drift

### 2.3 Mode/model sync (honest version)
- [x] `getModelMode()` per platform — best-effort read of the model picker label
- [x] On fork: source model recorded in the context preamble ("model: GPT-5"). Models are never
      silently auto-switched on the target
- [ ] Model-equivalence map in remote config + a suggestion in the UI (deferred: the honest
      preamble already covers the important half, and an equivalence map goes stale fast)

### 2.4 Resilience & ops
- [x] Remote selector config live (repo-hosted JSON, ETag cached, documented in README/CONTRIBUTING)
- [x] Broken-selector reporting: local-only diagnostics report the user copies into a GitHub issue
      (no auto-telemetry — carries selector state and nothing else)
- [ ] Weekly smoke-test checklist per platform; consider Playwright against saved DOM fixtures
- [ ] Tag v0.2.0

---

## Phase 3 — Smart layer (opt-in API key) + comparison + portable memory

### 3.1 Tier-2 smart translation/summarization (BYO API key)
- [x] Settings: user provides their own Anthropic API key; stored in `chrome.storage.local`,
      clearly explained, never synced
- [x] Summarize-on-fork: long conversation → Haiku (default, switchable to Opus) compresses the
      history into a dense context brief before transfer. Runs in the service worker, which is the
      only context holding the key
- [x] Labeled as "uses your API key, direct browser→API call, no middleman server"; summarization
      failure degrades to a full transfer rather than losing the fork
- [x] Token estimate shown in the fork dialog before transfer
- [ ] Per-request cost estimate in currency (needs a price table that will go stale — decide
      whether it's worth maintaining)
- [ ] Style adaptation: optional rewrite of the continuation prompt for target-platform idioms

### 3.2 Parallel comparison ("same prompt, N platforms")
- [x] Compose once in the side panel → inject into 2–3 platforms (tabs opened in the background,
      the user sends each one — still user-triggered per platform)
- [x] Response capture via `observeMessages()` → side-by-side compare view in the side panel
- [x] Comparison sessions saved locally (newest 20 kept)
- [x] Rate-limit friendliness: tab opens are staggered 800ms apart, never burst

### 3.3 Portable memory / persona
- [x] Persona editor: "who I am, how I want answers" profile (multiple profiles, one active)
- [x] Persona optionally included in fork packages, via a checkbox in the fork dialog
- [ ] Auto-preamble: automatically prepend the active persona to every *new* chat (distinct from
      attaching it to a fork — needs a "this is a fresh conversation" signal per platform)

### 3.4 Universal archive & search
- [x] Passive archiving (opt-in, off by default): `observeMessages()` persists visited
      conversations locally
- [x] Search across platforms in the side panel ("did I discuss this in ChatGPT or Claude?")
- [x] Export: any archived conversation → Markdown / JSON
- [ ] Fork-tree export (lineage is recorded; rendering it as a tree is not built)
- [ ] Search scales by scanning every record — fine for hundreds, needs an index for thousands
- [ ] Tag v0.3.0

---

## Cross-cutting / continuous

- [ ] **Security review before each release:** injection surfaces (we write into host DOM),
      remote config parsing (validate schema, no eval), message-passing origin checks
- [x] **Permissions minimalism:** only `storage`, `sidePanel`, `tabs` + explicit host permissions
      for the 3 platforms; each one justified in a README table
- [ ] **Firefox port evaluation** after v0.2 (MV3 support differences, sidebar API)
- [x] **Docs:** README (architecture, selector-config rationale, permissions table),
      CONTRIBUTING.md (selector-fix guide, adapter guide, ground rules), PRIVACY.md
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

## Implementation status — Phases 0–3 built, architecture hardened (2026-09-10)

`npm run verify` passes: lint (including enforced layer boundaries), strict typecheck,
97 tests at 96% line / 86% branch coverage, and a clean production build. Everything checked above
is implemented in code and covered by tests where it is testable headlessly.

**The one thing that is NOT verified:** selectors have never been run against the live sites. The
adapter fixtures are reconstructions of known DOM shapes, so the tests prove the parsing logic is
correct, not that today's markup matches. Live verification for all three platforms is the top
remaining item — everything else is either polish or deliberately deferred above.

---

## Open questions (answer before the relevant phase)

- [x] Phase 1: Claude artifacts → skip-with-marker (decided in 1.3). ChatGPT canvas still
      open — revisit when its DOM is inspected live.
- [x] Phase 1: fork button placement — per-message hover, implemented as one floating button
      repositioned onto the hovered message (one element to keep alive, nothing added to the
      platform's DOM). Revisit only if hover proves unreliable on touch devices.
- [ ] Phase 2: OPFS vs. IndexedDB threshold for large files; what's the real quota behavior
      per browser?
- [ ] Phase 3: comparison view — side panel is narrow; does compare need its own extension page
      (`chrome-extension://` full tab)?
