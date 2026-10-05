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
- [x] Name: **Unshackled LLM Bridge** — used in the manifest and in docs/store-listing.md
- [x] Designed fork-glyph icon set (16/32/48/128) replaced the placeholder in 0.3.0

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
- [x] Verified live, logged in (2026-09-10). Found the most serious drift of the three: turns
      moved from `<article>` to `<section>`, so the extension read **zero messages** and would
      have forked an empty conversation. Fixed, and the answer node moved from a hard-coded
      `.markdown` in code into config as `assistantContent`. Composer, new-chat and drop zone
      matched. Send button unverified (renders only after typing); model label absent on the
      free-plan layout and deliberately not matched via its translated aria-label

### 1.3 Claude adapter
- [x] Same surface as 1.2 for claude.ai
- [x] Artifacts: DECIDED — inline preview cells are replaced with an explicit
      `[artifact from Claude — not transferred]` marker (never dropped silently);
      live DOM is cloned, not mutated
- [x] Fixture tests
- [x] Verified live (2026-09-10). Found and fixed real drift: assistant turns moved from
      `div.font-claude-message` to `.font-claude-response`, and the extension was silently
      dropping every Claude reply. Composer, send, model, new-chat and drop zone all matched.
      Artifact markup still unverified (no artifact in the checked chat)

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
- [x] Manual test matrix written as a repeatable checklist: docs/smoke-test.md
- [ ] **Run** that end-to-end matrix with the unpacked extension loaded — owner's step, since
      loading an unpacked extension cannot be automated from outside the browser
- [x] Store listing copy, permission justifications and data disclosures: docs/store-listing.md
- [ ] Submit to the Chrome Web Store — owner's step (developer account, screenshots)
- [x] Tagged v0.1.0

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
- [x] `[image]` markers and replay: resolved by design. Images uploaded while the extension is
      installed are captured and pre-selected in the fork dialog, so the file travels; the marker
      covers images uploaded before install, which cannot be recovered from the page

### 2.2 Gemini adapter
- [x] Full adapter surface (read/inject/newChat/observe/upload)
- [x] Gemini uses the markdown wrap template (structured headers)
- [x] Fixture tests
- [x] Verified live (2026-09-10). Messages, composer and drop zone matched. Model picker and
      new-chat kept their `data-test-id` but changed element type, so tag-qualified selectors
      broke; both are now tag-agnostic. Send button unverified (only renders after typing)
- [x] Health check catches partial matches: two or more turns on one side and none on the other
      is reported as `messageContainer (no assistant turns)` — the shape that hid the Claude bug

### 2.3 Mode/model sync (honest version)
- [x] `getModelMode()` per platform — best-effort read of the model picker label
- [x] On fork: source model recorded in the context preamble ("model: GPT-5"). Models are never
      silently auto-switched on the target

### 2.4 Resilience & ops
- [x] Remote selector config live (repo-hosted JSON, ETag cached, documented in README/CONTRIBUTING)
- [x] Broken-selector reporting: local-only diagnostics report the user copies into a GitHub issue
      (no auto-telemetry — carries selector state and nothing else)
- [x] Weekly smoke test: docs/smoke-test.md plus `npm run probe`, a DevTools snippet with the
      config embedded that reports broken targets and half-matching message selectors. Live
      Playwright rejected: it would need stored credentials, contradicting ADR 001
- [x] Tagged v0.2.0

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

### 3.2 Parallel comparison ("same prompt, N platforms")
- [x] Compose once in the side panel → inject into 2–3 platforms (tabs opened in the background,
      the user sends each one — still user-triggered per platform)
- [x] Response capture via `observeMessages()` → side-by-side compare view in the side panel
- [x] Comparison sessions saved locally (newest 20 kept)
- [x] Rate-limit friendliness: tab opens are staggered 800ms apart, never burst

### 3.3 Portable memory / persona
- [x] Persona editor: "who I am, how I want answers" profile (multiple profiles, one active)
- [x] Persona optionally included in fork packages, via a checkbox in the fork dialog

### 3.4 Universal archive & search
- [x] Passive archiving (opt-in, off by default): `observeMessages()` persists visited
      conversations locally
- [x] Search across platforms in the side panel ("did I discuss this in ChatGPT or Claude?")
- [x] Export: any archived conversation → Markdown / JSON
- [x] Fork lineage in the Markdown export: a `## Forks` section lists where and after which
      message a conversation was forked
- [x] Tagged v0.3.0 (and v0.3.1 for the live-check fixes)

---

## Cross-cutting / continuous

- [x] **Security review for 0.3.1** (repeat before each release). HTML sinks audited: every
      interpolation is escaped or a constant/boolean/UUID. A malformed remote selector no longer
      crashes the content script — invalid candidates are skipped — and the config is validated per
      leaf. Runtime messages are accepted only from this extension's own id. The attachment size cap
      is enforced where files are captured and again where they are stored
- [x] **Permissions minimalism:** only `storage`, `sidePanel`, `tabs` + explicit host permissions
      for the 3 platforms; each one justified in a README table
- [x] **Firefox port evaluated:** docs/firefox-port.md — ports cleanly below the shell; deferred
- [x] **Docs:** README (architecture, selector-config rationale, permissions table),
      CONTRIBUTING.md (selector-fix guide, adapter guide, ground rules), PRIVACY.md
