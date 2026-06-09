---
status: accepted
date: 2026-06-09
---

# ESLint-style per-rule build-time options shape

## Context and Problem Statement

The build-time override file shipped with ADR-0009 maps each registered rule id
to a single boolean. That shape covers "rule on / rule off" but not "selectively
disable one of the rule's internal detectors." `encoded-payload-redact` runs
seven detectors inside one rule (base64, hex, percent, substitution ciphers,
leetspeak, NATO phonetic, Morse), three of which — leetspeak, NATO, and Morse —
have higher false-positive rates by construction because their qualifiers rest
on common-word counts rather than printable-ratio (PR #232 §"Summary").
Operators today have only two choices: accept the misfires or disable the entire
rule and lose the byte-encoding coverage they actually want (PR #232
§"Summary").

Spec 0011 §"Future work" had already noted "Per-host default overrides — today
overrides are flat and global" as a related gap; sub-rule control is the
adjacent shape question — *how* to add structure to the per-rule value without
breaking the flat-boolean contract the Options-page export depends on (spec 0011
FR-7: "a JSON exported from a tuned extension can be fed straight back into the
next build").

## Decision Drivers

- The flat boolean shape and the Options-page export round-trip (spec 0011 FR-7)
  must keep working — a user who exports their toggles and feeds the JSON back
  into `--defaults` must still get a valid build.
- Validation must fail loudly with path-qualified messages (spec 0011 FR-4):
  "Infra operators want loud failures, not silent drift if a rule was renamed"
  (`extension/scripts/load-default-overrides.ts` header).
- The same source-of-truth invariants ADR-0009 set up must keep holding: the
  service-worker bundle can't depend on rule-file DOM access
  (`extension/src/rules/rule-metadata.ts` header; ADR-0013), and
  `catalog.test.ts` must continue to enforce parity (ADR-0009 §"Confirmation").
- Build-time only for this iteration. PR #232 §"Implementation" scopes the
  change to build-time configuration; runtime sub-rule toggling via the Options
  page is explicitly out of scope.

## Considered Options

- **ESLint-style object value** — a rule's value is either a boolean (existing
  behaviour) or `{ "enabled"?: boolean, ...subRuleOptions }`. Mirrors the ESLint
  convention where a rule entry can be `"rule-name": "error"` or
  `"rule-name": ["error", { options }]`.
- **Top-level `ruleOptions` sibling key** — the rule entry stays boolean;
  per-rule options live under a separate `ruleOptions: { "rule-id": { ... } }`
  field on the same flat object.
- **Dot-notation flat keys** — stay flat at one level: keys like
  `encoded-payload-redact.subRules.leetspeak` mapped directly to booleans.

## Decision Outcome

Chosen option: **ESLint-style object value**, gated on the rule declaring a
sub-rule shape in `extension/src/rules/rule-metadata.ts`'s
`RULE_OPTION_DEFAULTS`.

- A rule's value in the override file may be a boolean (existing behaviour) *or*
  an object `{ "enabled"?: boolean, ...subRuleOptions }`. Object values for
  rules without a declared shape fail the build (spec 0011 FR-4, reworded by PR
  #232 to include the new failure mode).
- `enabled` in the object form is optional; absence keeps the rule's committed
  `RULE_DEFAULTS` state. Partial sub-rule objects merge over
  `RULE_OPTION_DEFAULTS` so omitted sub-rules keep their defaults (spec 0011
  FR-2a; FR-5 generalized).
- The validator (`extension/scripts/load-default-overrides.ts`) walks the
  declared option-shape tree recursively rather than hard-coding `subRules`, so
  future rules can declare other option groups without touching the loader (PR
  #232 §"Implementation").
- Build-time injection: `extension/build.ts` adds a new
  `process.env.EXTENSION_RULE_OPTIONS` define alongside the existing
  `EXTENSION_DEFAULT_OVERRIDES`; rules consume it through
  `extension/src/lib/rule-options.ts`'s typed `getRuleOptions(id)` accessor.
  Malformed JSON silently degrades to defaults, mirroring `lib/storage.ts` (spec
  0011 NFR-S-2 generalized by PR #232).
- First (and only) consumer: `extension/src/rules/encoded-payload-redact.ts`,
  which exposes one sub-rule per encoding family — the three substitution
  decoders (ROT13 / Atbash / reverse) share one `substitutionCipher` toggle
  because they share the candidate window and first-match-wins resolution (PR
  #232 §"Summary").

### Consequences

- Good, because the Options-page export shape stays flat-boolean and the
  round-trip into the next build still works: object values are purely additive
  (PR #232 §"Summary"; spec 0011 FR-2a).
- Good, because the rule entry remains the single keyed identity for a rule in
  the override file — enable/disable and sub-rule configuration co-locate rather
  than splitting into a sibling namespace.
- Good, because the recursive validator means new rules that take options don't
  need new loader code, only a new `RULE_OPTION_DEFAULTS` entry; the catalog
  test enforces every entry has corresponding metadata (PR #232
  §"Implementation"; `extension/src/rules/__tests__/catalog.test.ts` new
  invariants).
- Neutral, because the `Rule` interface (`extension/src/rules/types.ts`) did not
  change. Rules read their options via `getRuleOptions` at module init rather
  than receiving them through `apply()`. This keeps the engine API stable but
  means the lookup is implicit at the rule's call site rather than injected by
  the engine (PR #232 §"Implementation": "the rule reads its options at module
  init rather than receiving them through `apply()`").
- Bad, because the `enabled` field overlaps with the flat-boolean shape — a
  reader can write `"encoded-payload-redact": false` or
  `"encoded-payload-redact": { "enabled": false }` and get the same result. The
  loader maps both to the same `rules[key] = enabled` write
  (`extension/scripts/load-default-overrides.ts` — boolean branch and the
  `enabled` extraction inside the object branch).
- Bad / future work: per-rule options remain build-time only. Runtime sub-rule
  toggling via the Options page is not in this iteration (PR #232
  §"Implementation" / §"Summary").

### Confirmation

- `extension/scripts/__tests__/load-default-overrides.test.ts` adds the
  validator cases for the object form: missing `enabled`, unknown sub-rule key,
  unknown top-level group under a rule object, non-boolean leaf, non-boolean
  `enabled`, partial sub-rule object, and object value for a rule without
  declared options (PR #232 §"Test plan").
- `extension/src/rules/__tests__/catalog.test.ts` adds two invariants: every key
  in `RULE_OPTION_DEFAULTS` must also appear in `RULE_DEFAULTS`, and every leaf
  in the option-shape tree must be a boolean (PR #232 §"Test plan").
- `extension/src/rules/__tests__/encoded-payload-redact.test.ts` exercises each
  sub-rule toggle by reloading the rule module under a freshly-set
  `EXTENSION_RULE_OPTIONS` env via `jest.isolateModulesAsync` (PR #232 §"Test
  plan").
- End-to-end build smoke (PR #232 §"Test plan"): a valid override builds with
  the new "Applying N override(s)" count incremented; four malformed inputs
  (object value for a rule without options, unknown sub-rule key, non-boolean
  leaf, unknown top-level group) each fail with a clear path-qualified message.

## Pros and Cons of the Options

### ESLint-style object value

- Good, because each rule's state stays under a single top-level key — the
  enable/disable flag and the sub-rule configuration co-locate. Mirrors a shape
  contributors already know from ESLint and similar lint tooling.
- Good, because the existing flat-boolean shape stays valid (PR #232 §"Summary":
  "Plain booleans still work").
- Bad, because object and boolean values for the same key co-exist, so the
  override-file schema has two shapes per rule (the loader's boolean and object
  branches in `extension/scripts/load-default-overrides.ts` both produce a
  boolean write at the storage layer).

### Top-level `ruleOptions` sibling key

- Good, because the enable/disable namespace stays purely flat-boolean (mirrors
  today's Options-page export 1:1).
- Bad, because per-rule state splits across two top-level keys for any rule with
  options. A reader looking at `encoded-payload-redact`'s state has to consult
  two places.

### Dot-notation flat keys

- Good, because the file stays a single flat map of string-to-boolean.
- Bad, because keys are stringly typed
  (`encoded-payload-redact.subRules.leetspeak`) rather than structurally typed;
  harder for tooling and for humans to scan at a glance.

## More Information

- PR
  [#232 — Add: ESLint-style per-rule build-time options (encoded-payload sub-rules)](https://github.com/pixiebrix/agent-browser-shield/pull/232)
- Spec [0011](../specs/0011-build-time-customization.md) — Build-time
  customization (FR-2a added by PR #232)
- [ADR-0009](./0009-rule-defaults-and-build-time-overrides.md) — the parent
  decision establishing `rule-metadata.ts` and the `--defaults` flag
- [ADR-0013](./0013-background-worker-purity-canary.md) — the service-worker
  purity invariant `rule-metadata.ts` must respect
- `extension/data/defaults-overrides.example.json` — starting template, updated
  with the object-form example
