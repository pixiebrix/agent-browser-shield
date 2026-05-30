# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

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
