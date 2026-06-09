---
status: accepted
date: 2026-05-30
---

# Encode prompt-injection patterns in YAML, decode at build time

## Context and Problem Statement

`prompt-injection-redact` needs literal regular expressions over adversarial
phrasing. Two competing constraints:

1. Coding agents reading the repo are tripped up by literal prompt-injection
   strings in source files (the "readability shield" motivation in PR #5
   §"Summary").
2. Chrome Web Store review "treats runtime base64 decoding as obfuscated code",
   so the **shipped bundle** cannot decode the patterns at runtime (PR #5 §"Part
   2"; `AGENTS.md` §"Prompt-injection patterns": "this keeps the shipped bundle
   free of `atob`-decoded strings (which Chrome Web Store review treats as
   obfuscated code) while still keeping literal adversarial phrasing out of
   files a coding agent is likely to read.").

## Decision Drivers

- Literal adversarial phrasing must not appear in source files that coding
  agents are likely to read (PR #5 §"Summary"; user memory
  `feedback_no_injection_examples_in_docs.md`).
- The shipped bundle must contain only plaintext regexes; no runtime `atob`
  decode (PR #5 §"Part 2"; `AGENTS.md`).
- The source-of-truth for patterns must live in a tracked, reviewable file; the
  generated TS file must be committed and regenerated automatically by
  `bun run build` (`AGENTS.md` §"Prompt-injection patterns").

## Considered Options

- Inline plaintext regexes in the rule source.
- Runtime `atob` decode inside the bundle.
- Source-of-truth YAML with base64-encoded patterns, decoded at build time and
  emitted as plaintext `RegExp` literals in a committed generated TS file.

## Decision Outcome

Chosen option: **source-of-truth YAML with base64-encoded patterns; decode at
build time into a committed generated TS file.**

- "Regex sources for `prompt-injection-redact` live base64-encoded in
  `extension/data/injection-patterns.yaml`. The codegen in
  `extension/scripts/build-injection-patterns.ts` decodes them and emits
  `extension/src/rules/injection-patterns.generated.ts` with plaintext RegExp
  literals." (`AGENTS.md` §"Prompt-injection patterns")
- "The generated file is committed and `bun run build` regenerates it; for a
  manual run use `bun run build-injection-patterns`. To add or change a pattern,
  edit the YAML and rebuild — do not edit the generated file." (`AGENTS.md`
  §"Prompt-injection patterns")
- The same encoding boundary applies inside the repo: test fixtures decode via
  `atob` but "aren't reachable from any bundle entrypoint, so Bun tree-shakes
  them out — `grep atob dist/*.js` returns 0 across all four bundles." (PR #5
  §"Part 2")
- Patterns in YAML carry a "terse non-adversarial `name`" so review and grep
  work without exposing the literal text (PR #5 §"Part 2").

### Consequences

- Good, because reading any TypeScript file in `extension/src/` never exposes
  adversarial phrasing to a coding agent (PR #5 §"Summary").
- Good, because the shipped bundle ships plaintext regexes only — no runtime
  `atob` decode (PR #5 §"Part 2"; verification: "`grep atob extension/dist/*.js`
  — 0 hits across `content.js`, `background.js`, `popup.js`, `options.js`").
- Bad, because adding or editing a pattern requires base64-encoding the source
  and re-running the codegen — direct edits to the generated file are explicitly
  prohibited (`AGENTS.md` §"Prompt-injection patterns").
- Neutral, because the same source-data + codegen pattern is now used by
  site-rule data (`extension/data/sites/*.yaml` → `site-data.generated.ts`) and
  EasyList (`easylist-generic.generated.ts`) — see `AGENTS.md` §"Site-specific
  rule data" and `README.md` §"Refresh EasyList snapshot".

### Confirmation

- "Plaintext patterns present in shipped bundle (e.g.
  `ignore.*previous.*instructions`)" (PR #5 §"Verification").
- "`grep atob extension/dist/*.js` — 0 hits across `content.js`,
  `background.js`, `popup.js`, `options.js`" (PR #5 §"Verification").
- CI codegen-freshness step (PR #56 §"Summary") regenerates
  `injection-patterns.generated.ts` and fails when the committed copy drifts
  from the YAML inputs.

## Pros and Cons of the Options

### Inline plaintext regexes in source

- Good, because no build-time machinery.
- Bad, because every coding agent reading the rule file is exposed to
  adversarial phrasing (PR #5 §"Summary").

### Runtime `atob` decode in the bundle

- Bad, because Chrome Web Store review "treats [it] as obfuscated code" (PR #5
  §"Part 2"; `AGENTS.md`).

### YAML source + build-time decode

- Good, because both constraints are satisfied: source files stay readable to
  coding agents, and the bundle stays free of `atob` (PR #5 §"Part 2").
- Bad, because pattern edits go through base64 encoding + codegen.

## More Information

- PR
  [#5 — Hide adversarial fixtures from coding agents](https://github.com/pixiebrix/agent-browser-shield/pull/5)
- PR
  [#56 — Add knip, codegen-freshness, and manifest-permission-diff CI checks](https://github.com/pixiebrix/agent-browser-shield/pull/56)
- [`AGENTS.md`](../AGENTS.md) §"Prompt-injection patterns"
- User memory: `feedback_no_injection_examples_in_docs.md` (keep docs/marketing
  abstract about injection patterns)
