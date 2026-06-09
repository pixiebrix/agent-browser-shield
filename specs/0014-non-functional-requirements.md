---
status: Current
last_reviewed: 2026-06-09
---

# Non-functional requirements

## Purpose

Cross-cutting quality bars that apply across the system. Capability-specific
NFRs live in their own specs; this one names the standing requirements every
spec inherits unless explicitly weakened.

This spec has no user stories — non-functional bars are not user-facing
behavior. They constrain how every functional requirement must be met.

## Performance

- **NFR-P-1. Initial application is bounded by `document_idle`.** The content
  script runs once at `document_idle` per frame. Per-rule cost must fit within
  the budget of one event-loop turn for a typical page (~1k DOM elements). Rules
  that walk the entire document use the yielding text-walk helper
  (`extension/src/lib/yielding-text-walk.ts`) to avoid blocking the main thread.
- **NFR-P-2. SPA re-scans use the shared subtree watcher.** Rules must not run
  their own MutationObserver against `document.body`. The shared watcher
  coalesces a burst of additions into a single throttled callback and
  immediately flushes beyond a documented burst threshold (currently 512 pending
  roots). See [ADR-0006](../decisions/0006-re-scan-spa-mutations.md).
- **NFR-P-3. Selector-only hides are CSS-first.** Rules whose only action is
  "hide elements matching a selector list" install a single `display:none`
  stylesheet rather than walking the DOM. See
  [ADR-0014](../decisions/0014-css-first-hide-for-selector-only-rules.md).
- **NFR-P-4. Hidden tabs do no work by default.** The shared watcher pauses
  while the tab is hidden. Operators can override via `runOnInactiveTabs` (spec
  [0011](./0011-build-time-customization.md), FR-3).
- **NFR-P-5. Debug trace is zero-cost when off.** Trace emission paths are gated
  on `debugTraceStorage` before any `outerHTML` serialization runs.

## Security and trust

- **NFR-S-1. Strip carrier, don't detach framework-owned nodes.** Strip and
  sanitize rules blank the data carrier (attribute value, text node, comment
  data) rather than detach the node. Detaching framework-rendered DOM (React,
  Vue, Svelte, Astro, htmx) breaks reconciliation on route change. See
  [ADR-0007](../decisions/0007-scrub-instead-of-detach-for-framework-dom.md).
  Documented exception: `svg-sprite-strip` detaches sprite containers, which are
  not framework-owned.
- **NFR-S-2. Remove over annotate for adversarial content.** Defenses against
  prompt injection and cross-origin trickery strip the content; they do not just
  label it as suspicious. Annotate is reserved for capability signals (closed
  shadow roots, webdriver-probe reads, link spoofs) where the page itself is the
  artifact under inspection.
- **NFR-S-3. No prompt-injection phrasing in plaintext source.** Injection
  patterns are base64-encoded in `extension/data/injection-patterns.yaml` and
  decoded at build time into the generated file. User-facing docs and marketing
  keep example phrasings abstract. See
  [ADR-0011](../decisions/0011-build-time-decoded-injection-patterns.md).
- **NFR-S-4. No obfuscated code in shipped bundles.** Build-time decoding emits
  plaintext sources; the runtime contains no `atob` of obfuscated strings.
  Chrome Web Store review treats runtime-decoded strings as obfuscated code.
- **NFR-S-5. Centralized DOM markers.** Every `data-abs-*` attribute the engine
  or any rule writes is declared in `extension/src/lib/dom-markers.ts`. An
  ESLint `no-restricted-syntax` rule blocks raw `"data-abs-…"` literals outside
  the registry. See [ADR-0004](../decisions/0004-centralize-dom-markers.md).
- **NFR-S-6. Background-worker purity.** Rule files are excluded from the
  background service-worker bundle (they touch DOM at module scope, which would
  crash the worker). A post-build canary
  (`extension/scripts/check-background-purity.ts`) enforces this. See
  [ADR-0013](../decisions/0013-background-worker-purity-canary.md).
- **NFR-S-7. Zero telemetry by default.** The extension does not collect, store,
  or send any telemetry, analytics, or usage data. The optional
  `irrelevant-sections-redact` rule is the only outbound call; off by default
  and gated on a user-supplied API key. See
  [ADR-0010](../decisions/0010-no-telemetry.md) and spec
  [0013](./0013-privacy-and-egress.md).
- **NFR-S-8. Extension presence is observable.** A sophisticated site can
  fingerprint the rendered artifacts (placeholders, landmarks, chips,
  neutralized labels) and serve a different DOM under that fingerprint.
  Counter-cloaking from a content script is structurally out of scope.

## Observability

- **NFR-O-1. Leveled logging.** The rule engine and per-rule logs use
  `extension/src/lib/log.ts` with leveled channels (`createRuleLogger(ruleId)`).
  Production builds log INFO and above by default.
- **NFR-O-2. Per-frame rule footprint counts.** Each content script reports its
  own frame's tally per rule ID; the background worker aggregates and surfaces
  the totals via the toolbar badge and the popup's per-rule activity list. Spec
  [0010](./0010-extension-ui-and-controls.md) FR-1, FR-7.
- **NFR-O-3. Debug-trace JSONL export.** The schema lives at
  [`extension/data/debug-trace.schema.json`](../extension/data/debug-trace.schema.json)
  and is the wire contract for the popup *Export* button and the
  `window.__abs_dumpTrace` CDP bridge. Spec [0012](./0012-debug-trace.md).

