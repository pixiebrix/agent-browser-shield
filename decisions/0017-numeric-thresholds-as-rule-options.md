---
status: accepted
date: 2026-06-09
---

# Numeric thresholds exposed as per-sub-rule options

## Context and Problem Statement

ADR-0016 introduced the ESLint-style object form for the build-time override
file, with the leaf-type invariant that every override value in the sub-rule
tree is a **boolean** (sub-rule on / off). That covers the case where a
sub-rule's heuristic misfires badly enough to disable it, but not the in-between
case: an operator who wants `encoded-payload-redact`'s NATO detector turned on
but with a stricter token floor than the shipping default, or Morse with a
higher valid-ratio cutoff. Today those tuning knobs are file-scope constants in
`extension/src/rules/encoded-payload-redact.ts` (`MIN_NATO_WORDS = 10`,
`MIN_MORSE_VALID_RATIO = 0.8`, `MIN_LEET_SUBSTITUTIONS = 4`, twelve more) and
changing them requires forking the rule source.

The sub-rule on/off layer (ADR-0016) already requires sophisticated operators to
read the rule's source and the spec to understand which sub-rules are worth
disabling. Threshold tuning sits one click further down that same path: "a
custom build by someone reading the source." The question is whether to expose
the knobs in the same override-file shape, or keep them as source-level
constants.

## Decision Drivers

