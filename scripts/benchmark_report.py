#!/usr/bin/env -S uv run --script
# Copyright (c) 2026 PixieBrix, Inc.
# Licensed under PolyForm Shield 1.0.0 — see LICENSE.

# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "python-dotenv>=1.0.0",
#     "anthropic>=0.40.0",
#     "openai>=1.50.0",
#     "pyyaml>=6.0",
# ]
# ///
"""Render a comparative HTML report from a benchmark run's results.jsonl.

Judging and exact-answer extraction normally happen inline in benchmark_run.py.
Use --judge / --extract here to backfill rows the inline pass couldn't grade
(e.g., API failure), and --rejudge / --reextract to redo every row.

Usage:
  uv run scripts/benchmark_report.py --run-id <run_id>             # render only
  uv run scripts/benchmark_report.py --run-id <run_id> --judge     # grade any un-judged rows
  uv run scripts/benchmark_report.py --run-id <run_id> --judge --rejudge  # re-grade everything
  uv run scripts/benchmark_report.py --run-id <run_id> --extract   # extract canonical answers
  uv run scripts/benchmark_report.py --run-id <run_id> --extract --reextract  # re-extract everything
  uv run scripts/benchmark_report.py --run-id <run_id> --open      # open in browser

Safe to run while benchmark_run.py is still writing — partial results render
with a "Pending" panel listing the (scenario, task) cells not yet completed.
"""

from __future__ import annotations

import argparse
import html
import json
import os
import string
import sys
import webbrowser
from collections.abc import Callable
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parent.parent
RESULTS_ROOT = REPO_ROOT / "output" / "results"
REPORTS_ROOT = REPO_ROOT / "output" / "reports"

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_traces  # noqa: E402
from _blockcheck import call_block_detector, summarize_trajectory  # noqa: E402
from _judge import (  # noqa: E402
    DEFAULT_JUDGE_MODEL,
    call_extractor,
    call_judge,
    load_judge_defaults_from_scenarios,
    resolve_judge_model,
)
from _stagehand import event_to_dict, extract_usage  # noqa: E402

# ---------- Argument parsing ----------


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--run-id", required=True)
    parser.add_argument(
        "--judge",
        action="store_true",
        help="Run the LLM-as-judge pass over un-judged rows before rendering.",
    )
    parser.add_argument(
        "--rejudge",
        action="store_true",
        help="With --judge, re-judge rows that already have a verdict.",
    )
    parser.add_argument(
        "--extract",
        action="store_true",
        help="Run the LLM-as-extractor pass to pull a canonical single answer "
        "from each row's final_answer (uses --judge-model).",
    )
    parser.add_argument(
        "--reextract",
        action="store_true",
        help="With --extract, re-extract rows that already have an extracted_answer.",
    )
    parser.add_argument(
        "--detect-blocks",
        action="store_true",
        help="Run the LLM-as-block-detector pass over rows missing a "
        "blocked_by_defense verdict (uses --judge-model).",
    )
    parser.add_argument(
        "--redetect",
        action="store_true",
        help="With --detect-blocks, re-detect rows that already have a blocked_by_defense verdict.",
    )
    parser.add_argument(
        "--backfill-tokens",
        action="store_true",
        help="Re-aggregate token usage (input/output/cached/cache_creation/"
        "reasoning) from each row's event log. Use to add cached/reasoning "
        "fields to rows written before they were tracked. No LLM calls.",
    )
    parser.add_argument(
        "--judge-model",
        default=None,
        help=f"Override judge/extractor model (default: defaults.judge_model "
        f"from scenarios file or {DEFAULT_JUDGE_MODEL}).",
    )
    parser.add_argument(
        "--open",
        action="store_true",
        help="Open the rendered report in the default browser.",
    )
    return parser.parse_args()


# ---------- JSONL I/O ----------


def _rep_index(row: dict[str, Any]) -> int:
    """Repetition index, defaulting to 1 for missing or null values."""
    return int(row.get("repetition") or 1)


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    """Read results.jsonl, deduping by (scenario_id, task_id, repetition).

    Last occurrence wins so benchmark_resume.py can append retry rows
    without rewriting the file. First-seen order is preserved so the
    rendered report stays visually stable across resumes.
    """
    if not path.is_file():
        return []
    by_key: dict[tuple[str, str, int], dict[str, Any]] = {}
    order: list[tuple[str, str, int]] = []
    for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError as exc:
            print(f"warning: {path}:{line_no} invalid json: {exc}", file=sys.stderr)
            continue
        # Backward compat: pre-repetitions runs had no `repetition` field.
        row.setdefault("repetition", 1)
        key = (
            str(row.get("scenario_id") or ""),
            str(row.get("task_id") or ""),
            _rep_index(row),
        )
        if key not in by_key:
            order.append(key)
        by_key[key] = row
    return [by_key[k] for k in order]


def write_jsonl_atomic(path: Path, rows: list[dict[str, Any]]) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps(row, default=str, sort_keys=True) + "\n")
        fh.flush()
        os.fsync(fh.fileno())
    tmp.replace(path)


# ---------- Aggregation helpers ----------


def _avg(xs: list[Any]) -> float | None:
    return sum(xs) / len(xs) if xs else None


def _total(xs: list[Any]) -> float | None:
    return sum(xs) if xs else None


# ---------- Formatters ----------


def fmt_int(n: Any) -> str:
    if n is None:
        return "—"
    return f"{int(n):,}"


def fmt_money(n: Any) -> str:
    if n is None:
        return "—"
    return f"${float(n):.4f}"


def fmt_secs(n: Any) -> str:
    if n is None:
        return "—"
    return f"{float(n):.1f}s"


def fmt_pct(num: int, den: int) -> str:
    if den == 0:
        return "—"
    return f"{(num / den) * 100:.0f}% ({num}/{den})"


def fmt_steps(n: Any) -> str:
    """Step count, treating None as 0 (matches scenario_summary)."""
    return str(int(n or 0))


# ---------- Consensus & blocking ----------


_CONSENSUS_TRIM = string.whitespace + string.punctuation


def _rep_blocked_failure(r: dict[str, Any]) -> bool:
    """True iff the block detector flagged a defense AND the run was not
    ultimately judged a pass.

    We only surface 'blocked' as an outcome — a rep that hit a Cloudflare
    challenge but still produced the correct answer doesn't count, since
    the defense didn't actually prevent success. Ungraded/errored reps
    with a block verdict do count (they were not a success).
    """
    block = r.get("blocked_by_defense") or {}
    if block.get("blocked") is not True:
        return False
    verdict = r.get("judge") or {}
    return verdict.get("pass") is not True


def _normalize_for_consensus(s: Any) -> str | None:
    """Comparable form of an extracted value: strip ALL whitespace (incl.
    internal), trim leading/trailing punctuation, lowercase. Returns None
    for None or empty-after-normalize so callers can skip non-values
    without an extra guard.

    Whitespace inside the value is ignored so that e.g. "15 3/4×11×41 3/4"
    and "15  3/4 × 11 × 41 3/4" collapse to the same consensus key.
    """
    if s is None:
        return None
    no_ws = "".join(str(s).split())
    stripped = no_ws.strip(_CONSENSUS_TRIM)
    if not stripped:
        return None
    return stripped.lower()


def compute_task_modes(rows: list[dict[str, Any]], task_ids: list[str]) -> dict[str, set[str]]:
    """Aggregate every run of every task to find the 'mode' answer per task.

    Returns mode_set_by_tid: tid → set of normalized values tied for max
    count across ALL runs of that task (all scenarios × all reps). Tasks
    with no extractable runs are omitted, so callers can use
    `tid in mode_set_by_tid` as the extractable check.
    """
    counts_by_tid: dict[str, dict[str, int]] = {tid: {} for tid in task_ids}
    for r in rows:
        tid = r.get("task_id")
        if tid not in counts_by_tid:
            continue
        ea = r.get("extracted_answer") or {}
        if not ea.get("extractable"):
            continue
        norm = _normalize_for_consensus(ea.get("value"))
        if norm is None:
            continue
        counts_by_tid[tid][norm] = counts_by_tid[tid].get(norm, 0) + 1

    mode_set_by_tid: dict[str, set[str]] = {}
    for tid, counts in counts_by_tid.items():
        if not counts:
            continue
        max_n = max(counts.values())
        mode_set_by_tid[tid] = {k for k, n in counts.items() if n == max_n}
    return mode_set_by_tid


