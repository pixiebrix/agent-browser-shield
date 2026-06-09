---
status: accepted
date: 2026-06-09
---

# Rule defaults centralized in `rule-metadata.ts`; build-time override flag

## Context and Problem Statement

Each rule module used to carry its own `defaultEnabled`. Operators deploying the
extension into agent runtimes (CDP/Browserbase automation, Hermes, OpenClaw,
etc.) needed a way to ship a build with a custom default rule set without
forking the repo or flipping toggles via the Options UI each session.

PR #61 moved the defaults out of the rule files into a single committed JSON
plus generated TS file, and introduced the `--defaults <path>` build flag. A
later PR (#221) simplified the layout further by collapsing the
JSON-plus-codegen-plus-generated-file pipeline into a single hand-edited
`extension/src/rules/rule-metadata.ts`, since "the existing `catalog.test.ts`
invariant already enforces id parity with `rules/index.ts`, so the codegen layer
was belt-and-suspenders." (PR #221 §"Rule defaults consolidation")

## Decision Drivers

- A single canonical place for `RuleId`, `RULE_IDS`, and `RULE_DEFAULTS`,
  imported by `lib/storage.ts`, so the source-of-truth is unambiguous
  (`AGENTS.md` §"Rule defaults").
- Operators must be able to "ship a build with a custom default set without
  their agent flipping toggles via the Options UI each session." (PR #61
  §"Summary")
