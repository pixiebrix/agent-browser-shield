---
status: accepted
date: 2026-06-04
---

# Keep rule files out of the background service worker; enforce with a build-time purity canary

## Context and Problem Statement

The background service worker is a DOM-less runtime. PR #130 root-caused a crash
where "the background service worker crashed at load with
`ReferenceError: HTMLInputElement is not defined` because `lib/storage.ts`
imported `RuleId`/`RULE_IDS` from `rules/index.ts`, which transitively pulls
every rule file — including `checkout-checkbox-sanitize.ts`, which captures the
native `HTMLInputElement.prototype` setter at module top level." (PR #130
§"Summary")

The crash showed that the import graph leaks rule files into the SW bundle
silently; once a rule module is reachable from `background.ts`, any top-level
DOM access in any rule will crash the worker.

## Decision Drivers

- The service worker must boot in a DOM-less runtime; no rule file may appear in
  its import graph (PR #130 §"Summary").
- Adding a `--defaults` build flag and other shared metadata to `lib/storage.ts`
  requires that the storage module avoid the rules barrel (PR #130; ADR-0009).

## Considered Options

- Keep `RULE_IDS` / `RuleId` exports on `rules/index.ts` (the prior shape) and
  rely on per-module discipline.
- Move `RULE_IDS` / `RuleId` off `rules/index.ts` into a barrel-free module that
  the background can safely import; add a build-time check that fails if any
  rule label leaks into `background.js`.

## Decision Outcome

Chosen option: **move the catalog metadata out of `rules/index.ts` and enforce
purity with a build-time canary.**

- "Moved the canonical `RuleId` + `RULE_IDS` to
  `rules/rule-defaults.generated.ts` (derived from its own keys) and switched
  `storage.ts` to use the runtime values from there with an `import type` for
  `RuleId`. The SW bundle no longer has any rule file in its import graph." (PR
  #130 §"Summary"). (PR #221 later consolidated these into `rule-metadata.ts`;
  see ADR-0009.)
- "Made `checkout-checkbox-sanitize.ts` lazy-init the prototype lookup so it's
  also safe to import in DOM-less contexts." (PR #130 §"Summary")
- Added `scripts/check-background-purity.ts`, wired into `build.ts`: "scans
  every rule file for its top-level `label: '…'`, asserts none appear in
  `dist/background.js`, fails the build on a leak. Labels survive Bun's
  minification and are unique to rule files, so they make a sound canary." (PR
  #130 §"Summary")
- The dropped `JSDOM` shim from `scripts/build-rule-defaults.ts` is also a
  consequence — "codegen is now pure data" (PR #130 §"Summary"). (PR #221 later
  removed the rule-defaults codegen entirely; see ADR-0009.)
- The current AGENTS.md captures the resulting invariant: "It is kept out of
  `rules/index.ts` so the service-worker bundle doesn't pull rule files'
  top-level DOM access." (`AGENTS.md` §"Rule defaults")

### Consequences

- Good, because a leak into `background.js` fails the build with a pointer to
  the offending rule file (PR #130 §"Summary").
- Good, because the build-time canary uses minification-stable string literals
  (rule labels), which "are unique to rule files, so they make a sound canary."
  (PR #130 §"Summary")
- Neutral, because rule files must not put DOM-touching code at module top
  level; `checkout-checkbox-sanitize.ts` was migrated to lazy-init to fit (PR
  #130 §"Summary").
- Bad, because the purity canary's invariant — rule label literals uniquely
  identify rule files — relies on Bun's minifier not collapsing labels; the
  synthetic-leak test in PR #130 confirms it for the current build, but a future
  bundler swap would need to re-validate.

### Confirmation

- "`bun run build.ts` — purity check reports `35 canaries, no leaks`" (PR #130
  §"Test plan").
- "Synthetic leak test (injected a rule label literal into `background.ts`) —
  purity check fails with non-zero exit and a labeled rule-file pointer" (PR
  #130 §"Test plan").
- `extension/scripts/check-background-purity.ts` runs from `extension/build.ts`
  on every build.

## Pros and Cons of the Options

### Per-module discipline only

- Bad, because the original incident demonstrated that a single innocent-looking
  import (`lib/storage.ts` pulling `rules/index.ts`) drags every rule file into
  the worker bundle silently (PR #130 §"Summary").

### Decouple catalog metadata + build-time canary

- Good, because both halves of the fix are enforced mechanically: the catalog
  moves out of `rules/index.ts`, and the canary catches any future
  reintroduction (PR #130 §"Summary").

## More Information

- PR
  [#130 — Fix background worker crash by decoupling rules catalog from storage](https://github.com/pixiebrix/agent-browser-shield/pull/130)
- PR
  [#221 — Refactor: leveled logging + consolidate rule defaults into rule-metadata.ts](https://github.com/pixiebrix/agent-browser-shield/pull/221)
  — moves catalog metadata to `rule-metadata.ts`
- ADR-0009 — Rule defaults centralized in `rule-metadata.ts`
- [`AGENTS.md`](../AGENTS.md) §"Rule defaults"
- Source: `extension/scripts/check-background-purity.ts`, `extension/build.ts`