- Tuning the false-positive band per sub-rule is the natural follow-on to the
  on/off control ADR-0016 ships (PR #TBD §"Summary"). The same operators who
  disable NATO/Morse outright are the most likely to also want to keep them on
  at a stricter setting.
- Threshold values already live in pure data — the existing file-level `MIN_*`
  consts have no behaviour, only inline comments explaining the trade-off
  (`extension/src/rules/encoded-payload-redact.ts` constants block). Moving them
  into `RULE_OPTION_DEFAULTS` is a relocation, not new state.
- The override-file shape should stay declarative and uniform with the ADR-0016
  design: an operator who already knows the boolean form should recognize the
  threshold form as a strict extension of it. No new top-level keys, no parallel
  mechanism.
- Sophisticated-user policy: per the user directive recorded in PR #TBD
  §"Scope", knob meanings stay in the rule source — no in-repo "knobs reference"
  doc — so the validation layer doesn't carry the maintenance burden of
  explaining what each number means.

## Considered Options

- **Numeric leaves in the same tree, sub-rule value is
  `boolean | { enabled?, ...numbers }`** — each sub-rule may stay a bare boolean
  (back-compat with ADR-0016) or be upgraded to an object with optional
  `enabled` and named numeric thresholds matching the sub-rule's section of
  `RULE_OPTION_DEFAULTS`.
- **Separate `ruleThresholds` namespace** — keep the ADR-0016 tree boolean-only;
  thresholds go under a sibling top-level key keyed by rule id and threshold
  name.
- **Sensitivity enum (low / medium / high)** — each sub-rule takes a discrete
  band; the rule maps it to internal threshold sets.
- **Don't expose; keep thresholds as source-level constants** — status quo.

## Decision Outcome

Chosen option: **numeric leaves in the same tree, with each sub-rule value being
`boolean | { enabled?: boolean, ...numericThresholds }`**.

- `RULE_OPTION_DEFAULTS` in `extension/src/rules/rule-metadata.ts` becomes the
  source-of-truth for the threshold values themselves. The `MIN_*` constants
  currently inline in `encoded-payload-redact.ts` move into the per-sub-rule
  defaults; the rule reads its merged thresholds via `getRuleOptions(...)` at
  module init (PR #TBD §"Implementation").
- A sub-rule's value in the override file is either a boolean (existing
  behaviour from ADR-0016) or an object whose keys match the sub-rule's declared
  thresholds plus an optional `enabled`. A bare boolean is equivalent to
  `{ "enabled": <boolean> }`, mirroring the rule-level shape ADR-0016 set up.
- Validation widens to accept `boolean | finite number` at leaves, gated on the
  leaf type in `RULE_OPTION_DEFAULTS`: positions whose default is a boolean
  accept booleans only; positions whose default is a number accept finite
  numbers only. No range checks — operators who pass `minLength: -1` or
  `validRatio: 5` get the surprising-but-deterministic behaviour their number
  produces. They are reading the source by definition (PR #TBD §"Scope":
  "sophisticated users").
- `enabled` at the sub-rule level remains optional; absent fields fall back to
  `RULE_OPTION_DEFAULTS`. This generalizes ADR-0016 FR-2a's "omitted sub-rules
  keep defaults" to sub-fields within a sub-rule.

### Consequences

- Good, because the override file gains expressiveness without a new schema
  namespace: every operator-facing knob lives under
  `<rule-id>.subRules.<sub-rule>.<knob>`. The ADR-0016 mental model ("rule entry
  can be boolean or object") propagates down one level cleanly.
- Good, because thresholds become discoverable via the same declarative source
  the on/off shape lives in (`RULE_OPTION_DEFAULTS`). A reader of
  `rule-metadata.ts` sees both the binary and the numeric configuration for each
  sub-rule in one place (PR #TBD §"Implementation").
- Good, because the rule code stops carrying duplicated default state — the
  `MIN_*` constants relocate rather than fork (PR #TBD §"Refactor").
- Neutral, because the catalog-test invariant from ADR-0016 ("every leaf is a
  boolean") is replaced with "every leaf is `boolean | finite number`, and
  override-type matches default-type at each position" (PR #TBD §"Test plan").
- Bad, because the override file's failure modes grow: in addition to ADR-0016's
  path-qualified type errors, operators can now silently produce a non-matching
  rule by setting a threshold to a value that no realistic input would clear.
  The mitigation is the sophisticated-user policy (PR #TBD §"Scope") — no range
  checks, knob meanings live in the source.
- Bad, because the regex candidates that interpolate threshold constants
  (`BASE64_CANDIDATE`, `HEX_CANDIDATE`, `TEXT_CIPHER_CANDIDATE`,
  `LEET_CANDIDATE`, `MORSE_CANDIDATE`) must be rebuilt at module init from the
  merged options rather than at file-evaluation time. Cheap (build runs once per
  content-script load), but worth noting.

### Confirmation

- `extension/scripts/__tests__/load-default-overrides.test.ts` extends the
  ADR-0016 cases with numeric leaves: valid numeric override; non-number for a
  numeric leaf; boolean for a numeric leaf and vice-versa; partial threshold
  object merges over defaults (PR #TBD §"Test plan").
- `extension/src/rules/__tests__/catalog.test.ts` invariant is widened: every
  leaf in `RULE_OPTION_DEFAULTS` is `boolean | finite number`, and no leaf is a
  string or `null` (PR #TBD §"Test plan").
- `extension/src/rules/__tests__/encoded-payload-redact.test.ts` adds
  threshold-tuning cases: lowering `nato.minWords` matches a previously
  too-short candidate; raising `morse.validRatio` rejects a previously matching
  payload (PR #TBD §"Test plan").

## Pros and Cons of the Options

### Numeric leaves in the same tree (chosen)

- Good, because the validation and merge logic are a strict extension of the
  ADR-0016 boolean-tree walk: same recursion, wider leaf type check.
- Good, because the override file stays single-tree; an operator's threshold
  tweak sits visually adjacent to the on/off toggle it modifies.
- Bad, because the leaf type is no longer uniform — readers can no longer assume
  every position is a boolean.

### Separate `ruleThresholds` namespace

- Good, because the ADR-0016 boolean-only invariant stays clean.
- Bad, because per-sub-rule state splits across two top-level namespaces. An
  operator looking at `encoded-payload-redact.nato` has to also consult
  `ruleThresholds.encoded-payload-redact.nato`.

### Sensitivity enum

- Good, because tiny vocabulary (`low | medium | high`); easy to validate; no
  escape-hatch maintenance burden.
- Bad, because not expressive enough — an operator who needs
  `nato.minWords = 14` cannot get it without a custom build, defeating the
  purpose of exposing the knob in the override layer.

### Status quo (source-level constants)

- Good, because zero schema or validator change.
- Bad, because forking the rule source is the only path to a tuned threshold,
  which is the gap this ADR closes.

## More Information

- PR
  [#232 — Add: ESLint-style per-rule build-time options (encoded-payload sub-rules)](https://github.com/pixiebrix/agent-browser-shield/pull/232)
  — the predecessor PR that introduced the boolean-only leaf invariant this ADR
  widens
- PR #TBD — the implementation PR for this ADR; updates the catalog invariant,
  validator, merge, and rule reads
- [ADR-0016](./0016-eslint-style-per-rule-options-shape.md) — the parent
  decision that established the ESLint-style object shape; this ADR extends its
  leaf-type invariant
- [ADR-0009](./0009-rule-defaults-and-build-time-overrides.md) — the root
  decision establishing `rule-metadata.ts` as the build-time configuration
  source-of-truth
- Spec [0011](../specs/0011-build-time-customization.md) — FR-2a / FR-4 /
  NFR-S-2 reworded to cover the wider leaf type
