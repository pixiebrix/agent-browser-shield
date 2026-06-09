---
status: Current
last_reviewed: 2026-06-09
---

# Rule engine

## Purpose

The runtime that decides which rules apply, where they apply, and how the
extension keeps page mutations in sync with user toggles, availability, and SPA
navigation. The engine is the substrate every defense rule plugs into.

## Problem

Defenses must stay in sync with what the page renders and what the user has
enabled — across every frame, through SPA route changes, and under bursts of DOM
mutations. Without a shared runtime, individual rules duplicate MutationObserver
wiring, leak listeners, drift in how they respond to toggles, and silently
regress on late-mounted content. Each drift is a coverage hole the user can't
see: a rule that fires on first paint but not after a React route change leaves
the second page unprotected with no warning.

## User stories

### Human users

- As a **person who toggles a rule off**, I want previously hidden content to
  reveal and the rule's machinery to stop running, so that disabling actually
  disables.
- As a **person browsing a single-page app**, I want late-mounted content (route
  changes, lazy lists) to be scanned the same way the initial DOM is, so that
  protection doesn't degrade after the first navigation.

### AI agents

- As a **browser-use agent reading the page**, I want a consistent set of rules
  applied across every frame I read, so that defenses don't have an
  iframe-shaped hole.
- As a **browser-use agent acting on placeholders**, I want a stable
  click-to-reveal affordance with rule attribution, so that I can decide whether
  to expose redacted content per case.

## Functional requirements

### Rule shape and catalog

- **FR-1.** Every rule conforms to the `Rule` interface (`id`, `label`,
  `description`, optional `available` / `unavailableReason` / `topFrameOnly`,
  `apply(root)`, optional `teardown()`).
- **FR-2.** The rule catalog (`extension/src/rules/index.ts`) and the
  ID-and-defaults registry (`extension/src/rules/rule-metadata.ts`) are kept in
  sync: each rule ID appears in both exactly once. The `catalog.test.ts`
  invariant suite enforces this and the related field guarantees (`label`
  non-empty, `apply` is a function, `available: false` pairs with
  `unavailableReason`, etc.).
- **FR-3.** Rule IDs follow the `<target>-<verb>` taxonomy with five canonical
  verbs (`annotate`, `hide`, `redact`, `sanitize`, `strip`). `-helper` is
  reserved for non-defensive agent affordances. See
  [ADR-0002](../decisions/0002-rule-id-naming-taxonomy.md).

### Frame coverage

- **FR-4.** The content script runs in **every frame** (`all_frames: true`,
  `match_origin_as_fallback: true`) at `document_idle`. Each frame independently
  applies frame-appropriate rules. See
  [ADR-0003](../decisions/0003-run-rule-engine-in-all-frames.md).
- **FR-5.** Rules with `topFrameOnly: true` are applied only in the top browsing
  context (cookie/newsletter overlays, footer, URL recipes, roach-motel
  landmark). Subframes skip them entirely.
- **FR-6.** The engine no-ops gracefully when `document.body` is missing (some
  `about:blank` / `about:srcdoc` iframes at `document_idle`).

### SPA mutation handling

- **FR-7.** A shared `subtree-watcher` re-scans subtrees on DOM mutations and
  route changes; rules subscribe rather than each running its own
  MutationObserver. The watcher coalesces bursts and immediately flushes beyond
  a configurable burst threshold (currently 512 pending roots). See
  [ADR-0006](../decisions/0006-re-scan-spa-mutations.md).
- **FR-8.** Watchers respect `skipPlaceholderSubtrees` so a rule's own
  placeholder insertions don't drive re-triggering loops.
- **FR-9.** By default, the shared watcher pauses when the tab is hidden
  (`document.visibilityState !== "visible"`). Operators can override this via
  the `runOnInactiveTabs` build-time default (spec 0011) or the options page
  toggle.

### Mutation strategy

