#!/usr/bin/env -S uv run --script
# Copyright (c) 2026 PixieBrix, Inc.
# Licensed under PolyForm Shield 1.0.0 — see LICENSE.

# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "python-dotenv>=1.0.0",
# ]
# ///
"""Compare 2 scenarios on 1 task — fast iteration loop for cost/token regressions.

Runs `benchmark_run.py` for exactly two scenarios × one task × N reps, then
builds the standard trace bundles + side-by-side HTML diff, and finally emits
`output/results/<run_id>/cost_diff.md` — a Claude-Code-readable digest that
highlights what drove the cost/token delta (step count, a11y tree size,
diverging step types) so you can iterate on a guarded scenario without running
the full matrix.

Usage:
  uv run scripts/compare_scenarios.py \\
      --scenario gpt5-mini-baseline \\
      --scenario gpt5-mini-guarded \\
      --task arxiv-recent-cs-ai \\
      -n 3 --open

Pair with `scripts/llm_proxy.py` + a tunnel and pass `--llm-proxy-url` to also
capture the exact LLM messages per call (see benchmark/README.md).
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import secrets
import statistics
import subprocess
import sys
import tempfile
import webbrowser
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPTS_DIR = REPO_ROOT / "scripts"
RESULTS_ROOT = REPO_ROOT / "output" / "results"
REPORTS_ROOT = REPO_ROOT / "output" / "reports"
DEFAULT_SCENARIOS = REPO_ROOT / "benchmark" / "scenarios.example.yaml"
DEFAULT_TASKS = REPO_ROOT / "benchmark" / "tasks.csv"
DEFAULT_EXTENSION_ZIP = REPO_ROOT / "output" / "agent-browser-shield-extension.zip"
DEFAULT_PRICING = REPO_ROOT / "benchmark" / "pricing.json"

sys.path.insert(0, str(SCRIPTS_DIR))
from build_traces import (  # noqa: E402
    build_all as build_traces_all,
)
from build_traces import (  # noqa: E402
    diff_html_filename,
    pair_steps_by_type,
    trace_dirname,
)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument(
        "--scenario",
        action="append",
        default=[],
        required=True,
        metavar="ID",
        help="Scenario id from --scenarios-file. Pass exactly twice.",
    )
    p.add_argument(
        "--task",
        default=None,
        metavar="ID",
        help="Task id from --tasks-file. Exactly one. Required unless "
        "--task-prompt is supplied (in which case --task acts as the id of "
        "the inline task and defaults to 'adhoc').",
    )
    p.add_argument("--scenarios-file", type=Path, default=DEFAULT_SCENARIOS)
    p.add_argument("--tasks-file", type=Path, default=DEFAULT_TASKS)
    p.add_argument(
        "--task-prompt",
        default=None,
        help="Inline task prompt for one-shot experiments. When set, the "
        "script writes a temporary one-row CSV and uses it as --tasks-file, "
        "so you can run autoresearch experiments without committing rows to "
        "benchmark/tasks.csv. Requires --task-url; --task-success and "
        "--task-max-steps are optional.",
    )
    p.add_argument(
        "--task-url",
        default=None,
        help="Starting URL for the inline task (paired with --task-prompt).",
    )
    p.add_argument(
        "--task-success",
        default=None,
        help="Success criteria fed to the judge for the inline task. "
        "Defaults to a permissive 'agent produced a coherent answer to the "
        "task' check when omitted, which is enough for cost/step research "
        "but not for pass/fail signal — supply real criteria when you care "
        "about the verdict.",
    )
    p.add_argument(
        "--task-max-steps",
        type=int,
        default=None,
        help="Per-task step budget for the inline task. Leave unset to "
        "inherit the scenario default.",
    )
    p.add_argument(
        "-n",
        "--repetitions",
        type=int,
        default=3,
        help="Reps per scenario (default: 3) to absorb agent variance.",
    )
    p.add_argument(
        "--llm-proxy-url",
        default=None,
        help="Forwarded to benchmark_run.py so the exact LLM messages get "
        "logged to output/llm-proxy/. Optional.",
    )
    p.add_argument("--no-judge", action="store_true")
    p.add_argument("--judge-model", default=None)
    p.add_argument("--extension-zip", type=Path, default=DEFAULT_EXTENSION_ZIP)
    p.add_argument("--pricing", type=Path, default=DEFAULT_PRICING)
    p.add_argument("--run-id", default=None, help="Override auto-minted run id.")
    p.add_argument(
        "--no-rebuild-extension",
        action="store_true",
        help="Skip the pre-run `bun run build && bun run package`. By default "
        "the script rebuilds output/agent-browser-shield-extension.zip so source edits (rule code, "
        "site YAMLs, defaults JSON) take effect this run. Pass this when the "
        "zip path is pinned to a release artifact you don't want clobbered.",
    )
    p.add_argument(
        "--open",
        action="store_true",
        help="Open the HTML side-by-side diff in the default browser.",
    )
    args = p.parse_args()
    if len(args.scenario) != 2:
        sys.exit(f"--scenario must be passed exactly twice (got {len(args.scenario)})")
    if args.scenario[0] == args.scenario[1]:
        sys.exit("--scenario values must differ")
    if args.repetitions < 1:
        sys.exit(f"--repetitions must be >= 1 (got {args.repetitions})")
    if args.task_prompt is not None:
        if not args.task_url:
            sys.exit("--task-prompt requires --task-url")
        if args.task is None:
            args.task = "adhoc"
    elif args.task is None:
        sys.exit("--task is required unless --task-prompt is supplied")
    if args.task_prompt is None and (
        args.task_url or args.task_success or args.task_max_steps is not None
    ):
        sys.exit(
            "--task-url / --task-success / --task-max-steps only apply with --task-prompt"
        )
    return args


def write_inline_tasks_csv(
    *, task_id: str, url: str, prompt: str, success: str | None, max_steps: int | None
) -> Path:
    """Write a one-row tasks.csv for inline-task runs. Returned path is in
    the system temp dir so it doesn't leak into the repo."""
    fd, raw = tempfile.mkstemp(prefix="compare_inline_tasks_", suffix=".csv")
    path = Path(raw)
    with open(fd, "w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(["id", "enabled", "max_steps", "disabled_reason", "url", "task", "success_criteria"])
        writer.writerow(
            [
                task_id,
                "true",
                str(max_steps) if max_steps is not None else "",
                "",
                url,
                prompt,
                success
                or "Final answer is coherent and on-topic for the task; "
                "any plausible response counts as pass (no ground-truth check).",
            ]
        )
    return path


def mint_run_id() -> str:
    ts = dt.datetime.now(dt.UTC).strftime("%Y%m%d_%H%M%S")
    return f"cmp_{ts}_{secrets.token_hex(2)}"


def rebuild_extension() -> None:
    # Codegen + bundle + zip together take <2s on a clean tree; cheap enough
    # to do every run so source edits in rules/, data/sites/, or
    # data/rule-defaults.json can't silently miss this comparison the way
    # they would with a stale zip on disk.
    ext_dir = REPO_ROOT / "extension"
    print("rebuilding extension (bun run build && bun run package)...")
    rc = subprocess.call(["bun", "run", "build"], cwd=ext_dir)
    if rc != 0:
        sys.exit(f"`bun run build` exited {rc}")
    rc = subprocess.call(["bun", "run", "package"], cwd=ext_dir)
    if rc != 0:
        sys.exit(f"`bun run package` exited {rc}")


def run_benchmark(args: argparse.Namespace, run_id: str) -> None:
    cmd = [
        "uv",
        "run",
        str(SCRIPTS_DIR / "benchmark_run.py"),
        "--scenarios",
        str(args.scenarios_file),
        "--tasks",
        str(args.tasks_file),
        "--task",
        args.task,
        "-n",
        str(args.repetitions),
        "--run-id",
        run_id,
        "--concurrency",
        str(max(2, args.repetitions * 2)),
        "--extension-zip",
        str(args.extension_zip),
        "--pricing",
        str(args.pricing),
    ]
    for s in args.scenario:
        cmd += ["--scenario", s]
    if args.no_judge:
        cmd.append("--no-judge")
    if args.judge_model:
        cmd += ["--judge-model", args.judge_model]
    if args.llm_proxy_url:
        cmd += ["--llm-proxy-url", args.llm_proxy_url]
    print("$", " ".join(cmd))
    rc = subprocess.call(cmd, cwd=REPO_ROOT)
    if rc != 0:
        sys.exit(f"benchmark_run.py exited {rc}")


# ---------- digest rendering ----------


def fmt_int(n: Any) -> str:
    if n is None:
        return "—"
    try:
        return f"{round(float(n)):,}"
    except (TypeError, ValueError):
        return str(n)


def fmt_money(n: Any) -> str:
    if n is None:
        return "—"
    try:
        return f"${float(n):.4f}"
    except (TypeError, ValueError):
        return str(n)


def fmt_secs(n: Any) -> str:
    if n is None:
        return "—"
    try:
        return f"{float(n):.1f}s"
    except (TypeError, ValueError):
        return str(n)


def fmt_float(n: Any, places: int = 1) -> str:
    if n is None:
        return "—"
    try:
        return f"{float(n):.{places}f}"
    except (TypeError, ValueError):
        return str(n)


def fmt_pct_delta(a: float | None, b: float | None) -> str:
    if a in (None, 0) or b is None:
        return "—"
    pct = (b - a) / a * 100
    return f"{pct:+.0f}%"


def fmt_abs_delta(a: float | None, b: float | None, kind: str = "int") -> str:
    if a is None or b is None:
        return "—"
    diff = b - a
    if kind == "int":
        return f"{round(diff):+,}"
    if kind == "money":
        return f"{diff:+.4f}"
    if kind == "secs":
        return f"{diff:+.1f}s"
    return f"{diff:+}"


def mean(xs: list[Any]) -> float | None:
    vals = [float(x) for x in xs if x is not None]
    if not vals:
        return None
    return statistics.mean(vals)


def load_results_rows(run_dir: Path) -> list[dict[str, Any]]:
    p = run_dir / "results.jsonl"
    rows: list[dict[str, Any]] = []
    if not p.is_file():
        return rows
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    # Last write wins per (scenario, task, rep) — matches build_traces.load_jsonl.
    by_key: dict[tuple[str, str, int], dict[str, Any]] = {}
    order: list[tuple[str, str, int]] = []
    for r in rows:
        key = (
            str(r.get("scenario_id") or ""),
            str(r.get("task_id") or ""),
            int(r.get("repetition") or 1),
        )
        if key not in by_key:
            order.append(key)
        by_key[key] = r
    return [by_key[k] for k in order]


def load_steps(run_dir: Path, sid: str, tid: str, rep: int) -> list[dict[str, Any]]:
    p = run_dir / "traces" / trace_dirname(sid, tid, rep) / "steps.json"
    if not p.is_file():
        return []
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except (OSError, json.JSONDecodeError):
        return []


def token_field(rows: list[dict[str, Any]], key: str) -> list[Any]:
    out: list[Any] = []
    for r in rows:
        toks = r.get("tokens") or {}
        out.append(toks.get(key))
    return out


def judge_verdict(row: dict[str, Any]) -> str:
    if row.get("error"):
        return "error"
    v = (row.get("judge") or {}).get("pass")
    if v is True:
        return "pass"
    if v is False:
        return "fail"
    return "ungraded"


def summarize_scenario(rows: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "n": len(rows),
        "input": mean(token_field(rows, "input")),
        "output": mean(token_field(rows, "output")),
        "total": mean(token_field(rows, "total")),
        "cached": mean(token_field(rows, "cached")),
        "reasoning": mean(token_field(rows, "reasoning")),
        "cost": mean([r.get("cost_usd") for r in rows]),
        "steps": mean([r.get("steps_taken") for r in rows]),
        "duration": mean([r.get("duration_s") for r in rows]),
        "pass": sum(1 for r in rows if judge_verdict(r) == "pass"),
        "fail": sum(1 for r in rows if judge_verdict(r) == "fail"),
        "error": sum(1 for r in rows if judge_verdict(r) == "error"),
        "ungraded": sum(1 for r in rows if judge_verdict(r) == "ungraded"),
    }


def render_summary_table(sid_a: str, sid_b: str, sa: dict, sb: dict) -> str:
    """Aggregate token/cost/step/pass-rate table, scenario A vs B (mean across reps)."""
    rows: list[tuple[str, str, str, str]] = []
    rows.append(
        (
            "pass / fail / err",
            f"{sa['pass']} / {sa['fail']} / {sa['error']}",
            f"{sb['pass']} / {sb['fail']} / {sb['error']}",
            "—",
        )
    )
    rows.append(
        (
            "steps (mean)",
            fmt_float(sa["steps"]),
            fmt_float(sb["steps"]),
            fmt_pct_delta(sa["steps"], sb["steps"]),
        )
    )
    rows.append(
        (
            "duration (mean)",
            fmt_secs(sa["duration"]),
            fmt_secs(sb["duration"]),
            fmt_pct_delta(sa["duration"], sb["duration"]),
        )
    )
    rows.append(
        (
            "input tokens (mean)",
            fmt_int(sa["input"]),
            fmt_int(sb["input"]),
            fmt_pct_delta(sa["input"], sb["input"]),
        )
    )
    rows.append(
        (
            "output tokens (mean)",
            fmt_int(sa["output"]),
            fmt_int(sb["output"]),
            fmt_pct_delta(sa["output"], sb["output"]),
        )
    )
    if sa["cached"] is not None or sb["cached"] is not None:
        rows.append(
            (
                "cached tokens (mean)",
                fmt_int(sa["cached"]),
                fmt_int(sb["cached"]),
                fmt_pct_delta(sa["cached"], sb["cached"]),
            )
        )
    if sa["reasoning"] is not None or sb["reasoning"] is not None:
        rows.append(
            (
                "reasoning tokens (mean)",
                fmt_int(sa["reasoning"]),
                fmt_int(sb["reasoning"]),
                fmt_pct_delta(sa["reasoning"], sb["reasoning"]),
            )
        )
    rows.append(
        (
            "total tokens (mean)",
            fmt_int(sa["total"]),
            fmt_int(sb["total"]),
            fmt_pct_delta(sa["total"], sb["total"]),
        )
    )
    rows.append(
        (
            "cost USD (mean)",
            fmt_money(sa["cost"]),
            fmt_money(sb["cost"]),
            fmt_pct_delta(sa["cost"], sb["cost"]),
        )
    )

    out = [f"| metric | {sid_a} | {sid_b} | Δ (B vs A) |", "|---|---|---|---|"]
    for r in rows:
        out.append("| " + " | ".join(r) + " |")
    return "\n".join(out)


def render_per_rep_table(sid_a: str, sid_b: str, rows_a: list[dict], rows_b: list[dict]) -> str:
    reps = sorted({int(r.get("repetition") or 1) for r in rows_a + rows_b})
    by_a = {int(r.get("repetition") or 1): r for r in rows_a}
    by_b = {int(r.get("repetition") or 1): r for r in rows_b}

    out = [
        f"| rep | A ({sid_a}) | B ({sid_b}) | Δ total tok | Δ steps |",
        "|---|---|---|---|---|",
    ]
    for rep in reps:
        a = by_a.get(rep)
        b = by_b.get(rep)
        a_tot = ((a or {}).get("tokens") or {}).get("total")
        b_tot = ((b or {}).get("tokens") or {}).get("total")
        a_steps = (a or {}).get("steps_taken")
        b_steps = (b or {}).get("steps_taken")

        def cell(r: dict | None) -> str:
            if r is None:
                return "—"
            tot = (r.get("tokens") or {}).get("total")
            steps = r.get("steps_taken")
            verdict = judge_verdict(r)
            cost = r.get("cost_usd")
            return (
                f"{verdict} · {fmt_int(tot)} tok · "
                f"{steps if steps is not None else '—'} steps · "
                f"{fmt_money(cost)}"
            )

        out.append(
            "| r"
            f"{rep} | {cell(a)} | {cell(b)} | "
            f"{fmt_abs_delta(a_tot, b_tot)} | "
            f"{fmt_abs_delta(a_steps, b_steps)} |"
        )
    return "\n".join(out)


def render_step_pairing(
    sid_a: str,
    sid_b: str,
    rep: int,
    steps_a: list[dict],
    steps_b: list[dict],
) -> str:
    """Side-by-side step list. Bytes column = tool_result text length (mostly
    a11y tree size). a11y column flags match / diverge per build_traces' pair
    logic."""
    pairings = pair_steps_by_type(steps_a, steps_b)
    seen_b: set[int] = set()
    rows: list[str] = []
    # First pass: every left step + its (optional) right pair.
    for s in steps_a:
        other = pairings.get(id(s))
        if other is not None:
            seen_b.add(id(other))
        rows.append(_step_pair_row(s, other))
    # Second pass: any right steps that were never paired (extras on B side).
    for s in steps_b:
        if id(s) in seen_b:
            continue
        rows.append(_step_pair_row(None, s))

    out = [
        f"### rep {rep} — paired steps",
        "",
        f"Bytes = `tool_result` text length (mostly the a11y tree). a11y flag "
        f"compares paired ariaTree snapshots between {sid_a} (A) and {sid_b} (B).",
        "",
        "| # | type | A bytes | B bytes | Δ bytes | a11y | URL |",
        "|---|---|---|---|---|---|---|",
    ]
    out.extend(rows)
    return "\n".join(out)


def _step_pair_row(a: dict | None, b: dict | None) -> str:
    a_idx = a.get("index") if a else None
    b_idx = b.get("index") if b else None
    idx_label = "/".join(
        [f"A{a_idx}" if a_idx is not None else "—", f"B{b_idx}" if b_idx is not None else "—"]
    )
    a_type = (a or {}).get("type")
    b_type = (b or {}).get("type")
    type_label = a_type if a_type == b_type else f"{a_type or '—'} / {b_type or '—'}"
    a_bytes = ((a or {}).get("tool_result") or {}).get("text_len")
    b_bytes = ((b or {}).get("tool_result") or {}).get("text_len")
    a11y = ""
    a_kind = ((a or {}).get("tool_result") or {}).get("kind")
    b_kind = ((b or {}).get("tool_result") or {}).get("kind")
    if a_kind == "aria_tree" and b_kind == "aria_tree":
        a_sha = ((a or {}).get("tool_result") or {}).get("text_sha256")
        b_sha = ((b or {}).get("tool_result") or {}).get("text_sha256")
        a11y = "identical" if a_sha and a_sha == b_sha else "diverged"
    url = (a or b or {}).get("page_url") or ""
    if len(url) > 60:
        url = url[:57] + "…"
    return (
        f"| {idx_label} | {type_label or '—'} | "
        f"{fmt_int(a_bytes)} | {fmt_int(b_bytes)} | "
        f"{fmt_abs_delta(a_bytes, b_bytes)} | {a11y or '—'} | "
        f"`{url}` |"
    )


def render_cost_diff(
    *,
    run_id: str,
    run_dir: Path,
    sid_a: str,
    sid_b: str,
    task_id: str,
    manifest: dict[str, Any],
    rows: list[dict[str, Any]],
    llm_proxy_url: str | None,
) -> str:
    task_def = next((t for t in manifest.get("tasks") or [] if t["id"] == task_id), {})
    scen_a = next((s for s in manifest.get("scenarios") or [] if s["id"] == sid_a), {})
    scen_b = next((s for s in manifest.get("scenarios") or [] if s["id"] == sid_b), {})

    rows_a = [r for r in rows if r["scenario_id"] == sid_a and r["task_id"] == task_id]
    rows_b = [r for r in rows if r["scenario_id"] == sid_b and r["task_id"] == task_id]
    rows_a.sort(key=lambda r: int(r.get("repetition") or 1))
    rows_b.sort(key=lambda r: int(r.get("repetition") or 1))

    sa = summarize_scenario(rows_a)
    sb = summarize_scenario(rows_b)

    diff_html = REPORTS_ROOT / diff_html_filename(run_id, task_id)
    cwd = Path.cwd()

    def rel(p: Path) -> str:
        try:
            return str(p.relative_to(cwd))
        except ValueError:
            return str(p)

    out: list[str] = []
    out.append(f"# Scenario diff — `{task_id}`")
    out.append("")
    out.append(f"- run: `{run_id}`")
    out.append(
        f"- scenario A: `{sid_a}` (extension: {scen_a.get('extension')}, "
        f"model: `{scen_a.get('model')}`)"
    )
    out.append(
        f"- scenario B: `{sid_b}` (extension: {scen_b.get('extension')}, "
        f"model: `{scen_b.get('model')}`)"
    )
    out.append(f"- reps: {manifest.get('repetitions')}")
    out.append(f"- task: {task_def.get('task', '')}")
    out.append(f"- success criteria: {task_def.get('success_criteria', '')}")
    out.append("")
    out.append("## Aggregate (mean across reps)")
    out.append("")
    out.append(render_summary_table(sid_a, sid_b, sa, sb))
    out.append("")
    out.append("## Per-rep")
    out.append("")
    out.append(render_per_rep_table(sid_a, sid_b, rows_a, rows_b))
    out.append("")
    out.append("## Step-by-step pairing")
    out.append("")
    out.append(
        "Per-step token counts aren't tracked by Stagehand (only aggregate per "
        "rep). The closest proxy for per-step cost is the tool_result byte "
        "length below — for `ariaTree` steps that's the rendered a11y tree "
        "that gets fed back into the next LLM call. To attribute exact tokens "
        "to individual LLM calls, re-run with `--llm-proxy-url` and inspect "
        "the proxy log."
    )
    out.append("")
    reps = sorted({int(r.get("repetition") or 1) for r in rows_a + rows_b})
    by_a = {int(r.get("repetition") or 1): r for r in rows_a}
    by_b = {int(r.get("repetition") or 1): r for r in rows_b}
    for rep in reps:
        steps_a = load_steps(run_dir, sid_a, task_id, rep) if rep in by_a else []
        steps_b = load_steps(run_dir, sid_b, task_id, rep) if rep in by_b else []
        if not steps_a and not steps_b:
            continue
        out.append(render_step_pairing(sid_a, sid_b, rep, steps_a, steps_b))
        out.append("")

    out.append("## Files to drill into")
    out.append("")
    out.append(f"- HTML side-by-side: `{rel(diff_html)}` (open in browser)")
    out.append("- Trace bundles (per rep, both scenarios):")
    for rep in reps:
        for sid in (sid_a, sid_b):
            tdir = run_dir / "traces" / trace_dirname(sid, task_id, rep)
            if tdir.is_dir():
                out.append(f"  - `{rel(tdir)}/` — `steps.json`, `messages.json`, `summary.json`")
    out.append(f"- Raw events: `{rel(run_dir / 'events')}/`")
    out.append(f"- Results row: `{rel(run_dir / 'results.jsonl')}`")
    if llm_proxy_url:
        out.append(
            f"- LLM proxy log: most recent file under "
            f"`{rel(REPO_ROOT / 'output' / 'llm-proxy')}/` "
            f"(scope: every OpenAI call routed through {llm_proxy_url} during "
            f"this run; judge/extractor calls are NOT proxied)"
        )
    else:
        out.append(
            "- LLM proxy log: not enabled. Re-run with `--llm-proxy-url <tunnel>` "
            "to capture the exact messages and per-call token counts."
        )
    out.append("")
    out.append("## How to read this")
    out.append("")
    out.append(
        "Cost differences between A and B come from three places: "
        "(1) **step count** — each agent step ≈ one LLM call, so more steps = "
        "more cost; (2) **per-call input size** — mostly the rendered a11y "
        "tree, which the agent re-sends each step alongside accumulated "
        "history; (3) **per-call output size** — reasoning + tool input the "
        "model emits. The step-by-step table flags which paired steps had "
        "diverging a11y trees and how their byte counts compare. Big positive "
        "Δ bytes on B's ariaTree rows usually explains a big positive Δ tokens "
        "on the aggregate."
    )
    return "\n".join(out)


# ---------- entry point ----------


def main() -> int:
    load_dotenv(REPO_ROOT / ".env")
    args = parse_args()

    inline_tasks_path: Path | None = None
    if args.task_prompt is not None:
        inline_tasks_path = write_inline_tasks_csv(
            task_id=args.task,
            url=args.task_url,
            prompt=args.task_prompt,
            success=args.task_success,
            max_steps=args.task_max_steps,
        )
        args.tasks_file = inline_tasks_path

    run_id = args.run_id or mint_run_id()
    run_dir = RESULTS_ROOT / run_id
    if run_dir.exists() and any(run_dir.iterdir()):
        sys.exit(f"run dir {run_dir.relative_to(REPO_ROOT)} already exists and is non-empty")

    print(f"run_id: {run_id}")
    print(f"scenarios: {args.scenario[0]} vs {args.scenario[1]}")
    print(f"task: {args.task}")
    if inline_tasks_path is not None:
        print(f"inline task csv: {inline_tasks_path}")
    print(f"reps: {args.repetitions}")
    if args.llm_proxy_url:
        print(f"llm proxy: {args.llm_proxy_url}")
    print()

    if not args.no_rebuild_extension and args.extension_zip == DEFAULT_EXTENSION_ZIP:
        rebuild_extension()
        print()
    elif args.extension_zip != DEFAULT_EXTENSION_ZIP and not args.no_rebuild_extension:
        print(
            f"skipping rebuild — --extension-zip overridden to "
            f"{args.extension_zip.relative_to(REPO_ROOT) if args.extension_zip.is_relative_to(REPO_ROOT) else args.extension_zip}"
        )
        print()

    run_benchmark(args, run_id)

    if not (run_dir / "results.jsonl").is_file():
        sys.exit("benchmark_run did not produce results.jsonl")

    print()
    print("building trace bundles + HTML diff...")
    build_result = build_traces_all(run_id, task_globs=[args.task], force=False)
    print(
        f"  traces: rebuilt {build_result['traces_rebuilt']}, "
        f"loaded {build_result['traces_loaded']}, "
        f"failed {build_result['traces_failed']}; "
        f"diff pages: wrote {build_result['diffs_written']}"
    )

    manifest = json.loads((run_dir / "manifest.json").read_text(encoding="utf-8"))
    rows = load_results_rows(run_dir)

    sid_a, sid_b = args.scenario
    md = render_cost_diff(
        run_id=run_id,
        run_dir=run_dir,
        sid_a=sid_a,
        sid_b=sid_b,
        task_id=args.task,
        manifest=manifest,
        rows=rows,
        llm_proxy_url=args.llm_proxy_url,
    )
    out_path = run_dir / "cost_diff.md"
    out_path.write_text(md, encoding="utf-8")

    diff_html = REPORTS_ROOT / diff_html_filename(run_id, args.task)
    cwd = Path.cwd()

    def rel(p: Path) -> str:
        try:
            return str(p.relative_to(cwd))
        except ValueError:
            return str(p)

    print()
    print(f"digest: {rel(out_path)}")
    print(f"html:   {rel(diff_html)}")

    if args.open and diff_html.is_file():
        webbrowser.open(diff_html.as_uri())
    return 0


if __name__ == "__main__":
    sys.exit(main())