## Usability

- **NFR-U-1. Reveal preserves agency.** Every placeholder is a `<button>` so
  screen readers and accessibility-tree consumers see it as actionable. Clicking
  restores the original carrier and stamps `data-abs-revealed="<rule-id>"` so
  subtree watchers don't immediately re-hide. Spec
  [0002](./0002-rule-engine.md), FR-16, FR-17.
- **NFR-U-2. Visible chips for human-targeted asymmetries.**
  `link-spoof-annotate` and `trust-badge-annotate` render visible chips because
  the threat model includes the sighted human acting on rendered glyphs. Spec
  [0007](./0007-visual-identity-and-trust.md).
- **NFR-U-3. Screen-reader-only landmarks for agent-targeted asymmetries.**
  `roach-motel-annotate`, `webdriver-probe-annotate`,
  `closed-shadow-root-annotate`, and `search-url-helper` surface in the
  accessibility tree without affecting the rendered layout. Spec
  [0005](./0005-dark-pattern-defense.md),
  [0008](./0008-cross-origin-and-shadow-dom.md),
  [0009](./0009-agent-shortcuts.md).
- **NFR-U-4. Per-rule preferences survive enforcement-off.** The master
  enforcement kill-switch pauses every rule without losing per-rule selections.
  Spec [0010](./0010-extension-ui-and-controls.md), FR-5.

## Maintainability

- **NFR-M-1. `lib/` ↔ `rules/` import boundary.** Files under
  `extension/src/rules/` may import from `extension/src/lib/`, but `lib/` files
  may not import from `rules/`. Enforced by ESLint. See
  [ADR-0005](../decisions/0005-lib-rules-import-boundary.md).
- **NFR-M-2. Rule defaults are hand-edited in one file.** Adding a rule is one
  entry in `extension/src/rules/rule-metadata.ts` and one in
  `extension/src/rules/index.ts`. The
  `extension/src/rules/__tests__/catalog.test.ts` invariant suite catches drift.
  See [ADR-0009](../decisions/0009-rule-defaults-and-build-time-overrides.md).
- **NFR-M-3. Site data lives in YAML, not inline.** Per-host selectors and URL
  recipes live in `extension/data/sites/*.yaml`, validated against the zod
  schema at `extension/data/site-rules.schema.ts`, and emitted into
  `extension/src/rules/site-data.generated.ts`. The generated file is committed;
  rules import the TS.
- **NFR-M-4. Property tests for new rule matchers.** New rules ship with a
  `.property.test.ts` alongside the example test, using `fast-check`. Already a
  dep; pattern visible in `extension/src/rules/__tests__/*.property.test.ts`.
- **NFR-M-5. Docs reflect current behavior only.** User-facing docs describe
  shipped rules and behavior; planned rules, roadmap items, and aspirational
  behavior live in issues — not in `docs/src/content/docs/`. (Specs explicitly
  do call out future work in a dedicated section, with each item tied to an
  issue or ADR.)
- **NFR-M-6. Skills stay in lockstep with capabilities.** When a rule is added,
  removed, or renamed, update `skills/agent-browser-shield-config/SKILL.md`.
  When DOM markers or required agent behavior change, also update
  `skills/agent-browser-shield/SKILL.md`. When trace bundle layout changes,
  update `skills/agent-browser-shield-diagnose/SKILL.md`. When the site-rule
  schema or Playwright MCP setup changes, update
  `skills/agent-browser-shield-site-rules/SKILL.md`. When build-time inputs in
  `extension/build.ts` change, update
  `skills/agent-browser-shield-install/SKILL.md` and
  `docs/src/content/docs/install.md`. See [`AGENTS.md`](../AGENTS.md) §"Skills".

## Toolchain

- **NFR-T-1. Pre-push parity with CI.** `bun run check` in `extension/` runs
  Biome + ESLint; this matches what CI runs. (The `lint` alias skips the Biome
  formatter and does **not** match CI; prefer `check`.)
- **NFR-T-2. Markdown preflight.** `pre-commit run` runs `mdformat` with the
  wrap width and table padding the CI Pre-commit hooks job expects.
  `bun run check` does not cover markdown.
- **NFR-T-3. Biome + ESLint split.** Biome owns formatting plus its recommended
  rule set; ESLint runs only rules Biome doesn't have. The split is mechanical —
  rules are never duplicated between them. Custom project-specific rules live in
  `extension/eslint-rules/*.js`. See
  [ADR-0012](../decisions/0012-biome-plus-eslint-split.md).
- **NFR-T-4. CalVer release via `workflow_dispatch`.** Releases follow CalVer
  and are cut from a GitHub Actions `workflow_dispatch` job. See
  [ADR-0015](../decisions/0015-calver-workflow-driven-release.md).

## Future work

- A budget-style CI check that flags PRs whose bundled extension size grew
  beyond a threshold — not implemented today; the EasyList snapshot is the
  largest contributor and is gated only by manual refresh cadence.
- A canary for `chrome.storage` schema migrations — today, the `normalize`
  function in `extension/src/lib/storage.ts` silently drops unknown keys. An
  additive-only invariant is not enforced.

## Related

- ADRs: every accepted ADR backs at least one NFR here; see the inline
  citations.
- Docs: [`AGENTS.md`](../AGENTS.md), [`CONTRIBUTING.md`](../CONTRIBUTING.md).
- Specs: every other spec inherits the bars in this file unless it explicitly
  weakens one.
