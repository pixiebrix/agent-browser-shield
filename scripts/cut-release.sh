#!/usr/bin/env bash
# Cut a release of the agent-browser-shield extension.
#
# Triggers .github/workflows/release-extension.yml on main. The workflow
# computes the version (YYYY.M.D.<run_number>), patches the manifest, builds,
# and creates the GitHub Release with the extension zip attached.
#
# Usage:
#   scripts/cut-release.sh           # dispatch and print the run URL
#   scripts/cut-release.sh --watch   # also tail the run until it finishes

set -euo pipefail

WATCH=0
for arg in "$@"; do
  case "$arg" in
    --watch) WATCH=1 ;;
    -h|--help)
      sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 2 ;;
  esac
done

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI not found. Install from https://cli.github.com/." >&2
  exit 1
fi

gh auth status >/dev/null

branch=$(git rev-parse --abbrev-ref HEAD)
if [ "$branch" != "main" ]; then
  echo "Not on main (on $branch). Releases must be cut from main." >&2
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Working tree is dirty. Commit, stash, or revert before releasing." >&2
  exit 1
fi

git fetch origin main --quiet
local_sha=$(git rev-parse HEAD)
remote_sha=$(git rev-parse origin/main)
if [ "$local_sha" != "$remote_sha" ]; then
  echo "Local main ($local_sha) differs from origin/main ($remote_sha)." >&2
  echo "Pull or push so they match before releasing." >&2
  exit 1
fi

repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)

# Capture the most-recent run id before dispatch so we can identify the new one.
before=$(gh run list \
  --workflow=release-extension.yml \
  --limit=1 \
  --json databaseId \
  --jq '.[0].databaseId // 0')

gh workflow run release-extension.yml --ref main
echo "Dispatched release-extension.yml on main."

# Wait for the new run to appear (workflow_dispatch can take a few seconds to
# register the run).
run_id=""
for _ in 1 2 3 4 5 6 7 8 9 10; do
  sleep 2
  candidate=$(gh run list \
    --workflow=release-extension.yml \
    --limit=1 \
    --json databaseId \
    --jq '.[0].databaseId // 0')
  if [ "$candidate" != "$before" ] && [ "$candidate" != "0" ]; then
    run_id="$candidate"
    break
  fi
done

if [ -z "$run_id" ]; then
  echo "Workflow dispatched, but couldn't locate the new run within 20s." >&2
  echo "Check https://github.com/${repo}/actions/workflows/release-extension.yml" >&2
  exit 0
fi

echo "Run: https://github.com/${repo}/actions/runs/${run_id}"

if [ "$WATCH" -eq 1 ]; then
  gh run watch "$run_id" --exit-status
  echo
  echo "Latest release:"
  gh release view --json tagName,url --jq '"  " + .tagName + "  " + .url'
fi
