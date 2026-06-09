---
status: accepted
date: 2026-05-31
---

# Biome + ESLint split with project-specific custom rules

## Context and Problem Statement

The `extension/` package needed both modern, fast formatting/linting and a slot
for project-specific rules (e.g., the rule-ID/filename invariant from ADR-0002).
PR #29 chose to run Biome and ESLint side-by-side rather than pick one.

## Decision Drivers

- "Biome continues to own formatting and its recommended lint set" (PR #29
  §"Summary"; `AGENTS.md` §"Linting": "The split is mechanical — do not
  duplicate a rule between them.").
- ESLint is needed for rules Biome doesn't have — modern-API hints from
  `eslint-plugin-unicorn`, and a local `agent-browser-shield/*` plugin for
  project-specific invariants (PR #29 §"Summary"; `AGENTS.md`).
- The custom-rule slot is required by other ADRs (`rule-id-matches-filename` in
  ADR-0002; `no-restricted-syntax` for `data-abs-…` literals in ADR-0004;
  `no-restricted-paths` for the lib/rules boundary in ADR-0005).

## Considered Options

- Biome only (skip ESLint entirely).
- ESLint only.
- Biome + ESLint, with a mechanical split: Biome owns formatting + recommended
  rules; ESLint owns rules Biome doesn't have.

## Decision Outcome

Chosen option: **Biome + ESLint with a mechanical split.**

- `extension/biome.json` is the Biome config; `extension/eslint.config.js` is
  the flat config that "pulls in `@eslint/js`, `typescript-eslint`, and
  `eslint-plugin-unicorn`, then disables unicorn rules that overlap with Biome
  or are too opinionated for this repo." (`AGENTS.md` §"Linting")
- "Custom rules: `extension/eslint-rules/*.js`. Each rule is one file, exported
  via `extension/eslint-rules/index.js` under the
  `agent-browser-shield/<rule-name>` namespace. Add a rule by dropping a file in
  `eslint-rules/`, exporting it from `index.js`, and enabling it in
  `eslint.config.js`." (`AGENTS.md` §"Linting")
- "`bun run check` runs Biome then ESLint; `bun run check:fix` runs both with
  `--fix`/`--write`." (`AGENTS.md` §"Linting")
- The same pattern was later extended to `demo-site/` and `docs/` (PR #92 —
  "Expand Biome scope to demo-site and docs"; `AGENTS.md` §"Linting":
  "`demo-site/` has a smaller ESLint config… `bun run check` in `demo-site/`
  runs Biome + ESLint.").

### Consequences

- Good, because there is a single command (`bun run check`) that runs both
  layers and matches CI (per user memory `project_preflight_command.md`:
  "Pre-push check is `bun run check`, not `bun run lint`").
- Good, because the custom-rule plugin slot exists and is used by multiple
  project-specific invariants (PR #29 §"Summary"; ADR-0002, ADR-0004, ADR-0005).
- Neutral, because contributors have to know that "the split is mechanical — do
  not duplicate a rule between them." (`AGENTS.md` §"Linting")

### Confirmation

- "Custom rule sanity-checked by temporarily mismatching `RULE_ID` in
  `scarcity-hide.ts` and confirming it errors" (PR #29 §"Test plan").
- `bun run check` is the documented pre-push gate (`AGENTS.md` §"Linting";
  `CONTRIBUTING.md` §"Extension"; user memory `project_preflight_command.md`).

## Pros and Cons of the Options

### Biome only

- Bad, because there is no slot for project-specific lint rules; rules like
  `rule-id-matches-filename`, the `data-abs-…` literal guard, and the
  `lib/`↔`rules/` boundary cannot be enforced (PR #29 §"Summary"; see ADR-0002,
  ADR-0004, ADR-0005).

### ESLint only

- Bad, because Biome's formatting + recommended rule speed is part of the local
  dev loop (`AGENTS.md` §"Linting"; PR #29 §"Summary").

### Biome + ESLint

- Good, because each tool runs the rules it is best at; the two halves are kept
  disjoint by construction (`AGENTS.md` §"Linting": "do not duplicate a rule
  between them.").
- Good, because the custom-rule scaffold has now backed several load-bearing
  invariants (PR #29; ADR-0002, ADR-0004, ADR-0005).

## More Information

- PR
  [#29 — Add ESLint with unicorn plugin and custom rule infrastructure](https://github.com/pixiebrix/agent-browser-shield/pull/29)
- PR
  [#92 — Expand Biome scope to demo-site and docs](https://github.com/pixiebrix/agent-browser-shield/pull/92)
- [`AGENTS.md`](../AGENTS.md) §"Linting"
- User memory: `project_preflight_command.md` — `bun run check` is the pre-push
  gate
