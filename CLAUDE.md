# unshackled-llm-bridge

Privacy-first, local-only browser extension (MV3, TypeScript, Vite) that forks, syncs and
bridges AI conversations across ChatGPT, Claude, Gemini and any chat site the user adds.

Principles (`todo.md` → "Guiding principles"):
- Local-only: no backend, no telemetry, no conversation data leaves the browser.
- The core never knows a platform; only adapters (`src/adapters/`) touch site DOM.
- Selectors are config, not code. User-triggered actions only — never send in the background.
- English code and commits; Turkish-first UI copy with i18n (`tr`, `en`).

## Sessions

- **Start by reading `docs/PROGRESS.md`.**
- `todo.md` is the plan and log (~25 KB). `grep -n` the section you need rather than reading it whole.
- When the user wraps up, rewrite `docs/PROGRESS.md` (state, next step, decisions and why,
  open items), under ~60 lines.

## Session habits (do these without being asked)

- **PROGRESS.md is overwritten, never appended:** rewrite it from scratch each time, ≤60 lines
  (state, next step, open decisions). Move finished items and history to a dated
  "Session log — YYYY-MM-DD" section at the end of `todo.md`.
- **Session start:** read `docs/PROGRESS.md` before the first task and say in one line where we left off.
- **Before proposing or making a commit:** update `docs/PROGRESS.md` first and include it in the commit.
- **When a task is finished:** update `docs/PROGRESS.md`, then remind the user:
  "Done — PROGRESS.md updated. Run `/clear` before the next task."
- **When the session has grown long** (many files read, many turns, a long debugging loop),
  remind the user: "Check `/context`; past 100K, run `/compact`." You cannot see the context
  size yourself, so judge by how much has happened.

## Commands

```
npm run verify     # lint (incl. layer boundaries) + typecheck + coverage + build — run before calling work done
npm test           # vitest
npm run build
npx playwright test   # e2e
```

## Rules

- Plain English. The first time a technical or architectural term comes up (e.g. hook, middleware,
  migration, estimand), add a short plain-language gloss in parentheses.
- Reply in English, concisely; switch to Turkish when the user asks.
- Commit or push only when the user explicitly asks. No `Co-Authored-By` or AI-attribution lines.
- Releases: bump `package.json`, add a `CHANGELOG.md` entry (Keep a Changelog, semver).

## Layout

`src/{adapters,controllers,data,domain,shared,views}` · `docs/adr/` · `docs/smoke-test.md` ·
`docs/store-listing.md` · `PRIVACY.md` · `e2e/`
