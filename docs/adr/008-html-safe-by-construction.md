# 008 — HTML that is safe by construction

**Status:** Accepted

## Context

The views render user-controlled text: conversation content, file names, persona text, archive
titles, comparison answers. The in-page views run inside ChatGPT, Claude and Gemini, pages the
project does not control. In 0.3 every view built markup from template strings and assigned it to
`innerHTML`, and every interpolation had to remember to call `escapeHtml()`.

A security audit before the 0.3.1 release confirmed that every interpolation was escaped or safe.
But that result depended on discipline, and the next view written in a hurry would get no warning.
An XSS in a content script is an XSS on the user's AI account.

## Decision

Markup is built with an `html` tagged template, and it reaches the DOM only through `setHtml()`.

- The tag escapes every interpolated value unless it is already `SafeHtml`. Escaping is the default;
  opting out takes a deliberate call.
- `SafeHtml` can be produced in only two ways: the `html` tag, or `trusted()`, which is for static
  markup written in this codebase, such as a stylesheet constant. Its brand is a module-private
  symbol, so an object that merely looks like SafeHtml is still escaped. A test checks this.
- `setHtml(target, content)` accepts only `SafeHtml`.
- **A lint rule forbids assigning `innerHTML` or `outerHTML`, and calling `insertAdjacentHTML`,
  anywhere except `views/html.ts`.** Because of that rule, every piece of markup has to pass through
  the tag.

Nested templates and arrays compose without double escaping. `false`, `null` and `undefined` render
as nothing, so a conditional like `${cond && html`…`}` reads naturally.

## Consequences

**XSS through a view needs two deliberate acts:** wrapping untrusted data in `trusted()`, or
disabling a lint rule, and both are visible in review. A test renders a hostile
`<img onerror>` payload through every section and asserts that no element is created.

**The views are simpler.** The `escapeHtml(...)` calls, which appeared dozens of times, are gone,
along with `.join('')` on mapped arrays.

**What it costs.** `trusted()` is an escape hatch, and its safety rests on the rule in its doc
comment: never pass it a value that came from a page, a conversation or a user. It is used for
exactly one constant, the shared stylesheet.

## What would change our mind

If the views grew enough state to justify a component framework, one with auto-escaping built in
(Lit, Preact) would replace this module. The lint rule should stay, retargeted at that framework's
equivalent of `innerHTML`.