- Build-time overrides must affect fresh `chrome.storage` only — existing user
  toggles must persist on rebuild (PR #61 §"Summary"; `README.md` §"Customize
  build-time defaults": "Overrides only apply to fresh `chrome.storage`; users
  with toggled state keep their preferences.").
- The override file format must match the Options-page export so the same JSON
  works in both places (PR #61 §"Summary").

## Considered Options

- Per-rule `defaultEnabled` on each rule module (the original state).
- Lift defaults to `extension/data/rule-defaults.json` + zod-validated codegen
  emitting `rule-defaults.generated.ts` (PR #61).
- Hand-edit a single `extension/src/rules/rule-metadata.ts` and rely on the
  existing `catalog.test.ts` to enforce parity (PR #221, supersedes PR #61's
  codegen layer).

## Decision Outcome

Chosen option: **`extension/src/rules/rule-metadata.ts` as the hand-edited
source of truth for `RuleId`, `RULE_IDS`, and `RULE_DEFAULTS`**, with build-time
overrides supported via `bun run build --defaults <path>` or
`EXTENSION_DEFAULTS_FILE=<path>`.

- `rule-metadata.ts` "is the source of truth for `RuleId`, `RULE_IDS`, and
  `RULE_DEFAULTS`; `extension/src/lib/storage.ts` imports it. It is kept out of
  `rules/index.ts` so the service-worker bundle doesn't pull rule files'
  top-level DOM access." (`AGENTS.md` §"Rule defaults")
- "Adding a rule means appending an entry both here and in `rules/index.ts`; the
  catalog test in `extension/src/rules/__tests__/catalog.test.ts` enforces that
  the two stay in sync." (`AGENTS.md` §"Rule defaults")
- "`extension/build.ts` accepts a `--defaults <path>` CLI flag (or
  `EXTENSION_DEFAULTS_FILE` env var) pointing at a JSON file in the same shape
  as the Options-page export. Validated overrides are injected into the bundle
  via `process.env.EXTENSION_DEFAULT_OVERRIDES`." (`AGENTS.md` §"Rule defaults")
- Reserved non-rule keys on the override file include `optionsButton`,
  `runOnInactiveTabs`, and `debugTrace` (`README.md` §"Customize build-time
  defaults"; PRs #79, #156, #222).
- Override only affects fresh `chrome.storage`; existing user toggles persist
  (PR #61 §"Summary"; `README.md` §"Customize build-time defaults").

### Consequences

- Good, because rule-default changes touch a single hand-edited file rather than
  a JSON-plus-codegen pipeline; the codegen layer that PR #61 introduced was
  retired in PR #221 as "belt-and-suspenders" given the `catalog.test.ts`
  invariant.
- Good, because operators (e.g. CDP / Browserbase automation builds) can flip
  the baseline without forking the repo (PR #61 §"Summary"; `README.md`
  §"Customize build-time defaults").
- Good, because keeping `rule-metadata.ts` out of `rules/index.ts` prevents the
  service-worker bundle from pulling rule files' top-level DOM access
  (`AGENTS.md` §"Rule defaults"; see ADR-0013 for the background-worker purity
  policy).
- Neutral, because adding a rule now requires two appends — `rule-metadata.ts`
  and `rules/index.ts` — enforced by the catalog test (`AGENTS.md` §"Rule
  defaults").
- Bad / supersession: PR #221 deleted `data/rule-defaults.json`,
  `data/rule-defaults.schema.ts`, `scripts/build-rule-defaults.ts`,
  `src/rules/rule-defaults.generated.ts`, the `build-rule-defaults` npm script,
  the codegen call from `build.ts`, and the corresponding CI codegen-freshness
  check (PR #221 §"Rule defaults consolidation"). Operators who had an in-house
  pipeline reading the deleted files need to migrate to the new shape; the
  user-supplied override format remains "sparse and flat — distinct from the
  wrapped `{"defaults": {...}}` shape of the deleted source JSON" (PR #221
  §"Rule defaults consolidation").
  `extension/data/defaults-overrides.example.json` is the new starting template
  (PR #221).

### Confirmation

- `extension/src/rules/__tests__/catalog.test.ts` enforces parity between
  `rule-metadata.ts` and `rules/index.ts` (`AGENTS.md` §"Rule defaults").
- `--defaults` validation: "unknown rule ids fail the build" (PR #61 §"Summary";
  PR #61 §"Test plan" includes a synthetic failing case).
- `check-background-purity.ts` guards the service-worker bundle from rule-file
  leakage (ADR-0013; PR #130; `AGENTS.md` §"Rule defaults" describes the
  rationale).

## Pros and Cons of the Options

### Per-rule `defaultEnabled`

- Bad, because every rule file became a `defaultEnabled` source, and there was
  no one place that could be diffed when shipping a custom build (implicit in PR
  #61 §"Summary": "Move per-rule `defaultEnabled` out of the 21 rule modules
  into a single committed `extension/data/rule-defaults.json`").

### JSON + codegen + generated TS (PR #61)

- Good, because the JSON schema gave operators a versioned contract.
- Bad, because the codegen + generated file pair was "belt-and-suspenders" given
  that `catalog.test.ts` already enforces parity (PR #221 §"Rule defaults
  consolidation").

### Hand-edited `rule-metadata.ts` (PR #221, current)

- Good, because there is one hand-edited file to read and review.
- Good, because removing the codegen layer drops a build step, a generated file,
  a script, and a CI check (PR #221 §"Rule defaults consolidation").
- Bad, because operators who had built tooling around the deleted artifacts have
  to migrate.

## More Information

- PR
  [#61 — Lift rule defaults to data/rule-defaults.json + build-time override flag](https://github.com/pixiebrix/agent-browser-shield/pull/61)
- PR
  [#221 — Refactor: leveled logging + consolidate rule defaults into rule-metadata.ts](https://github.com/pixiebrix/agent-browser-shield/pull/221)
  — supersedes PR #61's JSON+codegen pipeline
- PR
  [#79 — Disable on-page options button by default; make it build-configurable](https://github.com/pixiebrix/agent-browser-shield/pull/79)
- PR
  [#156 — Add option to keep watching inactive tabs](https://github.com/pixiebrix/agent-browser-shield/pull/156)
- PR
  [#222 — Add: debugTrace build-time default + JSONL export schema](https://github.com/pixiebrix/agent-browser-shield/pull/222)
- [`AGENTS.md`](../AGENTS.md) §"Rule defaults"
- [`README.md`](../README.md) §"Customize build-time defaults"
- `extension/data/defaults-overrides.example.json`
