# Contributing

The highest-value contribution to this project is usually **a selector fix**. Read that section
first.

## Fixing a broken selector

When a platform ships a UI change, the extension's side panel starts reporting a degraded platform
and names the selector targets that stopped resolving. Fixing it does not require understanding the
rest of the codebase.

Start with `npm run -s probe | pbcopy`, paste it into the platform's DevTools console on an
existing conversation, and read the table: it names every broken target and warns when a message
selector matches only one side of the conversation. See [docs/smoke-test.md](docs/smoke-test.md).

1. Open the platform, find the element, and get a selector for it. Prefer stable attributes in this
   order: `data-testid` → semantic tag or custom element → structural class → `aria-label`. Avoid
   build-output class names (`css-1x2y3z`) — they change on every deploy.
   - Keep test-id selectors **tag-agnostic** (`[data-test-id='x']`, not `div[data-test-id='x']`).
     Platforms swap the element type while keeping the id; Gemini did exactly that.
   - For CSS-module classes shaped `<hash>_SemanticName`, match the stable half:
     `[class*='_SemanticName']`. Check the name is not a trap — ChatGPT's `not-markdown` would
     satisfy a careless `[class*='markdown']`.
   - `aria-label` is last because it is translated: a Turkish UI says `Model değiştir`, so a
     label selector silently works in one locale and fails in every other.
   - Never combine two kinds of node in one rule (`user, assistant`). If one half breaks the rule
     still matches the other half, reports healthy, and blocks the fallback candidates.
2. Add it to `config/selectors.json` **as a new first entry**, keeping the existing candidates after
   it. Selector lists are tried in order, so an added entry fixes the new markup without breaking
   users still on the old one.
3. Bump the config's `version`. A remote config with a lower version than the bundled one is
   ignored, so a missed bump means your fix silently doesn't apply.
4. Update the matching fixture in the adapter's test file to reflect the new markup, and run
   `npm test`.

**Update the selector and the fixture in the same commit.** A test passing against a stale fixture
tells you nothing about the live site — that's the failure mode this rule exists to prevent.

## Writing an adapter for a new platform

Adding a platform touches three places and nothing else:

1. `src/adapters/<platform>/adapter.ts` — extend `BaseAdapter`, override `readConversation()`, and
   declare capability flags honestly (the UI degrades gracefully on `false`; it breaks on a
   dishonest `true`).
2. `src/adapters/registry.ts` — one `case` in the factory.
3. `config/selectors.json` — a selector block, plus the platform in `src/domain/platforms.ts`.

Everything in `domain/`, `data/` and `views/` speaks only the normalized `BridgeConversation` format and must
not need changes. If you find yourself editing core code to add a platform, the adapter interface is
wrong — say so in the PR and we'll fix the interface rather than special-case the platform.

## Ground rules

These come from the project's guiding principles. A PR that breaks one will not be merged, however
good the feature is.

- **Local-only.** No backend, no telemetry, no analytics, no account system. If a feature seems to
  need a server, it needs a different design.
- **User-triggered only.** Never send a message, upload a file, or fire a request on the
  extension's own initiative. Every action is a direct response to a click.
- **Never lose the user's content silently.** If injection can fail, there is a clipboard fallback.
  If content can't be carried across, it is marked in the output, not dropped.
- **The core never knows a platform.** Only adapters touch platform DOM.
- **Minimal permissions.** A new manifest permission must come with a justification row in the
  README's permissions table.

## Working on the code

```bash
npm install
npm run dev        # Vite dev server with HMR
npm test           # unit + DOM fixture tests
npm run typecheck
npm run lint
npm run build      # load dist/ as an unpacked extension
```

Conventions: English for code, comments, and commit messages; Turkish-first UI copy with an English
translation in `src/shared/i18n.ts` (both must be added together). TypeScript is strict — new code
should not need `any` or non-null assertions on values that could genuinely be missing.

## Adding a message or a view

- **A new message** is one entry in `MessageContract` (`src/shared/messages.ts`), pairing the request
  with its response. The compiler then points at the handler the service worker must add, and
  callers get the response type for free.
- **A new view** builds markup with the `html` tag from `@views/html` and inserts it with `setHtml()`.
  Assigning `innerHTML` fails lint. Never pass page, conversation or user data to `trusted()`.
- **New code that touches the browser** takes the capability as a parameter (see `BackgroundDeps` and
  `KeyValueStore`), so it can be tested without one. Only the entry files wire in `chrome.*`.

## Reporting a bug

Include the diagnostics report from the side panel (`Copy diagnostics report`). It carries the
extension version, your user agent, and which selectors are failing, and contains no conversation
content — check it before pasting if you like.
