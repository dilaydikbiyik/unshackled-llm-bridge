# Smoke test

Run this weekly, and whenever a platform ships a visible UI change. It takes about ten minutes and
is how selector drift gets caught before users hit it. The first run of it (2026-09-10) found real
drift on all three platforms — including ChatGPT reading zero messages and Claude dropping every
reply — none of which the unit tests could see, because the fixtures mirrored old markup.

## 1. Selector probe (no extension needed)

```bash
npm run -s probe | pbcopy
```

On each platform, logged in, **on an existing conversation** with a few turns:
open DevTools → Console → paste → Enter.

| Result | Meaning | Action |
|---|---|---|
| Every row `ok`, shape `ok` | Healthy | Nothing |
| `absent (situational)` | Expected: a send button renders only after typing, a model picker is hidden on some plans, an artifact exists only in chats that made one | Nothing |
| Any other row `BROKEN` | A target stopped matching | Fix per CONTRIBUTING → *Fixing a broken selector* |
| `SHAPE BROKEN` | A message selector matches one side of the conversation only | Treat as broken even if every row says `ok` |
| A count of `INVALID` | A candidate is not a valid CSS selector | Remove or fix it |

The probe prints match counts only — never message text — so its output is safe to paste into an
issue.

**Checking the situational targets.** A send button renders only once the composer has text. To
check it, open a *new* chat, type a single character (do not press Enter), run the probe, then
delete the character. `sendButton` should read `ok`. Artifacts can only be checked in a
conversation that already contains one.

## 2. End-to-end, with the extension loaded

`npm run build`, then `chrome://extensions` → Developer mode → **Load unpacked** → `dist/`.

For each **source → target** pair (6 pairs across three platforms), on a conversation that
includes at least one code block:

- [ ] The side panel shows the source platform as **ready**.
- [ ] Hovering a message shows `⑂ Fork`; the dialog opens next to it.
- [ ] The preview contains user **and** assistant turns, in order, with code fenced.
- [ ] **Transfer** opens the target in a new tab and fills its composer. **Nothing is sent.**
- [ ] **Copy to clipboard** yields the same package.

Edge cases, once per release:

- [ ] Empty new chat — the fork affordance has nothing to attach to; no errors.
- [ ] Mid-generation — fork while an answer is streaming; the partial answer is included, not lost.
- [ ] Logged-out target — injection fails and the clipboard toast appears with the package.
- [ ] A long conversation (40+ turns) — the length warning appears; **trimmed** marks the elision.
- [ ] An uploaded file — it is pre-checked in the fork dialog and arrives on the target.
- [ ] An image-only message — it appears as `[image]` in the preview.
- [ ] With an API key set — **summarized** returns a brief; with a wrong key, it falls back to a
      full transfer and says so.

## Not covered here

Automating part 2 with Playwright against the live sites is deliberately not done: it would need
stored credentials for three accounts, which contradicts the project's local-only design
([ADR 001](adr/001-local-only.md)). Part 1 is the automatable half, and it needs no login.