def consensus_match_stats(
    scenario_rows: list[dict[str, Any]],
    mode_set_by_tid: dict[str, set[str]],
) -> tuple[int, int]:
    """Count (matched, total) for one scenario.

    `total` counts every run whose task has a computed mode (errored/no-value
    runs included — they contribute 0 to matched). `matched` counts runs
    whose normalized extracted value sits in that task's mode set."""
    matched = 0
    total = 0
    for r in scenario_rows:
        tid = r.get("task_id")
        if tid not in mode_set_by_tid:
            continue
        total += 1
        ea = r.get("extracted_answer") or {}
        norm = _normalize_for_consensus(ea.get("value"))
        if norm is not None and norm in mode_set_by_tid[tid]:
            matched += 1
    return matched, total


# ---------- Cell & scenario summaries ----------


def cell_summary(reps: list[dict[str, Any]]) -> dict[str, Any]:
    """Aggregate the N repetitions of one (scenario, task) cell.

    Returned shape:
      reps:                rows sorted by repetition
      pass_count, fail_count, ungraded_count, error_count, completed_count
      blocked_count:       reps where blocked_by_defense.blocked is True AND
                           the run was not ultimately a pass
      blocked_types:       set of distinct defense_type strings (incl.
                           "unknown" when blocked but no type given)
      extracted_values:    distinct non-null extracted values (first-seen
                           original per normalized key), in first-seen order
      extracted_norm_counts: norm key -> count within this cell
      majority_extracted:  original-form value whose norm key has the max
                           count (ties broken by first-seen order)
      avg_tokens, avg_cost, avg_steps, avg_duration
      within_cell_discrepancy: True iff >=2 distinct normalized values
      errored_all:         True iff every rep errored
    """
    reps_sorted = sorted(reps, key=_rep_index)
    pass_count = fail_count = ungraded_count = error_count = completed_count = 0
    blocked_count = 0
    blocked_types: set[str] = set()
    extracted_values: list[str] = []
    norm_counts: dict[str, int] = {}
    tokens: list[int] = []
    costs: list[float] = []
    steps: list[int] = []
    durations: list[float] = []
    for r in reps_sorted:
        if r.get("error"):
            error_count += 1
        else:
            verdict = r.get("judge") or {}
            if verdict.get("pass") is True:
                pass_count += 1
            elif verdict.get("pass") is False:
                fail_count += 1
            else:
                ungraded_count += 1
            if r.get("completed_within_budget"):
                completed_count += 1
        if _rep_blocked_failure(r):
            blocked_count += 1
            block = r.get("blocked_by_defense") or {}
            blocked_types.add(str(block.get("defense_type") or "unknown"))
        ea = r.get("extracted_answer") or {}
        if ea.get("extractable") and ea.get("value") is not None:
            val = str(ea["value"])
            norm = _normalize_for_consensus(val)
            if norm is not None:
                if norm not in norm_counts:
                    extracted_values.append(val)
                norm_counts[norm] = norm_counts.get(norm, 0) + 1
        toks = r.get("tokens") or {}
        if toks.get("total") is not None:
            tokens.append(int(toks["total"]))
        if r.get("cost_usd") is not None:
            costs.append(float(r["cost_usd"]))
        if r.get("steps_taken") is not None:
            steps.append(int(r["steps_taken"] or 0))
        if r.get("duration_s") is not None:
            durations.append(float(r["duration_s"]))

    majority: str | None = None
    if norm_counts:
        max_n = max(norm_counts.values())
        for val in extracted_values:
            norm = _normalize_for_consensus(val)
            if norm is not None and norm_counts[norm] == max_n:
                majority = val
                break

    return {
        "reps": reps_sorted,
        "pass_count": pass_count,
        "fail_count": fail_count,
        "ungraded_count": ungraded_count,
        "error_count": error_count,
        "completed_count": completed_count,
        "blocked_count": blocked_count,
        "blocked_types": blocked_types,
        "extracted_values": extracted_values,
        "extracted_norm_counts": norm_counts,
        "majority_extracted": majority,
        "avg_tokens": _avg(tokens),
        "avg_cost": _avg(costs),
        "avg_steps": _avg(steps),
        "avg_duration": _avg(durations),
        "within_cell_discrepancy": len(norm_counts) >= 2,
        "errored_all": error_count == len(reps_sorted) and len(reps_sorted) > 0,
    }


