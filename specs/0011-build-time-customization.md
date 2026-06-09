---
status: Current
last_reviewed: 2026-06-09
---

# Build-time customization

## Purpose

Let operators ship a build with a custom default rule set — and a small set of
non-rule build-time toggles — without forking the repo or flipping toggles in
the Options UI on every fresh session. Targets infra deployments (CDP,
Browserbase, agent runtimes) where storage starts empty each session.

## Problem

Downstream embedders — PixieBrix, agent harness operators, CDP/Browserbase users
— need different defaults than a human installer. Short-lived browser sessions
start with empty storage every time, so any rule a harness wants on by default
reverts to the ship state on every boot. Without build-time override hooks,
every embedder forks the repo to flip defaults, or runs a brittle "set storage
at startup" script before each session — and both strategies drift on every
shield release.

## User stories

### Human users

- As a **person running an agent in a short-lived browser instance**, I want the
  shield to start configured the way my workflow needs, so that every session
  doesn't reproduce the same setup clicks.
- As a **person who already tuned the Options page**, I want a rebuild to
  preserve my existing toggles, so that an infra default override doesn't blow
  away the configuration I chose.

### AI agents

- As a **CDP harness operator**, I want `debugTrace: true` and any other
  baseline I care about to be the build default, so that the recorder is on
  every session without a human flipping the popup toggle.

## Functional requirements

- **FR-1.** `extension/build.ts` accepts a `--defaults <path>` CLI flag, or
  `EXTENSION_DEFAULTS_FILE=<path>` environment variable, pointing at a JSON file
  in the same shape as the Options-page export. Validated overrides are injected
  into the bundle via the `process.env.EXTENSION_DEFAULT_OVERRIDES` define
  substitution.
- **FR-2.** The override file is a **flat JSON object**. Keys are either:
  - a registered rule ID mapped to a boolean (same shape as the Options-page
    export),
  - a registered rule ID mapped to an ESLint-style object
    `{ "enabled"?: boolean, ...subRuleOptions }` for rules whose behaviour is
    governed by sub-rule options (FR-2a), or
  - one of the reserved non-rule keys (FR-3).
- **FR-2a.** Rules listed in `extension/src/rules/rule-metadata.ts`'s
  `RULE_OPTION_DEFAULTS` may take an object value. `enabled` is optional and
  projects back onto the flat boolean storage shape (Options-page export stays
  flat-boolean). Sub-rule values are either a boolean (sub-rule on/off,
  equivalent to `{ "enabled": <boolean> }`) or an object whose fields match the
  sub-rule's declared shape — `enabled?: boolean` plus any number of
  finite-number tuning thresholds. Leaf types in the override file must match
  the leaf type declared in `RULE_OPTION_DEFAULTS` at the same position (boolean
  → boolean, number → finite number). Partial sub-rule objects merge over the
  committed defaults so omitted fields keep their defaults. Object values for
  rules without declared options fail the build (FR-4).
- **FR-3.** Reserved non-rule keys:
  - `optionsButton` (boolean, default **off**) — start with the floating on-page
    options button enabled.
  - `runOnInactiveTabs` (boolean, default **off**) — start with the shared
    subtree-watcher observing while the tab is hidden.
  - `debugTrace` (boolean, default **off**) — start with the dev-mode
    debug-trace recorder enabled, so the popup's Export button and the
    `window.__abs_dumpTrace` bridge are available without a human flipping the
    toggle.
  - `placeholderAdaptivePalette` (boolean, default **off**, **experimental**) —
    start with the per-placeholder ancestor-background sampling on, so
    redactions on dark-themed pages render with a dark stripe palette instead of
    the light default. Default off while the visual heuristic is still being
    tuned; the same toggle is exposed in the Options page under *Placeholder
    display* (spec [0010](./0010-extension-ui-and-controls.md) FR-10).
  - `siteDenylist` (`string[]`, default `[]`) — start with these URL Pattern
    strings already in the per-site enforcement denylist (spec 0010 FR-7a /
    FR-15, [ADR-0018](../decisions/0018-per-site-enforcement-denylist.md)). Each
    entry must parse via `new URLPattern(entry)` — invalid entries fail the
    build under FR-4. The same key round-trips through the Options-page export /
    apply (spec 0010 FR-10b) so a tuned extension's exported JSON can be fed
    straight back into the next build.
- **FR-4.** Unknown keys (neither a registered rule ID nor a reserved key),
  unknown sub-rule or sub-field keys under a rule object, object values for
  rules without declared options, leaf values whose type does not match the
  declared default (boolean → non-boolean, number → non-finite or non-number),
  and reserved-key values that fail their declared shape — `siteDenylist` not
  being an array of strings each of which parses via `new URLPattern(entry)` —
  fail the build with a message naming the offending paths. The validator does
  not range-check numeric thresholds (FR-2a) — operators tuning thresholds are
  reading the rule source by definition.
- **FR-5.** The override file may be partial; rules not listed keep the
  committed default from `extension/src/rules/rule-metadata.ts`.