- **FR-10.** Strip and sanitize rules **scrub the data carrier** rather than
  detach framework-rendered nodes — they blank attribute values, text node data,
  or comment data while leaving the node attached. This preserves framework
  reconciliation (React 19 metadata, Vue Teleport, Astro view transitions,
  htmx). The single documented exception is `svg-sprite-strip`, which detaches
  hidden sprite containers the page framework does not own. See
  [ADR-0007](../decisions/0007-scrub-instead-of-detach-for-framework-dom.md).
- **FR-11.** For selector-only `removeEntirely` rules, hiding uses a single CSS
  stylesheet (`display: none`) rather than per-element DOM mutation. See
  [ADR-0014](../decisions/0014-css-first-hide-for-selector-only-rules.md).
- **FR-12.** Every `data-abs-*` attribute the engine or any rule writes is
  declared in `extension/src/lib/dom-markers.ts` and imported by name; an ESLint
  rule blocks raw `"data-abs-…"` literals outside the registry. See
  [ADR-0004](../decisions/0004-centralize-dom-markers.md).

### Reconciliation

- **FR-13.** When a rule transitions from disabled to enabled, the engine calls
  `rule.apply(document.body)`. When a rule transitions from enabled to disabled,
  the engine calls `revealAll(ruleId)` to restore originals behind placeholders,
  then `rule.teardown?.()`.
- **FR-14.** Enforcement is a global kill-switch. With enforcement off, the
  effective state is "all rules disabled" and the engine reveals everything
  (per-rule selections are preserved in storage for restore on toggle-on).
- **FR-15.** Rule availability is a separate axis from enabled/disabled. A rule
  reporting `available: false` (or a reactive availability accessor returning
  `{available: false}`) is gated off by the engine even when the user's stored
  toggle is on. The user-facing toggle preference is preserved so the rule
  re-engages the moment availability flips.

### Placeholders

- **FR-16.** Click-to-reveal placeholders share a single stylesheet injected
  once into `document.documentElement` and adopted into every open shadow root
  via `adoptedStyleSheets`. Each placeholder carries `data-abs-rule="<id>"` for
  attribution.
- **FR-17.** Inline placeholders are `<button>` elements; block placeholders use
  a `<div>` container with a `<button class="abs-placeholder__label">` so the
  reveal control is keyboard-and-screen-reader actionable. Both surface in the
  accessibility tree as actionable.
- **FR-18.** Two display modes ship: `inline`/`block` markup, and a per-mode CSS
  toggle (icon-only vs label). The display mode is persisted in `chrome.storage`
  and scoped via the `data-abs-placeholder-mode` attribute.

### Open-shadow-root coverage

- **FR-19.** The engine reaches every **open** shadow root the page builds —
  imperative `attachShadow({mode: "open"})`, declarative shadow DOM at parse
  time (`<template shadowrootmode="open">`), and post-parse
  `Element.setHTMLUnsafe` / `ShadowRoot.setHTMLUnsafe`. Closed shadow roots are
  explicitly out of scope. See
  [ADR-0008](../decisions/0008-shadow-dom-coverage.md) and spec
  [0008](./0008-cross-origin-and-shadow-dom.md).

### Background-worker purity

- **FR-20.** Rule files are forbidden from being pulled into the background
  service-worker bundle (they touch DOM at module scope, which would crash the
  worker). `lib/storage.ts` imports IDs from `rule-metadata.ts` (pure data)
  rather than the catalog. A post-build canary
  (`scripts/check-background-purity.ts`) blocks regressions. See
  [ADR-0013](../decisions/0013-background-worker-purity-canary.md).

## Non-functional requirements

- **NFR-P-1.** Initial application runs once per frame at `document_idle`;
  per-rule cost is bounded by the rule's own DOM walk. SPA re-scans are
  coalesced through the shared watcher (one MutationObserver per observed root,
  fanned out to all subscribers).
