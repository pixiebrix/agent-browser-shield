---
name: agent-browser-shield-release
description: Cut a release of the agent-browser-shield Chromium extension. CalVer YYYY.M.D.<github.run_number> versioning, workflow-driven — .github/workflows/release-extension.yml computes the version, patches the manifest, builds the ZIP, and creates the GitHub Release with the ZIP attached. Use when the user asks to ship, release, publish, or push a new build of the extension. NOT for editing rule code, running benchmarks, or local-only testing.
---

# Releasing agent-browser-shield

Releases are produced by `.github/workflows/release-extension.yml`. The workflow
computes the version, builds the extension, and creates the GitHub Release with
the ZIP attached. Consumers download from
`https://github.com/pixiebrix/agent-browser-shield/releases/latest/download/agent-browser-shield-extension.zip`
— the `latest` redirect follows the most recent release.

Nothing is tagged or version-bumped in the source tree. The tag, the manifest
`version` field in the shipped ZIP, and the GitHub Release are all created by CI
at the moment of release.

## Version format

`YYYY.M.D.<github.run_number>` — e.g. `2026.5.30.42`. Tag is `v2026.5.30.42`.

- Chrome compares `manifest.version` numerically segment-by-segment, so a larger
  `run_number` is always "newer" — multiple releases on the same day still
  trigger auto-update correctly.
- `github.run_number` is monotonic per-repo across all workflows and never
  resets, so the version is guaranteed to increase even across calendar-edge
  cases.
- The `version` in `extension/src/manifest.json` (currently `0.1.0`) is a dev
  placeholder used when devs sideload `extension/dist/` unpacked. CI overwrites
  it during the release build — **do not** bump it manually as part of cutting a
  release.

## Cutting a release

Preconditions:

- On `main`, working tree clean, in sync with `origin/main`.
- `gh` CLI installed and authenticated (`gh auth status`).
- Every change you want shipped is already merged to `main`.

Run:

```sh
scripts/cut-release.sh           # dispatch and print the run URL
scripts/cut-release.sh --watch   # also block until the workflow finishes
```

The script preflight-checks branch/cleanliness/sync, dispatches the workflow,
finds the new run id, and prints the Actions URL. With `--watch` it tails the
run and prints the resulting release URL at the end.

Direct equivalent:

```sh
gh workflow run release-extension.yml --ref main
```

## What the workflow does

1. Computes `version = $(date -u +%Y.%-m.%-d).${{ github.run_number }}` and
   `tag = v${version}`.
2. `jq`-patches `extension/src/manifest.json` `version` in the runner's
   checkout. Never committed back.
3. `bun install --frozen-lockfile`, `bun run build`, `bun run package` →
   `output/agent-browser-shield-extension.zip`.
4. Creates the GitHub Release at `$GITHUB_SHA` with auto-generated notes and the
   ZIP attached as a release asset.

## Rolling back / re-releasing

There is no "rollback" — every release gets a new version. To ship an older
commit, re-trigger the workflow on that SHA:

```sh
gh workflow run release-extension.yml --ref <sha-or-branch>
```

The new release will have a higher `run_number` than anything before it, so
Chrome will auto-update to it. The previous release's tag and assets stay
published at their versioned URLs; only the `latest` redirect moves.

The script `scripts/cut-release.sh` refuses to run off `main`. To release from a
SHA or branch, invoke `gh workflow run` directly — be sure you know what you're
shipping.

## When NOT to use this skill

- Editing rule code, selectors, or `extension/data/sites/*.yaml` → just edit and
  merge. CI ships them on the next release.
- Local-only testing → `cd extension && bun run build`, then load
  `extension/dist/` unpacked in `chrome://extensions`. No release needed.
- Bumping the source `manifest.json` version → unnecessary, CI overrides it.
- Changes to the release workflow itself → edit
  `.github/workflows/release-extension.yml`. Note that dispatching it (even on a
  branch) **does create a real release** — there is no dry-run mode. Test
  changes by reading the YAML carefully, not by running it.