- **FR-6.** Build-time overrides only affect **fresh** `chrome.storage`. Users
  who already toggled rules in the Options UI keep their preferences on rebuild.
  Implementation: defaults are merged into the `defaultValue` of the storage
  accessor; existing entries are read back as-is.
- **FR-7.** The starting template is committed at
  [`extension/data/defaults-overrides.example.json`](../extension/data/defaults-overrides.example.json).
  The Options-page export shape matches the override-file shape — a JSON
  exported from a tuned extension can be fed straight back into the next build.

## Non-functional requirements

- **NFR-S-1.** Built bundles must not contain obfuscated code. The
  injection-pattern decode step (spec
  [0003](./0003-prompt-injection-defense.md), FR-1) emits plaintext RegExp
  literals at build time so the shipped JS contains no runtime `atob` of
  obfuscated strings. See
  [ADR-0011](../decisions/0011-build-time-decoded-injection-patterns.md).
- **NFR-S-2.** The build-time `EXTENSION_DEFAULT_OVERRIDES`,
  `EXTENSION_RULE_OPTIONS`, and `EXTENSION_DEFAULT_DENYLIST` values are parsed
  at content-script startup via `JSON.parse` and validated against the rule
  registry / option-shape tree / `URLPattern` constructor respectively; a
  malformed value silently degrades to "no overrides" rather than crashing the
  engine. Loud failure happens at build time (FR-4), not at content-script
  start.
- **NFR-M-1.** Rule defaults and IDs live in a single hand-edited file
  (`extension/src/rules/rule-metadata.ts`). The `catalog.test.ts` invariant
  enforces parity with `rules/index.ts`. See
  [ADR-0009](../decisions/0009-rule-defaults-and-build-time-overrides.md).
- **NFR-O-1.** The build-time inputs that affect operator deployment (CLI flags,
  env vars, `define:` substitutions) are documented in
  [`docs/src/content/docs/install.md`](../docs/src/content/docs/install.md)
  §"Customizing defaults at build time" and mirrored in
  `skills/agent-browser-shield-install/SKILL.md` so the build-time customization
  workflow stays accurate across surfaces.

## Current implementation

- FR-1, FR-4: `extension/build.ts` (`--defaults` flag, `EXTENSION_DEFAULTS_FILE`
  env, validation).
- FR-2, FR-3, FR-7: `extension/data/defaults-overrides.example.json`,
  `extension/src/lib/options-button-toggle.ts`,
  `extension/src/lib/run-on-inactive-tabs.ts`,
  `extension/src/lib/debug-trace.ts`,
  `extension/src/lib/placeholder-adaptive-palette.ts`,
  `extension/src/lib/site-denylist.ts` (reads
  `process.env.EXTENSION_DEFAULT_DENYLIST` and seeds `siteDenylistStorage`'s
  `defaultValue`).
- FR-2a: `extension/src/rules/rule-metadata.ts` (`RULE_OPTION_DEFAULTS`),
  `extension/scripts/load-default-overrides.ts` (sub-rule validation),
  `extension/src/lib/rule-options.ts` (`getRuleOptions`, parses
  `EXTENSION_RULE_OPTIONS`). First consumer:
  `extension/src/rules/encoded-payload-redact.ts`.
- FR-5, FR-6: `extension/src/lib/storage.ts` (`parseOverrides`,
  `DEFAULT_STATES`).
- Default source-of-truth: `extension/src/rules/rule-metadata.ts`, validated by
  `extension/src/rules/__tests__/catalog.test.ts`.

## Future work

- **Per-rule** per-host default overrides — the `siteDenylist` reserved key
  (FR-3, [ADR-0018](../decisions/0018-per-site-enforcement-denylist.md)) scopes
  the whole rule set off on a host, not individual rules. Shipping "rule X off
  on host Y" as a build-time default needs either a per-rule denylist map or
  per-host rule overrides; neither is implemented.
- Build-time API key bundling for `irrelevant-sections-redact` is supported via
  `OPENAI_API_KEY` at build time (see `extension/src/lib/api-key-storage.ts`)
  but is not part of the override file. Folding it into the same JSON shape
  would be a natural cleanup; no tracking issue.

## Related

- ADRs: [ADR-0009](../decisions/0009-rule-defaults-and-build-time-overrides.md),
  [ADR-0011](../decisions/0011-build-time-decoded-injection-patterns.md),
  [ADR-0016](../decisions/0016-eslint-style-per-rule-options-shape.md),
  [ADR-0017](../decisions/0017-numeric-thresholds-as-rule-options.md),
  [ADR-0018](../decisions/0018-per-site-enforcement-denylist.md),
  [ADR-0013](../decisions/0013-background-worker-purity-canary.md).
- Docs:
  [`docs/src/content/docs/install.md`](../docs/src/content/docs/install.md)
  §"Customizing defaults at build time".
- Skills:
  [`skills/agent-browser-shield-install/SKILL.md`](../skills/agent-browser-shield-install/SKILL.md).
- Specs: [0010](./0010-extension-ui-and-controls.md),
  [0012](./0012-debug-trace.md).
