---
status: accepted
date: 2026-05-30
---

# CalVer + `workflow_dispatch`-driven extension release

## Context and Problem Statement

The extension manifest's `version` is consumed by Chrome's update logic. The
release workflow originally fired on `release: published`, which meant the human
had to bump `manifest.json` first. PR #17 switched to a workflow that computes
the version itself and creates the release, keeping a permanent dev placeholder
on the source manifest.

## Decision Drivers

- "Chrome compares `manifest.version` numerically segment-by-segment with a
  4-segment max." (PR #17 §"Why CalVer + run_number")
- "`github.run_number` is monotonic per-repo and never resets, so every release
  is guaranteed to look newer than the previous one — including multiple
  same-day releases." (PR #17 §"Why CalVer + run_number")
- Run numbers are "only knowable at workflow time, which is why the workflow has
  to create the release rather than react to a hand-cut tag." (PR #17 §"Why
  CalVer + run_number")
- No manual `manifest.json` version bump should be needed to cut a release (PR
  #17 §"Summary").

## Considered Options

- Build-on-tag (the previous `release: published` trigger).
- `workflow_dispatch` that computes `YYYY.M.D.${{ github.run_number }}`, patches
  the manifest, builds, uploads, and creates the release itself.

## Decision Outcome

Chosen option: **`workflow_dispatch` that computes
`YYYY.M.D.${{ github.run_number }}`, patches the manifest, and creates the
release.**

- "Switches `.github/workflows/release-extension.yml` from `release: published`
  (build-on-tag) to `workflow_dispatch` (workflow creates the release). CI
  computes `version = YYYY.M.D.${{ github.run_number }}`, `jq`-patches
  `extension/src/manifest.json` in the runner, builds, uploads to S3, and calls
  `gh release create` itself." (PR #17 §"Summary")
- "The source `extension/src/manifest.json` `version` (`0.1.0`) is now a
  permanent dev placeholder for unpacked loads — CI overwrites it. No manual
  version bump is needed to cut a release." (PR #17 §"Summary")
- "Adds `scripts/cut-release.sh` for dispatching the workflow from a clean
  `main` (preflights gh auth, branch, dirty tree, sync with origin; `--watch`
  tails the run)." (PR #17 §"Summary")

### Consequences

- Good, because Chrome's "`2026.6.1 > 2026.5.31` and
  `2026.5.30.43 > 2026.5.30.42` both hold" — the version ordering is correct
  across day boundaries and within a single day (PR #17 §"Why CalVer +
  run_number").
- Good, because the source `manifest.json` no longer needs to be bumped by hand
  (PR #17 §"Summary").
- Neutral, because the workflow has to compute the version at runtime rather
  than relying on a tag — `cut-release.sh` is the supported trigger (PR #17
  §"Summary").

### Confirmation

- "Computes a version of the form `YYYY.M.D.<run_number>` and the matching `v…`
  tag." (PR #17 §"Test plan")
- "Patches `extension/src/manifest.json` (visible in the 'Patch manifest
  version' step log via the trailing `jq '{version, name}'`)." (PR #17 §"Test
  plan")
- "Re-run `scripts/cut-release.sh` immediately and confirm the second release
  gets a higher `run_number` segment, and Chrome treats it as an update." (PR
  #17 §"Test plan")
- A `skills/agent-browser-shield-release/SKILL.md` captures the version format,
  the cut-release flow, and rollback (PR #17 §"Summary").

## Pros and Cons of the Options

### Build-on-tag (`release: published`)

- Bad, because cutting a release requires a hand-bump of `manifest.json` (PR #17
  §"Summary").
- Bad, because hand-cut tags can't encode the `github.run_number`-monotonicity
  guarantee for same-day releases (PR #17 §"Why CalVer + run_number").

### `workflow_dispatch` + CalVer + run_number

- Good, because version ordering is mechanically correct across day boundaries
  and within a single day (PR #17 §"Why CalVer + run_number").
- Good, because the workflow can guarantee invariants (clean tree, auth, branch)
  before dispatching (PR #17 §"Summary": `cut-release.sh` "preflights gh auth,
  branch, dirty tree, sync with origin").
- Neutral, because the source manifest carries a permanent dev placeholder;
  readers have to know CI overwrites it (PR #17 §"Summary").

## More Information

- PR
  [#17 — ci: workflow-driven CalVer release for the extension](https://github.com/pixiebrix/agent-browser-shield/pull/17)
- `skills/agent-browser-shield-release/SKILL.md`
- Source: `.github/workflows/release-extension.yml`, `scripts/cut-release.sh`
