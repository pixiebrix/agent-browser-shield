# Benchmark Harness

Compare agent performance across configurations: extension on/off, model
vendor/size, step budget.

## Files

| File                     | Purpose                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tasks.csv`              | Short login-free tasks (`id, enabled, max_steps, disabled_reason, url, task, success_criteria`). `enabled` (optional, defaults true): set to `false`/`no`/`0` to skip a row without deleting it. `max_steps` (optional): per-task step budget override; empty falls back to the scenario's `max_steps`. `disabled_reason` (optional): free-text documentation of why a row is disabled — not read by the runner. |
| `scenarios.example.yaml` | Scenario definitions — copy and edit.                                                                                                                                                                                                                                                                                                                                                                            |
| `pricing.json`           | USD-per-million-tokens for cost estimation.                                                                                                                                                                                                                                                                                                                                                                      |

## Fetching BU Bench V1

The `scenarios.bu_bench.yaml` scenario runs against Browser Use's BU Bench V1 —
100 real-web tasks shipped upstream as a Fernet-encrypted blob to discourage
scraping into LLM training data. We do **not** redistribute the blob from this
repo. Fetch it on demand:

```sh
uv run scripts/fetch_bu_bench.py
```

The script downloads
`https://raw.githubusercontent.com/browser-use/benchmark/main/BU_Bench_V1.enc`
to `benchmark/BU_Bench_V1.enc`, which is gitignored. The decryption passphrase
is hardcoded in `scripts/_bu_bench.py` (it matches upstream's `run_eval.py`).
Pass `--force` to re-download.

## Workflow

```bash
# 1. Build + package the extension (only needed for scenarios with extension: true)
cd extension && bun run build && bun run package && cd ..

# 2. Run the benchmark (writes to output/results/<run_id>/)
#    Each task is judged inline as soon as it finishes; pass --no-judge to skip.
#    Each (scenario × task) runs N times in fresh sessions (-n / --repetitions,
#    default 3) so a single noisy run can't flip the cell's verdict.
uv run scripts/benchmark_run.py \
    --scenarios benchmark/scenarios.example.yaml \
    --tasks benchmark/tasks.csv \
    --concurrency 25 \
    -n 3

# 3. Render the HTML report (re-runnable mid-benchmark for live partial view)
uv run scripts/benchmark_report.py --run-id <run_id> --open

# 4. (Optional) Backfill verdicts for rows the inline judge couldn't grade
uv run scripts/benchmark_report.py --run-id <run_id> --judge --open

# 5. (Optional) Re-grade everything after changing the judge model or prompt
uv run scripts/benchmark_report.py --run-id <run_id> --judge --rejudge --open
```

## Resume / repair an incomplete run

If a run finished with missing rows (worker crashes, hard-stopped early) or rows
whose `error` field is set (Browserbase disconnect, model-API connection blip),
one command finishes it:

```bash
uv run scripts/benchmark_resume.py --run-id <run_id>
```

It reruns Browserbase only for missing or errored rows — never for rows where
the agent ran to completion but answered wrong or hit `max_steps`. After the
retry pass it auto-backfills any null `judge` / `extracted_answer` /
`blocked_by_defense` fields using the manifest's `judge_model`. Idempotent;
re-running on a complete run is a no-op. Add `--dry-run` to preview the plan.

Retry rows are appended to `results.jsonl`; the report's loader keeps the last
occurrence per `(scenario, task, repetition)` so the file stays append-only
without a destructive rewrite.

## Output

```text
output/results/run_<utc_ts>_<nonce>/
  manifest.json                            # snapshot of scenarios + tasks + git SHA + repetitions
  results.jsonl                            # one line per (scenario, task, repetition) attempt
  events/<scenario>_<task>_r<n>.jsonl      # raw Stagehand event stream per run
  traces/<scenario>__<task>__r<n>/         # built on-demand by build_traces.py (see below)
    summary.json
    steps.json
    messages.json
output/reports/run_<utc_ts>_<nonce>.html   # main matrix report
output/reports/<run_id>__<task>.html       # per-task side-by-side scenario diff
```

`results.jsonl` is flushed after every completed work unit — safe to
read/regenerate the report at any time.

## Diagnosing regressions

When the guarded scenario scores worse than baseline on some task, use the trace
bundle + side-by-side diff to figure out why.

```bash
# Build per-task trace bundles + diff HTML pages. Idempotent. The main report
# also runs this automatically at the end of its render pass.
uv run scripts/build_traces.py --run-id <run_id>

# Open the diff page for one task in your browser
uv run scripts/build_traces.py --run-id <run_id> --task-id wiki-claude --open
```

In the main report, each task row now has:

- **🔍 Diff** — link to the side-by-side scenario diff (`<run_id>__<task>.html`),
  showing per-step actions, reasoning, tool inputs, tool results, and an
  embedded a11y-tree diff between matching `ariaTree` calls on each side.
- **📋 Copy debug prompt** — copies a ready-to-paste Claude Code prompt to the
  clipboard. The prompt names the task and run, lists per-rep judge outcomes,
  points at the trace bundle and diff HTML, and triggers the
  `agent-browser-shield-diagnose` skill so the receiving agent investigates with
  the same framing every time.

Hand a regressed task's trace dir
(`output/results/<run_id>/traces/<scenario>__<task>__r<n>/`) to an LLM and
`steps.json` carries the per-step reasoning + a11y-tree snapshots needed to
explain the divergence.

## Filtering

Both scripts accept glob filters for partial runs:

```bash
uv run scripts/benchmark_run.py ... --scenario 'haiku-*' --task 'hn-*'
```

## Notes

- Scenarios with `extension: true` reuse a single uploaded extension artifact
  per run (one Browserbase upload, N sessions).
- Concurrency defaults to 25 to match the plan's session limit. Lower it if
  Browserbase starts 429ing.
- Token / cost numbers depend on Stagehand emitting usage in its event stream.
  If a row has `tokens_missing: true`, inspect the matching
  `events/<scenario>_<task>_r<n>.jsonl` and adjust the parser.
- The per-task matrix shows each cell as a pass/fail ratio across the N
  repetitions (e.g. `2/3 pass`), with the most-common extracted answer above the
  fold and per-rep details (response + judge reason + session link) under an
  expandable section. A `⚠ varies` badge flags within-cell extracted-answer
  disagreement; the row-level `⚠ discrepancy` badge still flags cross-scenario
  disagreement on the majority extracted value.
- The LLM judge runs inline inside `benchmark_run.py` — each row in
  `results.jsonl` carries a verdict as soon as it lands. The runner never fails
  a task because of a judge error; failed verdicts leave `judge: null` and can
  be backfilled with `benchmark_report.py --judge`. Re-grading every row (after
  changing model / prompt) is `--judge --rejudge` and doesn't burn Browserbase
  sessions.