- [x] **Store review buffer** holds, with one lesson: the ChatGPT fix needed a code change because
      the adapter had hard-coded `.markdown`. That was itself a breach of this rule, now repaired by
      moving it into config as `assistantContent`. Re-check at every review

---

## Phase 4 — Architecture hardening (0.4.0)

Done in response to a critical review of 0.3.1, which scored the architecture 7.5/10.

- [x] The built extension runs as a whole in CI: a Playwright suite loads `dist/` into Chromium and
      drives full forks against fixture copies of the sites (ADR 009)
- [x] Typed message contract: responses follow from message types, and handlers are exhaustive
      (ADR 007)
- [x] Service worker split into a handler map with injected ports, replacing the `switch`
- [x] `chrome.*` behind ports; coverage exclusions reduced to type-only files and wiring entry
      points, so the figure now describes the whole codebase
- [x] HTML safe by construction: an escaping `html` tag, and a lint rule against `innerHTML`
      (ADR 008)
- [x] Fixed on the way: handler failures posing as successful responses, and stacked side-panel
      listeners

---

## Deferred — decided, with the reason

Not forgotten: each of these was considered and postponed on purpose. The reason is the thing to
re-check before picking one up.

- **Wrap templates in remote config.** Templates are structure, not selectors; a change to them is
  not urgent the way a broken selector is, so the store-review argument of ADR 002 does not apply.
- **Per-platform upload limits.** The 25 MB capture cap is at or below every per-file upload limit
  known for the three platforms, so a per-platform table would change nothing today.
- **Model-equivalence map.** The transfer preamble already states the source model honestly; a map
  of "equivalent" models across vendors goes stale with every release.
- **Cost estimate in currency.** Needs a price table that goes stale; the token estimate shown
  before transfer is the durable half.
- **Style adaptation of the continuation prompt.** Rewriting the user's words for another
  platform's idioms risks changing their meaning; structural wrapping carries most of the value.
- **Auto-inserting the persona into every new chat.** Filling a composer the user did not ask to
  fill conflicts with ADR 006. The persona is attached per fork, by an explicit checkbox.
- **Archive search index.** A full scan is fine for hundreds of conversations; add an index when
  someone has thousands.

---

## Explicitly out of scope (decided, don't revisit without reason)

- ❌ Any hosted backend / account system / sync server — breaks the local-only promise
- ❌ Auto-sending messages without a user click per message
- ❌ Scraping/archiving conversations the user hasn't opted into
- ❌ Tier-3 server-side translation service
- ❌ CAPTCHA/bot-detection workarounds of any kind — if a platform blocks an action, we surface
  it to the user and fall back to clipboard

---

## Implementation status — complete (2026-09-11, v0.4.0)

Every phase is built, and every item above is done, deferred with a reason, or waiting on a step
only the owner can take. `npm run verify` passes: lint including enforced layer boundaries, strict
typecheck, the full test suite above the coverage thresholds, and a clean production build. All
three platforms have been checked live and their drift fixed.

Owner's steps remaining: run the end-to-end matrix in docs/smoke-test.md with the unpacked
extension, and submit the store listing. Still unverified on the live sites: Claude artifact markup
(none of the 60 most recent conversations contains one, and producing one means sending a message)
and ChatGPT's model label on a paid plan.

### Live check log

- **2026-09-10** — first live check. Drift on all three platforms; see the 0.3.1 changelog.
- **2026-09-11** — send buttons verified on all three platforms by typing one character into a new
  chat's composer and counting matches. Gemini's had drifted; fixed in config v6.
- **2026-10-05** — first real fork, by the owner. Two defects that only live use could surface:
  Gemini turns arrived twice because of a screen-reader duplicate inside the turn, and a fork from
  the opening message carried one message, since scope was always "up to here". The second was a
  design error, not a bug: the default was the rare case. Whole-conversation is now the default.
- **2026-10-05** — first real install of the unpacked extension, by the owner. The side panel came
  up, Gemini reported **ready**, and the two platforms without an open tab were reported as such
  rather than as broken. One cosmetic defect surfaced that no fixture could have caught: the
  onboarding steps were numbered twice.
- **2026-10-05** — full probe re-run on a real conversation on each platform: every required target
  resolves, both sides of the conversation match, no broken selector. One drift found and absorbed
  by the fallback chain: ChatGPT's CSS-module response root is gone and the answer now sits in
  `<hash>_content markdown prose …`, so `assistantContent` resolves through its third candidate,
  `.markdown`. No selector change was needed; the fixtures were updated to today's markup, because
  a test passing against stale markup proves nothing.

---

## Open questions (answer before the relevant phase)

- [x] Phase 1: Claude artifacts → skip-with-marker (decided in 1.3). ChatGPT canvas still
      open — revisit when its DOM is inspected live.
- [x] Phase 1: fork button placement — per-message hover, implemented as one floating button
      repositioned onto the hovered message (one element to keep alive, nothing added to the
      platform's DOM). Revisit only if hover proves unreliable on touch devices.
- [x] Phase 2: storage — IndexedDB with a 25 MB per-file cap. OPFS only becomes worth it if that
      cap is raised, and nobody has asked
- [x] Phase 3: comparison stays in the side panel, with answers truncated and scrollable. A
      full-tab view is worth building only if users find it cramped
