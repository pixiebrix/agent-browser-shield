#!/usr/bin/env bash
# One-shot autoresearch loop: 4 preamble variants × 6 tasks × 3 reps,
# routed through the cloudflared LLM proxy. Drops cost_diff.md per
# (variant, task) under output/results/expand_v{N}_{task}/.
#
# trap restores baseline preambles even if a single compare_scenarios.py
# invocation fails, so the working tree never ends up holding a variant.

set -uo pipefail
cd "$(dirname "$0")/.."

PROXY="https://chapel-delivering-dos-revised.trycloudflare.com"
TASKS=(
  wiki-claude
  wikipedia-einstein-advisor
  amazon-headphones
  npm-react-version
  mdn-array-map
  ikea-billy-cheapest-white
)

trap './scripts/_swap_recipe_preamble.py --restore || true' EXIT

run_phase() {
  local idx="$1"; shift
  local label="$1"; shift
  echo
  echo "=================================================================="
  echo "PHASE v${idx} — ${label}"
  echo "=================================================================="
  for task in "${TASKS[@]}"; do
    local run_id="expand_v${idx}_${task}"
    if [ -d "output/results/${run_id}" ] && [ -n "$(ls -A "output/results/${run_id}" 2>/dev/null)" ]; then
      echo "[v${idx}/${task}] SKIP — output/results/${run_id} already populated"
      continue
    fi
    echo
    echo "[v${idx}/${task}] START"
    if uv run scripts/compare_scenarios.py \
        --scenario gpt5-mini-baseline \
        --scenario gpt5-mini-guarded \
        --task "${task}" \
        -n 3 \
        --run-id "${run_id}" \
        --llm-proxy-url "${PROXY}"; then
      echo "[v${idx}/${task}] DONE"
    else
      echo "[v${idx}/${task}] FAILED — continuing to next task"
    fi
  done
}

# v0: baseline (no swap; assumes working tree is clean / matches trunk)
run_phase 0 "baseline (no swap)"

# v1: no-guess
./scripts/_swap_recipe_preamble.py --variant no-guess
run_phase 1 "no-guess"
./scripts/_swap_recipe_preamble.py --restore

# v2: terse-no-guess
./scripts/_swap_recipe_preamble.py --variant terse-no-guess
run_phase 2 "terse-no-guess"
./scripts/_swap_recipe_preamble.py --restore

# v3: search-default
./scripts/_swap_recipe_preamble.py --variant search-default
run_phase 3 "search-default"
./scripts/_swap_recipe_preamble.py --restore

echo
echo "ALL PHASES COMPLETE"
