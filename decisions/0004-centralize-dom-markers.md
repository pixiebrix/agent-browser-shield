---
status: accepted
date: 2026-06-02
---

# Centralize `data-abs-*` DOM markers in `lib/dom-markers.ts`

## Context and Problem Statement

The extension stamps 10 distinct `data-abs-*` attributes onto pages from 6
different files. Until PR #95, each file declared its own local `const`. "No
collision today (verified), but the pattern doesn't scale, and with 23 rules
already registered there's no canonical naming reference for the 24th" (PR #95
§"Summary").

## Decision Drivers

- A single canonical location for every `data-abs-*` attribute so collisions and
  naming drift fail at lint time, not in production (PR #95 §"Summary").
- A naming convention discoverable from the registry — engine-level markers vs.
  per-rule markers — so future markers fit the established shape (`AGENTS.md`
  §"DOM marker attributes").

## Considered Options

- Keep per-rule local `const` declarations (the prior state).
- Re-export every marker through `placeholder.ts`.
- Introduce `extension/src/lib/dom-markers.ts` as the single source of truth and
  block raw `data-abs-…` literals via ESLint.

## Decision Outcome

Chosen option: **`extension/src/lib/dom-markers.ts` as the single source of
truth**, enforced by an ESLint `no-restricted-syntax` rule that blocks raw
`data-abs-…` string and template literals everywhere except the registry itself
(PR #95 §"Summary"; `AGENTS.md` §"DOM marker attributes").

Conventions:

- Engine-level markers are named `<PURPOSE>_ATTR` (`RULE_ATTR`, `REVEALED_ATTR`,
  `HIDDEN_ATTR`, `PLACEHOLDER_MODE_ATTR`).
- Per-rule markers are named `<RULE>_<PURPOSE>_ATTR` (`CART_ADDON_FLAGGED_ATTR`,
  `CHECKOUT_CHECKBOX_CLEARED_ATTR`, the four `CONFIRMSHAME_ORIGINAL_*_ATTR`s).
- Import the constant; do not inline the literal (`AGENTS.md` §"DOM marker
  attributes").

### Consequences

- Good, because "future collisions or convention drift fail lint instead of
  slipping through review" (PR #95 §"Summary").
- Good, because the registry doubles as the naming reference for new rules,
  closing out the third item from the agent-readiness audit (PR #95 §"Summary").
- Neutral, because all existing importers were updated in a single sweep: 6 rule
  files, 4 lib files, 9 test files (PR #95 §"Summary").

### Confirmation

- Lint rule verified to fire "on both literal forms" (inline string and template
  literal) (PR #95 §"Test plan").
- `AGENTS.md` §"DOM marker attributes" documents the registry and lint
  enforcement so authors and agents look in one place.

## Pros and Cons of the Options

### Per-rule local `const`s

- Bad, because there is no naming reference for new markers, and silent
  collisions are possible at scale (PR #95 §"Summary").

### Re-export through `placeholder.ts`

- Bad, because "the indirection would dilute the 'one canonical location' goal a
  new agent needs." (PR #95 §"Summary"; "Re-exports through `placeholder.ts`
  were considered and rejected".)

### Central `lib/dom-markers.ts` registry + lint enforcement

- Good, because lint fails on the wrong spelling — drift cannot land silently
  (PR #95 §"Summary").
- Good, because the engine-vs-per-rule naming split makes the registry's own
  contents navigable (PR #95 §"Summary"; `AGENTS.md`).

## More Information

- PR
  [#95 — Centralize data-abs-\* DOM markers in lib/dom-markers.ts](https://github.com/pixiebrix/agent-browser-shield/pull/95)
- [`AGENTS.md`](../AGENTS.md) §"DOM marker attributes"
- Source: `extension/src/lib/dom-markers.ts`, `extension/eslint.config.js`