def scenario_summary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Single-pass aggregation across one scenario's rows.

    `completed_within_budget` is counted only for rows without an error,
    matching cell_summary's semantics.
    """
    n = len(rows)
    passed = judged = errored = blocked = block_judged = completed = 0
    total_tokens: list[int] = []
    input_tokens: list[int] = []
    output_tokens: list[int] = []
    cached_tokens: list[int] = []
    costs: list[float] = []
    pass_costs: list[float] = []
    steps: list[int] = []
    durations: list[float] = []

    for r in rows:
        verdict = r.get("judge") or {}
        if r.get("judge") is not None:
            judged += 1
        passed_this = verdict.get("pass") is True
        if passed_this:
            passed += 1
        has_error = r.get("error") is not None
        if has_error:
            errored += 1
        if r.get("blocked_by_defense") is not None:
            block_judged += 1
        if _rep_blocked_failure(r):
            blocked += 1
        if not has_error and r.get("completed_within_budget"):
            completed += 1
        toks = r.get("tokens") or {}
        if toks.get("total") is not None:
            total_tokens.append(int(toks["total"]))
        if toks.get("input") is not None:
            input_tokens.append(int(toks["input"]))
        if toks.get("output") is not None:
            output_tokens.append(int(toks["output"]))
        if toks.get("cached") is not None:
            cached_tokens.append(int(toks["cached"]))
        cost = r.get("cost_usd")
        if cost is not None:
            costs.append(float(cost))
            if passed_this:
                pass_costs.append(float(cost))
        steps.append(int(r.get("steps_taken") or 0))
        dur = r.get("duration_s")
        if dur:
            durations.append(float(dur))

    return {
        "runs": n,
        "errored": errored,
        "judged": judged,
        "passed": passed,
        "blocked": blocked,
        "block_judged": block_judged,
        "completed_within_budget": completed,
        "total_tokens": _total(total_tokens),
        "total_input_tokens": _total(input_tokens),
        "total_output_tokens": _total(output_tokens),
        "total_cached_tokens": _total(cached_tokens),
        "total_cost": _total(costs),
        "total_steps": _total(steps),
        "total_duration": _total(durations),
        "avg_tokens": _avg(total_tokens),
        "avg_input_tokens": _avg(input_tokens),
        "avg_output_tokens": _avg(output_tokens),
        "avg_cached_tokens": _avg(cached_tokens),
        "cache_hit_pct": (
            100.0 * sum(cached_tokens) / sum(input_tokens)
            if cached_tokens and sum(input_tokens) > 0
            else None
        ),
        "avg_cost": _avg(costs),
        "avg_cost_pass": _avg(pass_costs),
        "avg_cost_pass_n": len(pass_costs),
        "avg_steps": _avg(steps),
        "avg_duration": _avg(durations),
    }


# ---------- Backfill passes ----------


def _backfill(
    *,
    results_path: Path,
    rows: list[dict[str, Any]],
    name: str,
    is_pending: Callable[[dict[str, Any]], bool],
    process: Callable[[dict[str, Any], dict[str, Any]], str],
    judge_model: str,
) -> int:
    """Generic backfill loop: filter pending rows, run `process(row, task_def)`
    on each (which mutates the row and returns a human-readable status), then
    persist atomically. Per-row errors are caught and logged."""
    pending = [row for row in rows if is_pending(row)]
    if not pending:
        print(f"no rows need {name}")
        return 0

    print(f"{name} {len(pending)} rows with {judge_model}...")
    manifest = json.loads((results_path.parent / "manifest.json").read_text())
    task_by_id = {t["id"]: t for t in manifest.get("tasks", [])}

    processed = 0
    for row in pending:
        label = f"{row.get('scenario_id', '')}/{row.get('task_id', '')}_r{_rep_index(row)}"
        task_def = task_by_id.get(row.get("task_id"))
        if not task_def:
            print(f"  skip {label}: no task def in manifest")
            continue
        try:
            status = process(row, task_def)
            processed += 1
            print(f"  {label}: {status}")
        except Exception as exc:
            print(f"  ERR {label}: {exc}", file=sys.stderr)

    write_jsonl_atomic(results_path, rows)
    return processed


def run_judge(
    results_path: Path,
    rows: list[dict[str, Any]],
    *,
    judge_model: str,
    rejudge: bool,
) -> int:
    def is_pending(row: dict[str, Any]) -> bool:
        return (
            row.get("error") is None
            and row.get("final_answer") is not None
            and (rejudge or row.get("judge") is None)
        )

    def process(row: dict[str, Any], task_def: dict[str, Any]) -> str:
        verdict = call_judge(
            judge_model,
            task_def["task"],
            task_def["success_criteria"],
            row.get("final_answer"),
        )
        row["judge"] = verdict.to_record()
        return f"{'PASS' if verdict.passed else 'FAIL'} — {verdict.reason}"

    return _backfill(
        results_path=results_path,
        rows=rows,
        name="judging",
        is_pending=is_pending,
        process=process,
        judge_model=judge_model,
    )


def run_extractor(
    results_path: Path,
    rows: list[dict[str, Any]],
    *,
    judge_model: str,
    reextract: bool,
) -> int:
    def is_pending(row: dict[str, Any]) -> bool:
        return (
            row.get("error") is None
            and row.get("final_answer") is not None
            and (reextract or row.get("extracted_answer") is None)
        )

    def process(row: dict[str, Any], task_def: dict[str, Any]) -> str:
        extracted = call_extractor(
            judge_model,
            task_def["task"],
            task_def["success_criteria"],
            row.get("final_answer"),
        )
        row["extracted_answer"] = extracted.to_record()
        if extracted.extractable:
            return f"EXT  {extracted.value!r}"
        return f"SKIP open-ended ({extracted.reason})"

    return _backfill(
        results_path=results_path,
        rows=rows,
        name="extracting",
        is_pending=is_pending,
        process=process,
        judge_model=judge_model,
    )


def run_block_detector(
    results_path: Path,
    rows: list[dict[str, Any]],
    *,
    judge_model: str,
    redetect: bool,
) -> int:
    """Backfill blocked_by_defense verdicts on successful rows that don't have
    one. Errored rows are skipped — the runner's inline call only fires on
    success, so its backfill should match. Use this for rows written before
    the field existed, or when the inline LLM call failed."""
    events_dir = results_path.parent / "events"

    def is_pending(row: dict[str, Any]) -> bool:
        return row.get("error") is None and (redetect or row.get("blocked_by_defense") is None)

    def process(row: dict[str, Any], task_def: dict[str, Any]) -> str:
        event_path = events_dir / build_traces.events_filename(
            row.get("scenario_id") or "",
            row.get("task_id") or "",
            _rep_index(row),
        )
        trajectory = summarize_trajectory(event_path)
        verdict = call_block_detector(
            judge_model,
            task_def["task"],
            trajectory,
            row.get("final_answer"),
        )
        row["blocked_by_defense"] = verdict.to_record()
        if verdict.blocked:
            return f"BLOCK {verdict.defense_type} — {verdict.reason}"
        return "ok    not blocked"

    return _backfill(
        results_path=results_path,
        rows=rows,
        name="detecting blocks on",
        is_pending=is_pending,
        process=process,
        judge_model=judge_model,
    )


def run_backfill_tokens(results_path: Path, rows: list[dict[str, Any]]) -> int:
    """Re-aggregate token usage from each row's event log.

    Reads `events/{scenario}_{task}_r{rep}.jsonl`, applies `extract_usage` to
    each event, sums input/output/cached/cache_creation/reasoning, and writes
    the merged `tokens` dict back to the row. Pure local work — no LLM calls.
    """
    events_dir = results_path.parent / "events"
    if not events_dir.is_dir():
        print(f"no events directory at {events_dir}; nothing to backfill")
        return 0

    updated = 0
    for row in rows:
        event_path = events_dir / build_traces.events_filename(
            row.get("scenario_id") or "",
            row.get("task_id") or "",
            _rep_index(row),
        )
        if not event_path.is_file():
            continue
        agg: dict[str, int] = {"input": 0, "output": 0, "total": 0}
        agg_opt: dict[str, int] = {}
        any_usage = False
        for line in event_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                event_dict = event_to_dict(json.loads(line))
            except json.JSONDecodeError:
                continue
            usage = extract_usage(event_dict)
            if not usage:
                continue
            any_usage = True
            agg["input"] += usage["input"]
            agg["output"] += usage["output"]
            agg["total"] += usage["total"]
            for k in ("cached", "cache_creation", "reasoning"):
                if k in usage:
                    agg_opt[k] = agg_opt.get(k, 0) + usage[k]
        if any_usage:
            row["tokens"] = {**agg, **agg_opt}
            row["tokens_missing"] = False
            updated += 1

    write_jsonl_atomic(results_path, rows)
    print(f"backfilled tokens on {updated} rows")
    return updated


# ---------- Prompt builders ----------


_DIAGNOSE_TRAILER = (
    "Reference the `agent-browser-shield` skill for DOM-marker semantics when "
    "interpreting the guarded a11y-tree snapshots. Report back with "
    "concrete step indices and the specific a11y-tree delta that caused "
    "the divergence — don't speculate beyond what the trace shows."
)


def _trace_path_lines(run_id: str, tid: str) -> list[str]:
    return [
        "The structured trace bundles live under:",
        f"  output/results/{run_id}/traces/<scenario>__{tid}__r<n>/",
        "",
        "The side-by-side HTML diff is at:",
        f"  output/reports/{run_id}__{tid}.html",
    ]


def _per_scenario_lines(
    scenario_ids: list[str],
    scenario_by_id: dict[str, dict[str, Any]],
    summary_by_key: dict[tuple[str, str], dict[str, Any]],
    tid: str,
    scenario_header: Callable[[str, dict[str, Any], dict[str, Any]], str],
    rep_line: Callable[[int, dict[str, Any]], str],
) -> list[str]:
    """Render the per-scenario, per-rep block shared by both diagnosis prompts.
    `scenario_header` builds the bullet line for each scenario; `rep_line`
    builds the indented line per repetition."""
    lines: list[str] = []
    for sid in scenario_ids:
        s_def = scenario_by_id.get(sid) or {}
        summ = summary_by_key.get((sid, tid)) or {}
        lines.append("")
        lines.append(scenario_header(sid, s_def, summ))
        for r in summ.get("reps") or []:
            lines.append(rep_line(_rep_index(r), r))
    return lines


def build_debug_prompt(
    *,
    run_id: str,
    task_def: dict[str, Any],
    scenario_ids: list[str],
    scenario_by_id: dict[str, dict[str, Any]],
    summary_by_key: dict[tuple[str, str], dict[str, Any]],
) -> str:
    """Render a ready-to-paste Claude Code prompt for diagnosing this task.

    Lists per-scenario, per-rep judge outcomes and points at the trace bundle +
    diff HTML so the receiving agent has concrete file paths to read. Triggers
    the `agent-browser-shield-diagnose` skill via explicit mention."""
    tid = task_def.get("id") or ""

    def header(sid: str, s_def: dict[str, Any], summ: dict[str, Any]) -> str:
        ext = "on" if s_def.get("extension") else "off"
        model = s_def.get("model") or "?"
        pass_count = summ.get("pass_count", 0)
        fail_count = summ.get("fail_count", 0)
        judged = pass_count + fail_count
        return (
            f"- scenario={sid} (extension={ext}, model={model}) — "
            f"{pass_count}/{judged} judged passed"
        )

    def rep(rep_idx: int, r: dict[str, Any]) -> str:
        err = r.get("error")
        if err:
            return f"  - r{rep_idx}: error · {err}"
        verdict = r.get("judge") or {}
        if verdict.get("pass") is True:
            status = "pass"
        elif verdict.get("pass") is False:
            status = "fail"
        else:
            status = "ungraded"
        ea = r.get("extracted_answer") or {}
        extracted = "—"
        if ea.get("extractable") and ea.get("value") is not None:
            extracted = str(ea["value"])
        reason = (verdict.get("reason") or "").strip().replace("\n", " ")
        if len(reason) > 200:
            reason = reason[:200] + "..."
        reason_part = f" · reason={reason}" if reason else ""
        return f"  - r{rep_idx}: {status} · extracted={extracted}{reason_part}"

    lines: list[str] = [
        f"Diagnose why task `{tid}` regressed (or underperformed) in benchmark run `{run_id}`.",
        "",
        f"Task: {(task_def.get('task') or '').strip()}",
    ]
    crit = (task_def.get("success_criteria") or "").strip()
    if crit:
        lines.append(f"Success criteria: {crit}")
    lines += ["", f"Per-scenario results (run_id={run_id}):"]
    lines += _per_scenario_lines(scenario_ids, scenario_by_id, summary_by_key, tid, header, rep)
    lines += [
        "",
        "Use the `agent-browser-shield-diagnose` skill to investigate. The structured "
        "trace bundles live under:",
        f"  output/results/{run_id}/traces/<scenario>__{tid}__r<n>/",
        "",
        "The side-by-side HTML diff is at:",
        f"  output/reports/{run_id}__{tid}.html",
        "",
        _DIAGNOSE_TRAILER,
    ]
    return "\n".join(lines)


def build_cost_diagnosis_prompt(
    *,
    run_id: str,
    task_def: dict[str, Any],
    scenario_ids: list[str],
    scenario_by_id: dict[str, dict[str, Any]],
    summary_by_key: dict[tuple[str, str], dict[str, Any]],
) -> str:
    """Render a ready-to-paste Claude Code prompt for diagnosing why the
    guarded scenarios spent more tokens / steps / cost than baseline on this
    task. Surfaces per-scenario averages, per-rep usage, and the
    guarded-vs-baseline cost delta so the receiving agent can hunt for the
    proximate cause in the trace bundle. Triggers the `agent-browser-shield-diagnose`
    skill via explicit mention."""
    tid = task_def.get("id") or ""
    guarded_tokens: list[float] = []
    baseline_tokens: list[float] = []

    def header(sid: str, s_def: dict[str, Any], summ: dict[str, Any]) -> str:
        guarded = bool(s_def.get("extension"))
        if summ.get("avg_tokens") is not None:
            (guarded_tokens if guarded else baseline_tokens).append(float(summ["avg_tokens"]))
        label = "guarded" if guarded else "baseline"
        model = s_def.get("model") or "?"
        return (
            f"- scenario={sid} ({label}, model={model}) — "
            f"avg {fmt_int(summ.get('avg_tokens'))} tok · "
            f"{fmt_money(summ.get('avg_cost'))} · "
            f"{fmt_int(summ.get('avg_steps'))} steps · "
            f"{fmt_secs(summ.get('avg_duration'))}"
        )

    def rep(rep_idx: int, r: dict[str, Any]) -> str:
        if r.get("error"):
            return f"  - r{rep_idx}: error · {r['error']}"
        toks = r.get("tokens") or {}
        return (
            f"  - r{rep_idx}: {fmt_int(toks.get('total'))} tok "
            f"(in {fmt_int(toks.get('input'))} / "
            f"out {fmt_int(toks.get('output'))}) · "
            f"{fmt_money(r.get('cost_usd'))} · "
            f"{fmt_steps(r.get('steps_taken'))} steps · "
            f"{fmt_secs(r.get('duration_s'))}"
        )

    lines: list[str] = [
        f"Diagnose why the guarded scenarios spent more tokens / steps / cost "
        f"than baseline on task `{tid}` in benchmark run `{run_id}`.",
        "",
        f"Task: {(task_def.get('task') or '').strip()}",
        "",
        f"Per-scenario cost (run_id={run_id}):",
    ]
    lines += _per_scenario_lines(scenario_ids, scenario_by_id, summary_by_key, tid, header, rep)

    if guarded_tokens and baseline_tokens:
        g_avg = sum(guarded_tokens) / len(guarded_tokens)
        b_avg = sum(baseline_tokens) / len(baseline_tokens)
        delta = g_avg - b_avg
        pct = (delta / b_avg * 100.0) if b_avg else 0.0
        lines += [
            "",
            f"Guarded vs baseline avg tokens: "
            f"{fmt_int(g_avg)} vs {fmt_int(b_avg)} "
            f"(Δ {fmt_int(delta)}, {pct:+.0f}%)",
        ]

    lines += [
        "",
        "Use the `agent-browser-shield-diagnose` skill to investigate. Focus on cost "
        "(not pass/fail). Likely shapes to look for:",
        "  - Larger guarded a11y trees — more markers / less aggressive hiding "
        "means each `ariaTree` step ships more context to the model. Compare "
        "`tool_result.text` length on matched `ariaTree` steps.",
        "  - Extra steps on the guarded side — agent re-queries, retries, or "
        "fails to recognize `agent-browser-shield-placeholder` markers and burns steps "
        "exploring before acting.",
        "  - Detour caused by a defense rule — a dark-pattern block or PII "
        "mask sent the agent down a longer path than the unmodified page.",
        "",
    ]
    lines += _trace_path_lines(run_id, tid)
    lines += [
        "",
        "Reference the `agent-browser-shield` skill for DOM-marker semantics. Report "
        "back with concrete step indices and the specific source of the "
        "extra tokens / steps — don't speculate beyond what the trace shows.",
    ]
    return "\n".join(lines)


# ---------- HTML rendering ----------


CSS = """
:root {
  --bg: #0f1115;
  --panel: #171a21;
  --panel-2: #1f232c;
  --border: #2a2f3a;
  --text: #e8ebf0;
  --muted: #8b93a3;
  --accent: #7dd3fc;
  --pass: #4ade80;
  --fail: #f87171;
  --pending: #fbbf24;
  --error: #f87171;
}
* { box-sizing: border-box; }
body {
  background: var(--bg); color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  margin: 0; padding: 24px;
}
h1, h2 { margin: 0 0 12px; font-weight: 600; }
h1 { font-size: 22px; }
h2 { font-size: 16px; margin-top: 24px; color: var(--accent); }
.muted { color: var(--muted); font-size: 13px; }
.panel { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin-bottom: 16px; }
table { border-collapse: collapse; width: 100%; font-size: 13px; }
th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--border); vertical-align: top; }
th { background: var(--panel-2); color: var(--muted); font-weight: 500; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
tr:last-child td { border-bottom: none; }
td.num { text-align: right; font-variant-numeric: tabular-nums; font-family: "SF Mono", Menlo, monospace; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
.badge.pass { background: rgba(74, 222, 128, 0.15); color: var(--pass); }
.badge.fail { background: rgba(248, 113, 113, 0.15); color: var(--fail); }
.badge.pending { background: rgba(251, 191, 36, 0.15); color: var(--pending); }
.badge.error { background: rgba(248, 113, 113, 0.15); color: var(--error); }
.badge.warn { background: rgba(251, 191, 36, 0.18); color: var(--pending); }
.badge.blocked { background: rgba(249, 115, 22, 0.18); color: #fb923c; }
.matrix td { font-size: 12px; }
.matrix .cell { display: flex; flex-direction: column; gap: 4px; max-width: 320px; }
.matrix .cell .meta { color: var(--muted); font-size: 11px; }
.matrix .cell .reason {
  font-size: 11px; line-height: 1.35;
  color: var(--muted);
  border-left: 2px solid var(--border);
  padding-left: 6px; margin-top: 2px;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
  overflow: hidden;
}
.matrix .cell .reason.fail {
  color: var(--fail);
  border-left-color: var(--fail);
}
.matrix .cell .answer {
  font-size: 12px; line-height: 1.4;
  color: var(--text);
  background: var(--panel-2);
  border-left: 2px solid var(--accent);
  padding: 4px 6px; margin-top: 4px;
  border-radius: 0 4px 4px 0;
  display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: pre-wrap; word-break: break-word;
}
.matrix .cell .answer.empty {
  color: var(--muted); font-style: italic;
  background: transparent; border-left-color: var(--border);
}
.matrix .cell .extracted {
  font-size: 11px; line-height: 1.4;
  color: var(--accent);
  margin-top: 4px;
  font-family: "SF Mono", Menlo, monospace;
}
.matrix .cell .extracted .label {
  color: var(--muted); font-family: inherit;
  font-size: 10px; text-transform: uppercase;
  letter-spacing: 0.04em; margin-right: 4px;
}
.matrix .cell .extracted.outlier {
  color: var(--pending);
}
.matrix .cell .extracted.outlier .label {
  color: var(--pending);
}
.matrix tr.discrepancy td:first-child {
  border-left: 2px solid var(--pending);
}
.matrix .cell details {
  margin-top: 6px;
}
.matrix .cell details > summary {
  font-size: 11px; color: var(--muted);
  list-style: none;
}
.matrix .cell details > summary::-webkit-details-marker { display: none; }
.matrix .cell details > summary::before {
  content: "▶"; display: inline-block;
  margin-right: 4px; font-size: 9px;
  transform: translateY(-1px);
  transition: transform 0.1s ease;
}
.matrix .cell details[open] > summary::before {
  transform: rotate(90deg) translateX(-1px);
}
.matrix .cell .rep {
  display: flex; flex-direction: column; gap: 3px;
  padding: 6px 8px; margin-top: 6px;
  background: var(--panel-2); border-radius: 4px;
  border-left: 2px solid var(--border);
}
.matrix .cell .rep.pass { border-left-color: var(--pass); }
.matrix .cell .rep.fail { border-left-color: var(--fail); }
.matrix .cell .rep.error { border-left-color: var(--error); }
.matrix .cell .rep .rep-head {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px;
}
.matrix .cell .rep .rep-idx {
  font-family: "SF Mono", Menlo, monospace;
  color: var(--muted); font-size: 11px;
}
.matrix .cell .rep .answer,
.matrix .cell .rep .reason,
.matrix .cell .rep .extracted {
  margin-top: 2px;
}
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
details { margin-top: 12px; }
details summary { cursor: pointer; color: var(--muted); font-size: 13px; }
.error-row { background: rgba(248, 113, 113, 0.05); }
.kvp { display: grid; grid-template-columns: 160px 1fr; gap: 4px 16px; font-size: 13px; }
.kvp dt { color: var(--muted); }
.kvp dd { margin: 0; font-family: "SF Mono", Menlo, monospace; font-size: 12px; word-break: break-all; }
.toolbar { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; }
.toolbar .muted { margin-right: 4px; }
.toggle {
  background: var(--panel-2); color: var(--muted);
  border: 1px solid var(--border); border-radius: 4px;
  padding: 4px 10px; font-size: 12px; cursor: pointer;
  font-family: inherit;
}
.toggle:hover { color: var(--text); }
.toggle.active {
  background: var(--accent); color: var(--bg);
  border-color: var(--accent);
}
.scoreboard.mode-total .v-avg { display: none; }
.scoreboard.mode-avg .v-total { display: none; }
.task-actions { display: flex; gap: 6px; margin-top: 6px; }
.task-action {
  background: var(--panel-2); color: var(--accent);
  border: 1px solid var(--border); border-radius: 4px;
  padding: 3px 8px; font-size: 11px; cursor: pointer;
  font-family: inherit; text-decoration: none;
  display: inline-flex; align-items: center; gap: 4px;
}
.task-action:hover { color: var(--text); border-color: var(--accent); }
.task-action.copy-prompt.copied {
  color: var(--pass); border-color: var(--pass);
}
"""


SCRIPT = """
<script>
document.querySelectorAll('.toolbar .toggle').forEach(function(btn){
  btn.addEventListener('click', function(){
    var mode = btn.dataset.mode;
    var board = document.querySelector('.scoreboard');
    if (!board) return;
    board.classList.remove('mode-total', 'mode-avg');
    board.classList.add('mode-' + mode);
    btn.parentElement.querySelectorAll('.toggle').forEach(function(b){
      var on = b === btn;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  });
});
document.querySelectorAll('.copy-prompt').forEach(function(btn){
  btn.addEventListener('click', function(){
    var text = btn.dataset.prompt || '';
    if (!text) return;
    navigator.clipboard.writeText(text).then(function(){
      var label = btn.querySelector('.copy-label');
      if (!label) return;
      var orig = label.textContent;
      label.textContent = '✓ Copied';
      btn.classList.add('copied');
      setTimeout(function(){ label.textContent = orig;
        btn.classList.remove('copied'); }, 1500);
    }).catch(function(err){
      console.error('clipboard write failed:', err);
    });
  });
});
</script>
"""


def _dual_th(total_label: str, avg_label: str, *, title: str | None = None) -> str:
    title_attr = f" title='{html.escape(title)}'" if title else ""
    return (
        f"<th class='num'{title_attr}>"
        f"<span class='v-total'>{html.escape(total_label)}</span>"
        f"<span class='v-avg'>{html.escape(avg_label)}</span>"
        "</th>"
    )


def _dual_cell(total_val: str, avg_val: str) -> str:
    return (
        "<td class='num'>"
        f"<span class='v-total'>{total_val}</span>"
        f"<span class='v-avg'>{avg_val}</span>"
        "</td>"
    )


def _render_rep(rep: dict[str, Any], discrepancy_norms: set[str]) -> str:
    """Render one repetition's expanded block inside a cell's <details>.

    `discrepancy_norms` holds the normalized forms (case/punct/whitespace-
    folded) considered outliers — a rep's value is flagged if its own
    normalized form is in that set."""
    rep_idx = _rep_index(rep)
    if rep.get("error"):
        return (
            f"<div class='rep error'>"
            f"<div class='rep-head'>"
            f"<span class='rep-idx'>#{rep_idx}</span>"
            f"<span class='badge error'>error</span>"
            f"</div>"
            f"<span class='meta' title='{html.escape(rep['error'])}'>"
            f"{html.escape(rep['error'][:120])}</span>"
            f"</div>"
        )
    verdict = rep.get("judge") or {}
    if verdict.get("pass") is True:
        badge = "<span class='badge pass'>pass</span>"
        rep_class = "rep pass"
    elif verdict.get("pass") is False:
        badge = "<span class='badge fail'>fail</span>"
        rep_class = "rep fail"
    else:
        badge = "<span class='badge pending'>ungraded</span>"
        rep_class = "rep"
    if _rep_blocked_failure(rep):
        block = rep.get("blocked_by_defense") or {}
        defense_type = str(block.get("defense_type") or "blocked")
        block_reason = (block.get("reason") or "").strip()
        badge += (
            f" <span class='badge blocked' "
            f"title='{html.escape(block_reason or defense_type)}'>"
            f"🚧 {html.escape(defense_type)}</span>"
        )
    tokens = rep.get("tokens") or {}
    session_url = rep.get("session_url") or "#"
    reason = (verdict.get("reason") or "").strip()
    if reason:
        reason_cls = "reason fail" if verdict.get("pass") is False else "reason"
        reason_html = (
            f"<span class='{reason_cls}' title='{html.escape(reason)}'>{html.escape(reason)}</span>"
        )
    else:
        reason_html = ""
    answer = (rep.get("final_answer") or "").strip()
    if answer:
        answer_html = (
            f"<span class='answer' title='{html.escape(answer)}'>{html.escape(answer)}</span>"
        )
    else:
        answer_html = "<span class='answer empty'>(no final answer)</span>"
    extracted_html = ""
    ea = rep.get("extracted_answer") or {}
    if ea.get("extractable") and ea.get("value") is not None:
        value_str = str(ea["value"])
        cls = "extracted"
        value_norm = _normalize_for_consensus(value_str)
        if discrepancy_norms and value_norm is not None and value_norm in discrepancy_norms:
            cls = "extracted outlier"
        extracted_html = (
            f"<span class='{cls}'>"
            f"<span class='label'>extracted</span>"
            f"{html.escape(value_str)}"
            f"</span>"
        )
    return (
        f"<div class='{rep_class}'>"
        f"<div class='rep-head'>"
        f"<span class='rep-idx'>#{rep_idx}</span>"
        f"{badge} "
        f"<a href='{html.escape(session_url)}' target='_blank'>session</a>"
        f"<span class='meta'>"
        f"{fmt_int(tokens.get('total'))} tok · "
        f"{fmt_money(rep.get('cost_usd'))} · "
        f"{fmt_steps(rep.get('steps_taken'))} steps · "
        f"{fmt_secs(rep.get('duration_s'))}"
        f"</span>"
        f"</div>"
        f"{reason_html}"
        f"{answer_html}"
        f"{extracted_html}"
        f"</div>"
    )


def _render_cell(
    summ: dict[str, Any], repetitions: int, cross_scenario_distinct_norms: set[str]
) -> str:
    """Render one (scenario, task) matrix cell. Headline shows the
    pass/fail ratio + majority extracted value; <details> expands to per-rep
    blocks with full response and judge text.

    `cross_scenario_distinct_norms` holds normalized values that this task
    differs by across scenarios — the cell's majority is flagged as an
    outlier when its normalized form appears there."""
    reps = summ["reps"]
    done = len(reps)
    if done == 0:
        return f"<span class='badge pending'>pending (0/{repetitions})</span>"

    pass_count = summ["pass_count"]
    fail_count = summ["fail_count"]
    ungraded_count = summ["ungraded_count"]
    error_count = summ["error_count"]
    judged = pass_count + fail_count

    # Headline badge: all pass / all fail / mixed / all errors.
    if summ["errored_all"]:
        head_badge = f"<span class='badge error'>{done} error{'s' if done != 1 else ''}</span>"
    elif judged == 0:
        head_badge = f"<span class='badge pending'>ungraded ({done}/{repetitions})</span>"
    elif pass_count == judged and pass_count > 0 and error_count == 0:
        head_badge = f"<span class='badge pass'>{pass_count}/{judged} pass</span>"
    elif pass_count == 0:
        head_badge = f"<span class='badge fail'>0/{judged} pass</span>"
    else:
        head_badge = f"<span class='badge warn'>{pass_count}/{judged} pass</span>"

    # Ungraded reps badge — surfaces successful runs whose judge call didn't
    # produce a verdict, which the headline (computed off `judged`) hides.
    ungraded_badge = ""
    if ungraded_count > 0:
        ungraded_badge = (
            f" <span class='badge pending' title='reps with no judge verdict'>"
            f"{ungraded_count} ungraded</span>"
        )

    # Pending suffix (partial run).
    pending_suffix = ""
    if done < repetitions:
        pending_suffix = f" <span class='badge pending'>{done}/{repetitions} done</span>"

    # Blocked badge — only surfaces reps that *failed* due to an anti-bot
    # defense. Reps that hit a defense page but still passed the judge
    # aren't counted (the block didn't prevent success). Tooltip lists
    # distinct defense_type strings observed in this cell's failed reps.
    blocked_badge = ""
    blocked_count = summ.get("blocked_count") or 0
    if blocked_count > 0:
        blocked_types = summ.get("blocked_types") or set()
        tip = ", ".join(sorted(blocked_types)) if blocked_types else "blocked"
        blocked_badge = (
            f" <span class='badge blocked' title='{html.escape(tip)}'>"
            f"🚧 {blocked_count}/{done} blocked</span>"
        )

    # Aggregate meta (averages over completed reps).
    meta_parts: list[str] = []
    if summ["avg_tokens"] is not None:
        meta_parts.append(f"avg {fmt_int(summ['avg_tokens'])} tok")
    if summ["avg_cost"] is not None:
        meta_parts.append(f"avg {fmt_money(summ['avg_cost'])}")
    if summ["avg_steps"] is not None:
        meta_parts.append(f"avg {fmt_int(summ['avg_steps'])} steps")
    if summ["avg_duration"] is not None:
        meta_parts.append(f"avg {fmt_secs(summ['avg_duration'])}")
    meta_html = (
        f"<span class='meta'>{html.escape(' · '.join(meta_parts))}</span>" if meta_parts else ""
    )

    # Majority extracted value + within-cell variance flag.
    extracted_html = ""
    majority = summ["majority_extracted"]
    if majority is not None:
        cls = "extracted"
        majority_norm = _normalize_for_consensus(majority)
        if (
            cross_scenario_distinct_norms
            and majority_norm is not None
            and majority_norm in cross_scenario_distinct_norms
        ):
            cls = "extracted outlier"
        varies_badge = ""
        if summ["within_cell_discrepancy"]:
            tip = " | ".join(summ["extracted_values"])
            varies_badge = f" <span class='badge warn' title='{html.escape(tip)}'>⚠ varies</span>"
        extracted_html = (
            f"<span class='{cls}'>"
            f"<span class='label'>extracted</span>"
            f"{html.escape(str(majority))}"
            f"{varies_badge}"
            f"</span>"
        )

    # Per-rep details (collapsed by default). When the cell has multiple
    # distinct normalized values, flag any rep whose value participates as an
    # outlier — the comparison is on normalized form so trivial differences
    # don't get flagged.
    if summ["within_cell_discrepancy"]:
        discrepancy_norms = set(summ["extracted_norm_counts"].keys())
    else:
        discrepancy_norms = set()
    rep_blocks = "".join(_render_rep(rep, discrepancy_norms) for rep in reps)
    details_html = (
        f"<details><summary>{done} run{'s' if done != 1 else ''}</summary>{rep_blocks}</details>"
    )

    return (
        f"<div class='cell'>"
        f"{head_badge}{ungraded_badge}{pending_suffix}{blocked_badge}"
        f"{meta_html}"
        f"{extracted_html}"
        f"{details_html}"
        f"</div>"
    )


def _render_header(
    run_id: str,
    manifest: dict[str, Any],
    num_rows: int,
    num_pending: int,
    expected_total: int,
    repetitions: int,
) -> str:
    parts: list[str] = [
        f"<h1>Benchmark report — <code>{html.escape(run_id)}</code></h1>",
        "<div class='panel'><dl class='kvp'>",
    ]
    for key in (
        "started_at",
        "git_sha",
        "extension_zip",
        "extension_zip_sha256",
        "scenarios_file",
        "tasks_file",
        "pricing_file",
        "concurrency",
        "repetitions",
    ):
        val = manifest.get(key)
        parts.append(
            f"<dt>{html.escape(key)}</dt>"
            f"<dd>{html.escape(str(val) if val is not None else '—')}</dd>"
        )
    parts.append(
        f"<dt>progress</dt><dd>{num_rows} / {expected_total} rows "
        f"({num_pending} pending, {repetitions} rep{'s' if repetitions != 1 else ''} per cell)"
        "</dd>"
    )
    parts.append("</dl></div>")
    return "".join(parts)


def _render_scoreboard(
    scenario_ids: list[str],
    scenario_by_id: dict[str, dict[str, Any]],
    rows_by_scenario: dict[str, list[dict[str, Any]]],
    mode_set_by_tid: dict[str, set[str]],
) -> str:
    """Per-scenario rollup table. The "tokens / input / output / cost / steps /
    dur" columns each render two values (total + avg); a toolbar above swaps
    which is visible via the .mode-total / .mode-avg class on the scoreboard.
    """
    parts: list[str] = [
        "<h2>Overall scoreboard</h2>",
        "<div class='panel'>",
        "<div class='toolbar' role='tablist' aria-label='Metric mode'>"
        "<span class='muted'>Metrics:</span>"
        "<button type='button' class='toggle active' data-mode='total' "
        "aria-pressed='true'>Total</button>"
        "<button type='button' class='toggle' data-mode='avg' "
        "aria-pressed='false'>Average</button>"
        "</div>",
        "<table class='scoreboard mode-total'>",
        "<thead><tr>"
        "<th>Scenario</th><th>Model</th><th>Ext</th>"
        "<th>Runs</th><th>Judge pass</th>"
        "<th title='Share of runs that failed because the agent was blocked "
        "by an anti-agent defense (Cloudflare, captcha, 403, etc.). Runs that "
        "saw a defense page but still passed the judge are excluded.'>"
        "Blocked</th>"
        "<th>Consensus match</th>"
        "<th>Completed (in-budget)</th>"
        + _dual_th("Total tokens", "Avg tokens")
        + _dual_th("Total input", "Avg input")
        + _dual_th("Total output", "Avg output")
        + _dual_th(
            "Total cached",
            "Avg cached",
            title=(
                "Cache-read input tokens (Stagehand-normalized across providers: "
                "OpenAI cached_input_tokens, Anthropic cache_read_input_tokens, "
                "Gemini cachedContentTokenCount). Does NOT reduce the model's "
                "input-token limit — only billing/latency."
            ),
        )
        + (
            "<th class='num' title='Share of input tokens served from cache "
            "across all runs in the scenario. Low values often mean the running "
            "prefix mutates between steps (e.g., DOM markers re-applied each "
            "turn).'>Cache hit %</th>"
        )
        + _dual_th("Total cost", "Avg cost")
        + (
            "<th class='num v-avg' title='Average cost across runs that "
            "passed the judge — apples-to-apples cost per successful "
            "outcome.'>Avg cost (pass)</th>"
        )
        + _dual_th("Total steps", "Avg steps")
        + _dual_th("Total dur", "Avg dur")
        + "<th>Errors</th>"
        "</tr></thead><tbody>",
    ]

    for sid in scenario_ids:
        s_def = scenario_by_id[sid]
        srows = rows_by_scenario[sid]
        summ = scenario_summary(srows)
        matched, total = consensus_match_stats(srows, mode_set_by_tid)
        parts.append("<tr>")
        parts.append(f"<td><strong>{html.escape(sid)}</strong></td>")
        parts.append(f"<td>{html.escape(s_def.get('model', ''))}</td>")
        parts.append(f"<td>{'on' if s_def.get('extension') else 'off'}</td>")
        parts.append(f"<td>{summ['runs']}</td>")
        parts.append(f"<td>{fmt_pct(summ['passed'], summ['judged'])}</td>")
        parts.append(f"<td>{fmt_pct(summ['blocked'], summ['runs'])}</td>")
        parts.append(f"<td>{fmt_pct(matched, total)}</td>")
        parts.append(f"<td>{fmt_pct(summ['completed_within_budget'], summ['runs'])}</td>")
        parts.append(_dual_cell(fmt_int(summ["total_tokens"]), fmt_int(summ["avg_tokens"])))
        parts.append(
            _dual_cell(fmt_int(summ["total_input_tokens"]), fmt_int(summ["avg_input_tokens"]))
        )
        parts.append(
            _dual_cell(fmt_int(summ["total_output_tokens"]), fmt_int(summ["avg_output_tokens"]))
        )
        parts.append(
            _dual_cell(fmt_int(summ["total_cached_tokens"]), fmt_int(summ["avg_cached_tokens"]))
        )
        hit_pct = summ.get("cache_hit_pct")
        hit_html = "—" if hit_pct is None else f"{hit_pct:.1f}%"
        parts.append(f"<td class='num'>{hit_html}</td>")
        parts.append(_dual_cell(fmt_money(summ["total_cost"]), fmt_money(summ["avg_cost"])))
        pass_n = summ["avg_cost_pass_n"]
        pass_cost_html = fmt_money(summ["avg_cost_pass"])
        parts.append(f"<td class='num v-avg' title='n={pass_n} passed runs'>{pass_cost_html}</td>")
        parts.append(_dual_cell(fmt_int(summ["total_steps"]), fmt_int(summ["avg_steps"])))
        parts.append(_dual_cell(fmt_secs(summ["total_duration"]), fmt_secs(summ["avg_duration"])))
        parts.append(f"<td>{summ['errored']}</td>")
        parts.append("</tr>")
    parts.append("</tbody></table></div>")
    return "".join(parts)


def _guarded_severity(
    tid: str,
    guarded_sids: list[str],
    baseline_sids: list[str],
    summary_by_key: dict[tuple[str, str], dict[str, Any]],
) -> tuple[float, float]:
    """Return (max_failure_regression, max_cost_ratio) for this task.

    Failure regression = guarded_fail_count - mean(baseline_fail_count);
    positive means the guard caused more failures than baseline. A task
    where the guard actually improved things gets a negative score and
    sorts below "no-change" tasks. Aggregated as max across guarded
    scenarios so one bad guarded variant is enough to surface a task.

    Cost ratio = guarded_avg_cost / mean(baseline_avg_costs); max across
    guarded scenarios. Missing data contributes 0 so it sorts to the
    bottom rather than crashing."""
    baseline_fails = [summary_by_key[(sid, tid)].get("fail_count") or 0 for sid in baseline_sids]
    baseline_fail_mean = sum(baseline_fails) / len(baseline_fails) if baseline_fails else 0.0
    guarded_fails = [summary_by_key[(sid, tid)].get("fail_count") or 0 for sid in guarded_sids]
    max_regression = max(g - baseline_fail_mean for g in guarded_fails) if guarded_fails else 0.0

    baseline_costs = [
        summary_by_key[(sid, tid)]["avg_cost"]
        for sid in baseline_sids
        if summary_by_key[(sid, tid)].get("avg_cost") is not None
    ]
    if not baseline_costs:
        return max_regression, 0.0
    baseline_mean = sum(baseline_costs) / len(baseline_costs)
    if baseline_mean <= 0:
        return max_regression, 0.0

    max_ratio = 0.0
    for sid in guarded_sids:
        g_cost = summary_by_key[(sid, tid)].get("avg_cost")
        if g_cost is None:
            continue
        ratio = g_cost / baseline_mean
        if ratio > max_ratio:
            max_ratio = ratio
    return max_regression, max_ratio


def _cross_scenario_discrepancies(
    task_ids: list[str],
    scenario_ids: list[str],
    summary_by_key: dict[tuple[str, str], dict[str, Any]],
) -> tuple[dict[str, set[str]], dict[str, set[str]]]:
    """Identify tasks whose per-scenario majorities don't agree.

    Returns (discrepancy_by_tid, discrepancy_norms_by_tid):
      discrepancy_by_tid:        tid → set of original-string majorities
      discrepancy_norms_by_tid:  tid → set of normalized forms
    A task counts as a discrepancy when >=2 distinct normalized forms appear
    across scenarios — case/punct/whitespace-only differences don't trigger it.
    """
    discrepancy_by_tid: dict[str, set[str]] = {}
    discrepancy_norms_by_tid: dict[str, set[str]] = {}
    for tid in task_ids:
        seen_norm: dict[str, str] = {}  # norm -> first-seen original
        for sid in scenario_ids:
            v = summary_by_key[(sid, tid)]["majority_extracted"]
            if v is None:
                continue
            norm = _normalize_for_consensus(v)
            if norm is None:
                continue
            seen_norm.setdefault(norm, v)
        if len(seen_norm) >= 2:
            discrepancy_by_tid[tid] = set(seen_norm.values())
            discrepancy_norms_by_tid[tid] = set(seen_norm.keys())
    return discrepancy_by_tid, discrepancy_norms_by_tid


def _render_matrix(
    run_id: str,
    scenario_ids: list[str],
    scenario_by_id: dict[str, dict[str, Any]],
    task_ids: list[str],
    task_by_id: dict[str, dict[str, Any]],
    summary_by_key: dict[tuple[str, str], dict[str, Any]],
    repetitions: int,
) -> str:
    parts: list[str] = [
        "<h2>Per-task matrix</h2>",
        "<div class='muted' style='margin-bottom:8px'>"
        "Sorted by guarded regression — largest (guarded − baseline) failure "
        "delta first, then largest guarded/baseline cost ratio. Tasks the "
        "guard improved sort below tasks where it had no effect."
        "</div>",
        "<div class='panel'><table class='matrix'>",
        "<thead><tr><th>Task</th>",
    ]
    for sid in scenario_ids:
        parts.append(f"<th>{html.escape(sid)}</th>")
    parts.append("</tr></thead><tbody>")

    guarded_sids = [sid for sid in scenario_ids if (scenario_by_id.get(sid) or {}).get("extension")]
    baseline_sids = [
        sid for sid in scenario_ids if not (scenario_by_id.get(sid) or {}).get("extension")
    ]
    severity_by_tid = {
        tid: _guarded_severity(tid, guarded_sids, baseline_sids, summary_by_key) for tid in task_ids
    }
    discrepancy_by_tid, discrepancy_norms_by_tid = _cross_scenario_discrepancies(
        task_ids, scenario_ids, summary_by_key
    )

    sorted_task_ids = sorted(
        task_ids,
        key=lambda tid: (
            -severity_by_tid[tid][0],
            -severity_by_tid[tid][1],
            tid,
        ),
    )
    for tid in sorted_task_ids:
        t_def = task_by_id[tid]
        distinct_vals = discrepancy_by_tid.get(tid)
        is_discrepancy = distinct_vals is not None
        row_class = " class='discrepancy'" if is_discrepancy else ""
        parts.append(f"<tr{row_class}>")
        discrep_badge = ""
        if is_discrepancy:
            tip = " | ".join(sorted(distinct_vals or set()))
            discrep_badge = (
                f" <span class='badge warn' title='{html.escape(tip)}'>⚠ discrepancy</span>"
            )
        diff_href = f"{run_id}__{build_traces.safe_filename(tid)}.html"
        prompt_text = build_debug_prompt(
            run_id=run_id,
            task_def=t_def,
            scenario_ids=scenario_ids,
            scenario_by_id=scenario_by_id,
            summary_by_key=summary_by_key,
        )
        cost_prompt_text = build_cost_diagnosis_prompt(
            run_id=run_id,
            task_def=t_def,
            scenario_ids=scenario_ids,
            scenario_by_id=scenario_by_id,
            summary_by_key=summary_by_key,
        )
        # data-prompt holds the full text via attribute-escaped JSON; the inline
        # JS reads it back and writes to navigator.clipboard.
        prompt_attr = html.escape(prompt_text, quote=True)
        cost_prompt_attr = html.escape(cost_prompt_text, quote=True)
        actions_html = (
            f"<div class='task-actions'>"
            f"<a class='task-action diff-link' href='{html.escape(diff_href)}' "
            f"title='Open side-by-side scenario diff'>🔍 Diff</a>"
            f"<button type='button' class='task-action copy-prompt' "
            f"data-prompt='{prompt_attr}' "
            f"aria-label='Copy debug prompt for {html.escape(tid)}'>"
            f"<span class='copy-label'>📋 Copy debug prompt</span>"
            f"</button>"
            f"<button type='button' class='task-action copy-prompt' "
            f"data-prompt='{cost_prompt_attr}' "
            f"aria-label='Copy cost diagnosis prompt for {html.escape(tid)}' "
            f"title='Copy a prompt to diagnose why guarded runs cost more'>"
            f"<span class='copy-label'>💸 Copy cost diagnosis</span>"
            f"</button>"
            f"</div>"
        )
        parts.append(
            f"<td><strong>{html.escape(tid)}</strong>{discrep_badge}<br>"
            f"<span class='muted'>{html.escape(t_def.get('task', '')[:80])}</span>"
            f"{actions_html}</td>"
        )
        distinct_norms = discrepancy_norms_by_tid.get(tid) or set()
        for sid in scenario_ids:
            summ = summary_by_key[(sid, tid)]
            parts.append("<td>")
            parts.append(_render_cell(summ, repetitions, distinct_norms))
            parts.append("</td>")
        parts.append("</tr>")
    parts.append("</tbody></table></div>")
    return "".join(parts)


def _render_pending(pending: list[tuple[str, str, int]]) -> str:
    if not pending:
        return ""
    parts: list[str] = ["<h2>Pending</h2>", "<div class='panel'><ul>"]
    for sid, tid, rep in pending:
        parts.append(
            f"<li><code>{html.escape(sid)}</code> / "
            f"<code>{html.escape(tid)}</code> "
            f"<span class='muted'>rep {rep}</span></li>"
        )
    parts.append("</ul></div>")
    return "".join(parts)


def _render_errors(error_rows: list[dict[str, Any]]) -> str:
    if not error_rows:
        return ""
    parts: list[str] = [
        "<h2>Errors</h2>",
        "<div class='panel'><details open><summary>",
        f"{len(error_rows)} failed runs</summary><table>",
        "<thead><tr><th>Scenario</th><th>Task</th>"
        "<th class='num'>Rep</th>"
        "<th>Error</th><th>Session</th></tr></thead><tbody>",
    ]
    for r in error_rows:
        session_url = r.get("session_url")
        link = (
            f"<a href='{html.escape(session_url)}' target='_blank'>view</a>" if session_url else "—"
        )
        parts.append(
            "<tr class='error-row'>"
            f"<td>{html.escape(r.get('scenario_id') or '')}</td>"
            f"<td>{html.escape(r.get('task_id') or '')}</td>"
            f"<td class='num'>{_rep_index(r)}</td>"
            f"<td><code>{html.escape(r['error'])}</code></td>"
            f"<td>{link}</td>"
            "</tr>"
        )
    parts.append("</tbody></table></details></div>")
    return "".join(parts)


def _render_all_rows(rows: list[dict[str, Any]]) -> str:
    parts: list[str] = [
        "<h2>All rows</h2>",
        "<div class='panel'><details><summary>",
        f"{len(rows)} result rows (click to expand)</summary><table>",
        "<thead><tr><th>Scenario</th><th>Task</th>"
        "<th class='num'>Rep</th><th>Pass</th>"
        "<th class='num'>Tokens</th><th class='num'>Cost</th>"
        "<th class='num'>Steps</th><th class='num'>Dur</th>"
        "<th>Final answer</th><th>Extracted</th><th>Judge reason</th>"
        "</tr></thead><tbody>",
    ]
    sorted_rows = sorted(
        rows,
        key=lambda r: (
            r.get("scenario_id") or "",
            r.get("task_id") or "",
            _rep_index(r),
        ),
    )
    for r in sorted_rows:
        verdict = r.get("judge") or {}
        if verdict.get("pass") is True:
            badge = "<span class='badge pass'>pass</span>"
        elif verdict.get("pass") is False:
            badge = "<span class='badge fail'>fail</span>"
        elif r.get("error"):
            badge = "<span class='badge error'>error</span>"
        else:
            badge = "<span class='badge pending'>—</span>"
        tokens = r.get("tokens") or {}
        ea = r.get("extracted_answer") or {}
        if ea.get("extractable") and ea.get("value"):
            extracted_cell = f"<code>{html.escape(str(ea['value']))}</code>"
        elif ea.get("extractable") is False:
            extracted_cell = "<span class='muted'>open-ended</span>"
        else:
            extracted_cell = "—"
        parts.append(
            "<tr>"
            f"<td>{html.escape(r.get('scenario_id') or '')}</td>"
            f"<td>{html.escape(r.get('task_id') or '')}</td>"
            f"<td class='num'>{_rep_index(r)}</td>"
            f"<td>{badge}</td>"
            f"<td class='num'>{fmt_int(tokens.get('total'))}</td>"
            f"<td class='num'>{fmt_money(r.get('cost_usd'))}</td>"
            f"<td class='num'>{fmt_steps(r.get('steps_taken'))}</td>"
            f"<td class='num'>{fmt_secs(r.get('duration_s'))}</td>"
            f"<td>{html.escape((r.get('final_answer') or '')[:120])}</td>"
            f"<td>{extracted_cell}</td>"
            f"<td>{html.escape(verdict.get('reason', ''))}</td>"
            "</tr>"
        )
    parts.append("</tbody></table></details></div>")
    return "".join(parts)


def render_html(run_id: str, manifest: dict[str, Any], rows: list[dict[str, Any]]) -> str:
    scenarios = manifest.get("scenarios", [])
    tasks = manifest.get("tasks", [])
    scenario_ids = [s["id"] for s in scenarios]
    task_ids = [t["id"] for t in tasks]
    scenario_by_id = {s["id"]: s for s in scenarios}
    task_by_id = {t["id"]: t for t in tasks}

    # N (repetitions per cell). Prefer manifest; fall back to the max
    # repetition observed in rows (so legacy run dirs without the field still
    # render correctly).
    repetitions = manifest.get("repetitions")
    if not repetitions:
        repetitions = max((_rep_index(r) for r in rows), default=1)
    repetitions = max(1, int(repetitions))

    # Group rows by (scenario, task) cell; each cell holds up to N reps.
    cell_rows: dict[tuple[str, str], list[dict[str, Any]]] = {
        (s, t): [] for s in scenario_ids for t in task_ids
    }
    for r in rows:
        key = (r.get("scenario_id"), r.get("task_id"))
        if key in cell_rows:
            cell_rows[key].append(r)
    summary_by_key: dict[tuple[str, str], dict[str, Any]] = {
        key: cell_summary(reps) for key, reps in cell_rows.items()
    }

    # Pending: (s, t, rep) triples not yet completed.
    observed_reps: dict[tuple[str, str], set[int]] = {
        k: {_rep_index(r) for r in v} for k, v in cell_rows.items()
    }
    pending: list[tuple[str, str, int]] = sorted(
        (s, t, rep)
        for s in scenario_ids
        for t in task_ids
        for rep in range(1, repetitions + 1)
        if rep not in observed_reps[(s, t)]
    )
    expected_total = len(scenario_ids) * len(task_ids) * repetitions

    rows_by_scenario: dict[str, list[dict[str, Any]]] = {s: [] for s in scenario_ids}
    for r in rows:
        sid = r.get("scenario_id")
        if sid in rows_by_scenario:
            rows_by_scenario[sid].append(r)

    mode_set_by_tid = compute_task_modes(rows, task_ids)
    error_rows = [r for r in rows if r.get("error")]

    sections: list[str] = [
        "<!doctype html><html lang='en'><head><meta charset='utf-8'>",
        f"<title>Benchmark report — {html.escape(run_id)}</title>",
        f"<style>{CSS}</style></head><body>",
        _render_header(run_id, manifest, len(rows), len(pending), expected_total, repetitions),
        _render_scoreboard(scenario_ids, scenario_by_id, rows_by_scenario, mode_set_by_tid),
        _render_matrix(
            run_id,
            scenario_ids,
            scenario_by_id,
            task_ids,
            task_by_id,
            summary_by_key,
            repetitions,
        ),
        _render_pending(pending),
        _render_errors(error_rows),
        _render_all_rows(rows),
        SCRIPT,
        "</body></html>",
    ]
    return "".join(sections)


# ---------- main ----------


def main() -> int:
    load_dotenv(REPO_ROOT / ".env")
    args = parse_args()

    run_dir = RESULTS_ROOT / args.run_id
    if not run_dir.is_dir():
        sys.exit(f"run dir not found: {run_dir}")
    results_path = run_dir / "results.jsonl"
    manifest_path = run_dir / "manifest.json"
    if not manifest_path.is_file():
        sys.exit(f"manifest not found: {manifest_path}")

    manifest = json.loads(manifest_path.read_text())
    rows = load_jsonl(results_path)

    if args.backfill_tokens:
        run_backfill_tokens(results_path, rows)
        rows = load_jsonl(results_path)

    if args.judge or args.extract or args.detect_blocks:
        # Prefer the judge model the runner recorded in the manifest, then fall
        # back to the scenarios file's defaults block, then the built-in default.
        defaults: dict[str, Any] = {}
        manifest_judge_model = manifest.get("judge_model")
        if manifest_judge_model:
            defaults["judge_model"] = manifest_judge_model
        else:
            scenarios_file = manifest.get("scenarios_file")
            if scenarios_file:
                scenarios_path = REPO_ROOT / scenarios_file
                if scenarios_path.is_file():
                    defaults = load_judge_defaults_from_scenarios(scenarios_path)
        judge_model = resolve_judge_model(args.judge_model, defaults)
        if args.judge:
            run_judge(results_path, rows, judge_model=judge_model, rejudge=args.rejudge)
            rows = load_jsonl(results_path)
        if args.extract:
            run_extractor(results_path, rows, judge_model=judge_model, reextract=args.reextract)
            rows = load_jsonl(results_path)
        if args.detect_blocks:
            run_block_detector(results_path, rows, judge_model=judge_model, redetect=args.redetect)
            rows = load_jsonl(results_path)

    REPORTS_ROOT.mkdir(parents=True, exist_ok=True)
    report_path = REPORTS_ROOT / f"{args.run_id}.html"
    report_path.write_text(render_html(args.run_id, manifest, rows), encoding="utf-8")
    print(f"report: {report_path.relative_to(REPO_ROOT)}")

    # Build trace bundles + per-task diff HTML so the Diff links in the main
    # report always resolve. Idempotent — only rebuilds outdated pages.
    try:
        trace_result = build_traces.build_all(args.run_id)
        print(
            f"traces: rebuilt {trace_result['traces_rebuilt']}, "
            f"loaded {trace_result['traces_loaded']}; "
            f"diff pages: wrote {trace_result['diffs_written']}"
        )
    except Exception as exc:
        print(f"warning: build_traces failed: {exc}", file=sys.stderr)

    if args.open:
        webbrowser.open(report_path.as_uri())
    return 0


if __name__ == "__main__":
    sys.exit(main())
