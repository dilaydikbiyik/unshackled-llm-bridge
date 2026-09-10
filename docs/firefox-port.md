# Firefox port — evaluation

**Decision: deferred.** The architecture ports cleanly; the extension shell does not, and the
work is not justified before the Chrome version has real users.

Browser APIs change; re-check each item below against current MDN compatibility data before
starting the port.

## What ports without changes

The architecture was built so that platform-specific code sits behind interfaces, and the same
holds for browser-specific code:

- `domain/` — pure TypeScript, no browser APIs at all.
- `adapters/` — standard DOM only (`querySelector`, `MutationObserver`, `DataTransfer`,
  `DragEvent`). The synthetic-drop file replay and `isTrusted` capture guard behave the same.
- `data/` — IndexedDB via Dexie, and `fetch`.
- `views/` — plain DOM and shadow roots.

That is most of the code by line count, and all of the tested logic.

## What has to change

| Area | Chrome | Firefox | Work |
|---|---|---|---|
| UI surface | `chrome.sidePanel` + `side_panel` key | No `sidePanel` API; `sidebar_action` instead | New manifest key; the side panel HTML can be reused as the sidebar page |
| Background | MV3 `service_worker` | MV3 uses event-page `background.scripts` | A second manifest; the worker code itself has no DOM dependency, so it runs as a script |
| Namespace | `chrome.*` with promises | `browser.*` (with `chrome.*` compatibility for most calls) | Audit the calls in `controllers/` and `shared/`; add a thin shim if any differ |
| Build | CRXJS (Chrome-oriented) | Needs a Firefox build target | A second manifest config and build script |
| Distribution | Chrome Web Store | addons.mozilla.org, with source review | Separate listing and review |

Every change is confined to `controllers/background`, `shared/messages.ts`, `shared/settings.ts`
and the manifest — the layer boundaries ([ADR 004](adr/004-enforced-layer-boundaries.md)) keep
browser-specific calls out of everything else.

## Why not now

- Two manifests, two builds and two store reviews double the release cost of every selector fix
  that *does* need a code release.
- The remote selector config ([ADR 002](adr/002-selectors-as-remote-config.md)) already serves
  both browsers, so the main maintenance cost would not double — but the shell would.
- Firefox's share among people who use all three of these AI platforms is not known, and the
  project collects no analytics to find out ([ADR 001](adr/001-local-only.md)).

## What would change the decision

Users asking for it, or a contributor willing to own the Firefox build. Start with the table
above; the domain and adapter layers need nothing.
