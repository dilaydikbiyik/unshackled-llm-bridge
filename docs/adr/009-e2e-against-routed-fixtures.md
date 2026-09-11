# 009 — End-to-end tests against routed fixture pages

**Status:** Accepted

## Context

Before 0.4 every part of the extension was tested, but no test ran the extension as a whole. The
content script, the fork dialog, the service worker's hand-off across tabs and injection into the
target's composer had each been checked separately, and nothing checked that they worked together.

The obvious end-to-end test drives the real sites, and it fails on every count. It needs a logged-in
account on each of three platforms, which means storing credentials, and that conflicts with
[ADR 001](001-local-only.md). It would also be flaky, because the sites change their markup
constantly, and it would hit rate limits and possibly the platforms' terms of service in CI.

## Decision

Playwright loads the built `dist/` into real Chromium as an unpacked extension and drives it. The
platform domains (`chatgpt.com`, `claude.ai`, `gemini.google.com`) are routed to local fixture pages
in `e2e/fixtures/`. Those pages copy the live markup exactly as it was verified in the smoke test,
so the browser, the extension and the URLs are all real, and only the page content is a fixture.

The suite covers:

- ChatGPT → Claude: hovering a message shows the fork button, the dialog previews the package in
  Claude's format, and **Transfer** opens Claude with the package in its composer. The fixture's
  send button counts clicks, and the test asserts the count is zero.
- Claude → Gemini: the same flow in the opposite direction, arriving in Gemini's format.
- Health: the side panel shows healthy platforms as healthy, and a new chat is not flagged as
  degraded.

**One limitation shaped the harness.** Playwright cannot intercept the first navigation of a tab
that the extension opens with `chrome.tabs.create`, because that navigation starts before Playwright
attaches to the tab. In the first run of the suite, that load reached the real claude.ai. So the
browser is launched with `--host-resolver-rules=MAP * ~NOTFOUND`, and anything that escapes routing
fails on an error page, where no content script runs. The test then loads the target URL again
through the routes, and the target claims the parked package the way it would on the real site.

## Consequences

**The whole extension runs in CI** on every push, with no login and no network.

**Division of labour.** The fixtures prove that the extension works *given* the markup. The live
probe (`npm run probe`, [docs/smoke-test.md](../smoke-test.md)) proves the markup is still what the
fixtures assume. Neither is enough alone, and together they cover the failure that matters: correct
code facing changed markup.

**What it costs.** The fixtures must follow the live markup. The rule already in CONTRIBUTING, that a
selector change updates its fixture in the same commit, now applies to `e2e/fixtures/` as well.

## What would change our mind

A platform publishing an official API for reading and composing conversations would let an
end-to-end test target that API instead of HTML.
