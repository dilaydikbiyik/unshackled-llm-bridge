# unshackled-llm-bridge — progress (handoff)

Updated: 2026-11-28

## Where it stands

- Version 1.2.4 (2026-11-21): summaries on the current Claude models; every feature covered end to end.
- All phases built (`todo.md` → "Implementation status"), including universal site support
  and the generic adapter.
- `e2e/settings.spec.ts` (committed) drives the side panel itself (first-run explainer,
  language switch, API key + model save, adding a custom site as a fork target).
  Verified 2026-11-28: `npm run verify` green; full Playwright suite 27/27 passing.

## Next step

- Nothing pending in the working tree; pick the next item from the owner steps below.
- Optional cleanup: the custom-site test uses `waitForTimeout(1000)` after adding the site;
  could wait on the stored setting instead if it ever turns flaky.

## Owner steps (status as recorded in `todo.md`; confirm)

- Run the end-to-end matrix in `docs/smoke-test.md` with the unpacked extension.
- Store listing submission.
- Unverified on live sites: Claude artifact markup; ChatGPT's model label on a paid plan.

## Deferred, with reason

- Teach-by-pointing fallback: wait until real misreads of the heuristics are seen.
