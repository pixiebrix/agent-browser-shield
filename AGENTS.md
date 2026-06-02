# AGENTS.md

This file provides guidance to coding agents (Claude Code, Cursor, Codex, Aider,
etc.) when working with code in this repository.

## Branching workflow

This repo follows GitHub flow. For any new task, create a feature branch off
`main`, push it, and open a PR — do not commit directly to `main`.

## Repository Purpose

Prototyping browser extension capabilities for improving browser use agent
performance:

- Token efficiency
- Security
- Compliance: e.g., exposure to PII
- Accuracy

Ideas explored in this repository:

- Masking/Redacting sensitive information on the webpage
- Blocking/Modifying dark patterns on the webpage
- Preprocessing webpage content to be more agent-friendly, e.g., hiding
  irrelevant content, hiding user-generated comments which could contain
  prompt-injection attacks, etc.

## Reference

- Upload extension for use with browserbase:
  [browser-extensions](https://docs.browserbase.com/platform/browser/core-features/browser-extensions#browser-extensions)

## Technology

- Chromium Extension: Manifest V3, TypeScript, bun (bundling) assume Chrome 148+
  for modern JS features
- Python: use `uv` for all package management

## Linting

Two linters run on `extension/`: Biome owns formatting plus its recommended rule
set; ESLint runs only rules Biome doesn't have. The split is mechanical — do not
duplicate a rule between them.

- Biome config: `extension/biome.json`.
- ESLint config: `extension/eslint.config.js` (flat config) — pulls in
  `@eslint/js`, `typescript-eslint`, and `eslint-plugin-unicorn`, then disables
  unicorn rules that overlap with Biome or are too opinionated for this repo.
- Custom rules: `extension/eslint-rules/*.js`. Each rule is one file, exported
  via `extension/eslint-rules/index.js` under the
  `agent-browser-shield/<rule-name>` namespace. Add a rule by dropping a file in
  `eslint-rules/`, exporting it from `index.js`, and enabling it in
  `eslint.config.js`.
- `bun run check` runs Biome then ESLint; `bun run check:fix` runs both with
  `--fix`/`--write`.

## Rule authoring: re-scan SPA mutations

Rule `apply` runs once at `document_idle`. Client-side route changes in SPAs
(React Router, Vue Router, etc.) swap subtrees in and out without a new page
load, so anything that only ran in `apply` will never see post-navigation
content — and most of our targets (PII, secrets, scarcity badges, hidden
text) are exactly the kind of late-mounted content SPAs are built on.

Default to wiring a `createSubtreeWatcher` (`extension/src/lib/subtree-watcher.ts`)
into any rule that mutates the DOM, with `skipPlaceholderSubtrees: true` when
the rule inserts placeholders. Mirror the pattern used in `pii-mask`,
`secrets-mask`, `scarcity-hide`, `hidden-text-strip`, etc.: a shared
`scanAndX(root)` function called by both `apply` and the watcher's
`onSubtrees`, plus a `teardown` that calls `watcher.stop()`. Skip the watcher
only when there is nothing to re-scan after initial load — e.g., a one-shot
landmark injection — and call that out in a comment.

## Rule defaults

The initial enabled/disabled state for each rule lives in
`extension/data/rule-defaults.json`, not on the rule modules themselves. The
codegen in `extension/scripts/build-rule-defaults.ts` validates that every
registered rule id has a default (and that no unknown ids appear) and emits
`extension/src/rules/rule-defaults.generated.ts`, which
`extension/src/lib/storage.ts` imports. Adding a rule without picking a default
fails the build; do not edit the generated file.

`extension/build.ts` accepts a `--defaults <path>` CLI flag (or
`EXTENSION_DEFAULTS_FILE` env var) pointing at a JSON file in the same shape as
the Options-page export. Validated overrides are injected into the bundle via
`process.env.EXTENSION_DEFAULT_OVERRIDES`. Override only affects fresh
`chrome.storage`; existing user toggles persist.

## Site-specific rule data

Selectors and URL recipes for individual sites live in
`extension/data/sites/*.yaml`, not inline in the rule TS files. The codegen in
`extension/scripts/build-site-data.ts` validates each YAML against the zod
schema at `extension/data/site-rules.schema.ts` and emits
`extension/src/rules/site-data.generated.ts`, which the rule files import.

The generated file is committed (matching the `easylist-generic.generated.ts`
precedent). `bun run build` invokes codegen automatically; for a manual run use
`bun run build-site-data`. To add or change site coverage, edit the YAML and
rebuild — do not edit the generated file.

## Prompt-injection patterns

Regex sources for `prompt-injection-hide` live base64-encoded in
`extension/data/injection-patterns.yaml`. The codegen in
`extension/scripts/build-injection-patterns.ts` decodes them and emits
`extension/src/rules/injection-patterns.generated.ts` with plaintext RegExp
literals — this keeps the shipped bundle free of `atob`-decoded strings (which
Chrome Web Store review treats as obfuscated code) while still keeping literal
adversarial phrasing out of files a coding agent is likely to read.

The generated file is committed and `bun run build` regenerates it; for a manual
run use `bun run build-injection-patterns`. To add or change a pattern, edit the
YAML and rebuild — do not edit the generated file.

## Benchmark output management

Benchmark runs accumulate under `output/results/<run_id>/` (raw events, traces,
manifest) and `output/reports/<run_id>*.html` (diff viewers). Both directories
are gitignored. To prune old artifacts:

```sh
uv run scripts/clean_artifacts.py            # dry-run, keeps 3 most recent
uv run scripts/clean_artifacts.py --keep 5 --apply
uv run scripts/clean_artifacts.py --orphans-only --apply  # only HTMLs whose run is gone
```

Dry-run by default; pass `--apply` to actually delete. See the script's `--help`
for the full flag list.

## Skills

When adding, removing, or renaming a defense rule (anything in
`extension/src/rules/` registered in `extension/src/rules/index.ts`), update
`skills/agent-browser-shield-config/SKILL.md` so its rule ID list stays in sync.
If the change also affects DOM markers or required agent behavior, update
`skills/agent-browser-shield/SKILL.md` as well.

When changing the trace bundle layout, file names, or step schema produced by
`scripts/build_traces.py`, update
`skills/agent-browser-shield-diagnose/SKILL.md` so the diagnostic workflow it
describes still matches what's on disk.

When changing the site-rule schema (`SITE_DATA_RULE_IDS` in
`extension/data/site-rules.schema.ts`) or the Playwright MCP setup
(`.mcp.json`), update `skills/agent-browser-shield-site-rules/SKILL.md` so its
rule-type list and workflow stay in sync.

When changing build-time inputs in `extension/build.ts` (CLI flags, env vars,
`define:` substitutions) — especially anything that affects how operators
configure a deployed build — update
`skills/agent-browser-shield-install/SKILL.md` and
`docs/src/content/docs/install.md` so the build-time customization workflow
stays accurate.
