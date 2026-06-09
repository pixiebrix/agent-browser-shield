---
status: accepted
date: 2026-06-02
---

# Enforce `lib/` ↔ `rules/` import boundary via ESLint

## Context and Problem Statement

The codebase had developed an unspoken module-boundary discipline: rule files
were leaves with no imports from sibling rules, and shared helpers lived in
`lib/`. PR #85 set out to lock that discipline in "so a new contributor or agent
can't quietly drift past it." The code was already clean against both zones; the
PR added enforcement without any code relocation (PR #85 §"Summary").

## Decision Drivers

- Rule files should be leaves; "shared helpers belong in `../lib`; the catalog
  stays confined to `./index.ts`, the single place that's allowed to enumerate
  every rule." (PR #85 §"Summary")
- `lib/` helpers must not "reach into a specific rule file. … Reaching into one
  rule from a helper quietly couples that helper to one rule's internals and
  pushes the next rule that needs the same hook into copy-paste." (PR #85
  §"Summary")

## Considered Options

- Document the convention only (the pre-existing state).
- Enforce both directions of the boundary at lint time via
  `import-x/no-restricted-paths`.

## Decision Outcome

Chosen option: **enforce both directions at lint time.**

- Rule files can only import `./types` and `./*.generated.ts` from sibling rule
  files (PR #85 §"Summary").
- `lib/` can only reach `rules/index`, `rules/types`, and `rules/*.generated.ts`
  (PR #85 §"Summary").
- Implemented as "two ESLint flat-config blocks at the bottom of
  `extension/eslint.config.js`, each scoped to one side of the boundary via
  `files` + `ignores`. Scoping the rule via flat-config `files` is cleaner than
  encoding the same exclusion list inside `no-restricted-paths` target globs."
  (PR #85 §"Implementation notes")
- "`except` patterns are resolved to absolute paths via
  `path.join(import.meta.dirname, ...)`. `import-x/no-restricted-paths` resolves
  `from` against `basePath` but hands `except` patterns to Minimatch raw — so
  relative globs like `**/types.ts` silently fail to match when the absolute
  import path contains a dot-prefixed segment … Resolving ourselves dodges both
  pitfalls." (PR #85 §"Implementation notes")

### Consequences

- Good, because boundary drift fails lint locally and in CI; the lint rule does
  not require any code relocation today and stays useful for every future
  contributor or agent (PR #85 §"Summary").
- Neutral, because the implementation uses absolute paths in `except` globs to
  work around the import-x/Minimatch dotfile interaction (PR #85
  §"Implementation notes").

### Confirmation

- "Verified the rules zone fires by injecting
  `import { adsHideRule } from './ads-hide'` into a scratch file under
  `src/rules/`." (PR #85 §"Test plan")
- "Verified the lib zone fires by injecting
  `import { adsHideRule } from '../rules/ads-hide'` into a scratch file under
  `src/lib/`." (PR #85 §"Test plan")

## Pros and Cons of the Options

### Document only

- Bad, because there is nothing to stop a coding agent or new contributor from
  quietly drifting past the convention (PR #85 §"Summary").

### Lint enforcement via `import-x/no-restricted-paths`

- Good, because the boundary is enforced mechanically and at the editor (PR #85
  §"Summary").
- Good, because the per-zone flat-config scoping keeps each rule's globs simple
  (PR #85 §"Implementation notes").

## More Information

- PR
  [#85 — Enforce lib/↔rules/ import boundary via no-restricted-paths](https://github.com/pixiebrix/agent-browser-shield/pull/85)
- Source: `extension/eslint.config.js`
