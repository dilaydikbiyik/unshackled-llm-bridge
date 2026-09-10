# Architecture Decision Records

Short notes on the decisions that shaped this codebase — what was chosen, what was rejected, and
what it costs. They exist so a future maintainer (often the author, months later) can tell a
deliberate choice from an accident, and knows what evidence would justify reversing one.

Each record states the forces, the decision, the consequences including the bad ones, and what
would change our mind.

| # | Decision | Status |
|---|---|---|
| [001](001-local-only.md) | No backend: everything stays in the browser | Accepted |
| [002](002-selectors-as-remote-config.md) | DOM selectors are remote config, not code | Accepted |
| [003](003-adapter-layer.md) | One adapter interface per platform; the core never sees DOM | Accepted |
| [004](004-enforced-layer-boundaries.md) | Layer boundaries enforced by the linter | Accepted |
| [005](005-file-replay-via-drop.md) | Files replay as synthetic drops, not input assignment | Accepted |
| [006](006-user-presses-send.md) | The extension never sends a message | Accepted |