- **NFR-O-1.** The engine logs initial application with the enabled rule list,
  per-rule log channels (`createRuleLogger(ruleId)`), and rule enable/disable
  transitions. See spec [0014](./0014-non-functional-requirements.md) for the
  leveled-logging story.
- **NFR-M-1.** Adding a rule requires appending exactly two entries
  (`rules/index.ts` + `rule-metadata.ts`); `catalog.test.ts` fails the build if
  they drift. Rules under `extension/src/rules/` must not import from
  `extension/src/lib/`'s SPA-specific helpers across the documented import
  boundary. See [ADR-0005](../decisions/0005-lib-rules-import-boundary.md).

## Current implementation

- FR-1, FR-2, FR-3: `extension/src/rules/types.ts`,
  `extension/src/rules/index.ts`, `extension/src/rules/rule-metadata.ts`,
  `extension/src/rules/__tests__/catalog.test.ts`.
- FR-4, FR-5, FR-6: `extension/src/manifest.json`, `extension/src/content.ts`,
  `extension/src/lib/rule-engine.ts`, `extension/src/lib/frame.ts`.
- FR-7, FR-8, FR-9: `extension/src/lib/subtree-watcher.ts`,
  `extension/src/lib/run-on-inactive-tabs.ts`.
- FR-10, FR-11: `extension/src/lib/placeholder.ts`,
  `extension/src/lib/selector-hide-rule.ts`,
  `extension/src/lib/css-hide-stylesheet.ts`.
- FR-12: `extension/src/lib/dom-markers.ts`,
  `extension/eslint-rules/no-data-abs-literal.js`, `extension/eslint.config.js`.
- FR-13, FR-14, FR-15: `extension/src/lib/rule-engine.ts`,
  `extension/src/lib/enforcement.ts`, `extension/src/lib/availability.ts`.
- FR-16, FR-17, FR-18: `extension/src/lib/placeholder.ts`,
  `extension/src/lib/placeholder-display.ts`,
  `extension/src/lib/shadow-stylesheets.ts`.
- FR-19: `extension/src/lib/shadow-roots.ts`,
  `extension/src/lib/shadow-root-probe-source.ts`.
- FR-20: `extension/scripts/check-background-purity.ts`,
  `extension/src/rules/rule-metadata.ts`.

## Future work

- Closed shadow root coverage — structurally precluded by the Web Components
  spec; the optional
  [`closed-shadow-root-annotate`](./0008-cross-origin-and-shadow-dom.md) rule is
  the only mitigation. See [ADR-0008](../decisions/0008-shadow-dom-coverage.md).
- Closed declarative shadow DOM detection — neither the page-world
  `attachShadow` probe nor the structural heuristic catches DSD with
  `shadowrootmode="closed"`. Documented in
  [`docs/src/content/docs/rules.md`](../docs/src/content/docs/rules.md) under
  *Flag Closed Shadow Roots*.

## Related

- ADRs: [ADR-0002](../decisions/0002-rule-id-naming-taxonomy.md),
  [ADR-0003](../decisions/0003-run-rule-engine-in-all-frames.md),
  [ADR-0004](../decisions/0004-centralize-dom-markers.md),
  [ADR-0005](../decisions/0005-lib-rules-import-boundary.md),
  [ADR-0006](../decisions/0006-re-scan-spa-mutations.md),
  [ADR-0007](../decisions/0007-scrub-instead-of-detach-for-framework-dom.md),
  [ADR-0008](../decisions/0008-shadow-dom-coverage.md),
  [ADR-0013](../decisions/0013-background-worker-purity-canary.md),
  [ADR-0014](../decisions/0014-css-first-hide-for-selector-only-rules.md).
- Docs: [`docs/src/content/docs/rules.md`](../docs/src/content/docs/rules.md)
  §"Coverage scope".
- Specs: [0008](./0008-cross-origin-and-shadow-dom.md),
  [0010](./0010-extension-ui-and-controls.md),
  [0011](./0011-build-time-customization.md),
  [0014](./0014-non-functional-requirements.md).
