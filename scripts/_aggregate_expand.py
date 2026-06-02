#!/usr/bin/env -S uv run --script
# Copyright (c) 2026 PixieBrix, Inc.
# Licensed under PolyForm Shield 1.0.0 — see LICENSE.

# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Aggregate the expand_v{0..3}_<task> run directories produced by
_run_expand_autoresearch.sh into one markdown digest.

Emits output/results/expand_summary.md with three layers:

1. Per-task aggregate table — for each of the 6 tasks, the 4 preamble
   variants vs baseline scenario (extension off), showing mean tokens,
   steps, pass count, and (most importantly) the "direct goto" rate
   for the guarded scenario: how often the agent jumped straight to a
   constructed URL instead of using the on-page search UI.

2. Cross-task variant rollup — the same metrics averaged across all 6
   tasks, one row per variant.

3. Recommendation block — a few-line read of whether any variant
   improves on baseline once you control for task-to-task noise.

Direct-goto detection looks at the FIRST agent action after the initial
page load: if it's a `goto` to a URL whose path is not the start URL's
path, that rep "used the URL helper". This is the load-bearing signal
because suppressing it without improving correctness means the variant
is paying a cost (slower / more steps) for no gain.
"""

from __future__ import annotations

import json
import statistics
from pathlib import Path
from urllib.parse import urlparse

REPO_ROOT = Path(__file__).resolve().parent.parent
RESULTS_ROOT = REPO_ROOT / "output" / "results"

VARIANTS = ["v0", "v1", "v2", "v3"]
VARIANT_LABELS = {
    "v0": "baseline",
    "v1": "no-guess",
    "v2": "terse-no-guess",
    "v3": "search-default",
}
TASKS = [
    "wiki-claude",
    "wikipedia-einstein-advisor",
    "amazon-headphones",
    "npm-react-version",
    "mdn-array-map",
    "ikea-billy-cheapest-white",
]
START_URLS = {
    "wiki-claude": "https://en.wikipedia.org",
    "wikipedia-einstein-advisor": "https://en.wikipedia.org",
    "amazon-headphones": "https://www.amazon.com",
    "npm-react-version": "https://www.npmjs.com",
    "mdn-array-map": "https://developer.mozilla.org",
    "ikea-billy-cheapest-white": "https://www.ikea.com/us/en/",
}
SCENARIOS = ("gpt5-mini-baseline", "gpt5-mini-guarded")


def run_dir(variant: str, task: str) -> Path:
    return RESULTS_ROOT / f"expand_{variant}_{task}"


def load_jsonl(path: Path) -> list[dict]:
    if not path.is_file():
        return []
    rows: list[dict] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return rows


def trace_steps(rdir: Path, scenario: str, task: str, rep: int) -> list[dict]:
    p = rdir / "traces" / f"{scenario}__{task}__r{rep}" / "steps.json"
    if not p.is_file():
        return []
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    return data if isinstance(data, list) else []


def used_direct_goto(steps: list[dict], task: str) -> bool:
    """True if the first non-trivial agent action is a `goto` to a path
    other than the task's start URL path. We skip leading screenshot/
    ariaTree probes which Stagehand sometimes prepends without LLM input."""
    start_path = urlparse(START_URLS[task]).path or "/"
    start_path = start_path.rstrip("/")
    for s in steps:
        t = s.get("type")
        if t in ("ariaTree", "screenshot"):
            continue
        if t == "goto":
            url = s.get("page_url") or ""
            path = urlparse(url).path or "/"
            path = path.rstrip("/")
            return path != start_path and path != ""
        return False
    return False


def judge_verdict(row: dict) -> str:
    if row.get("error"):
        return "error"
    v = (row.get("judge") or {}).get("pass")
    if v is True:
        return "pass"
    if v is False:
        return "fail"
    return "ungraded"


def mean(xs: list) -> float | None:
    vals = [float(x) for x in xs if x is not None]
    if not vals:
        return None
    return statistics.mean(vals)


def cell(variant: str, task: str) -> dict:
    rdir = run_dir(variant, task)
    rows = load_jsonl(rdir / "results.jsonl")
    by_scen = {s: [] for s in SCENARIOS}
    for r in rows:
        sid = str(r.get("scenario_id") or "")
        if sid in by_scen:
            by_scen[sid].append(r)
    out: dict = {"variant": variant, "task": task, "scenarios": {}}
    for sid in SCENARIOS:
        srows = by_scen[sid]
        if not srows:
            out["scenarios"][sid] = None
            continue
        total = [(r.get("tokens") or {}).get("total") for r in srows]
        cached = [(r.get("tokens") or {}).get("cached") for r in srows]
        steps = [r.get("steps_taken") for r in srows]
        cost = [r.get("cost_usd") for r in srows]
        verdicts = [judge_verdict(r) for r in srows]
        # direct goto from trace
        direct = 0
        for r in srows:
            rep = int(r.get("repetition") or 1)
            sts = trace_steps(rdir, sid, task, rep)
            if used_direct_goto(sts, task):
                direct += 1
        out["scenarios"][sid] = {
            "n": len(srows),
            "total_tokens": mean(total),
            "cached_tokens": mean(cached),
            "steps": mean(steps),
            "cost": mean(cost),
            "pass": verdicts.count("pass"),
            "fail": verdicts.count("fail"),
            "error": verdicts.count("error"),
            "direct_goto": direct,
        }
    return out


def fmt_int(n) -> str:
    if n is None:
        return "—"
    return f"{round(float(n)):,}"


def fmt_pct_delta(a, b) -> str:
    if a in (None, 0) or b is None:
        return "—"
    return f"{(b - a) / a * 100:+.0f}%"


def fmt_money(n) -> str:
    if n is None:
        return "—"
    return f"${float(n):.4f}"


def fmt_steps(n) -> str:
    if n is None:
        return "—"
    return f"{float(n):.1f}"


def render() -> str:
    cells: dict[tuple[str, str], dict] = {}
    for v in VARIANTS:
        for t in TASKS:
            cells[(v, t)] = cell(v, t)

    out: list[str] = []
    out.append("# Expanded autoresearch summary — preamble variants")
    out.append("")
    out.append(
        "Comparison: `gpt5-mini-baseline` (extension off, scenario A) vs "
        "`gpt5-mini-guarded` (extension on, scenario B) across 4 preamble "
        "variants and 6 tasks, n=3 reps each. 24 (variant, task) cells, "
        "144 reps total."
    )
    out.append("")
    out.append("Variants:")
    for v in VARIANTS:
        out.append(f"- **{v}** — `{VARIANT_LABELS[v]}`")
    out.append("")
    out.append(
        "**Direct goto** = the agent's first non-trivial action was a `goto` "
        "to a URL whose path differs from the task's start URL — i.e. the URL "
        "helper template fired. Counted out of n=3 reps per (variant, task, "
        "scenario=B) cell. Lower B-side direct-goto with same pass rate ⇒ "
        "variant suppressed safe URL-helper use; higher with same pass rate ⇒ "
        "variant enabled more direct lookups."
    )
    out.append("")

    # Per-task table
    out.append("## Per-task: guarded (B) vs baseline (A) per variant")
    out.append("")
    for task in TASKS:
        out.append(f"### `{task}`")
        out.append("")
        out.append(
            "| variant | A pass | B pass | A tok | B tok | Δ tok | A steps | B steps | B direct-goto | B cost |"
        )
        out.append("|---|---|---|---|---|---|---|---|---|---|")
        for v in VARIANTS:
            c = cells[(v, task)]["scenarios"]
            a = c.get("gpt5-mini-baseline")
            b = c.get("gpt5-mini-guarded")
            if a is None or b is None:
                out.append(f"| `{v}` ({VARIANT_LABELS[v]}) | — | — | — | — | — | — | — | — | — |")
                continue
            out.append(
                f"| `{v}` ({VARIANT_LABELS[v]}) "
                f"| {a['pass']}/{a['n']} "
                f"| {b['pass']}/{b['n']} "
                f"| {fmt_int(a['total_tokens'])} "
                f"| {fmt_int(b['total_tokens'])} "
                f"| {fmt_pct_delta(a['total_tokens'], b['total_tokens'])} "
                f"| {fmt_steps(a['steps'])} "
                f"| {fmt_steps(b['steps'])} "
                f"| {b['direct_goto']}/{b['n']} "
                f"| {fmt_money(b['cost'])} |"
            )
        out.append("")

    # Cross-task rollup per variant
    out.append("## Cross-task rollup — average across all 6 tasks")
    out.append("")
    out.append(
        "Each metric averaged across the 6 tasks (per-task n=3, so each "
        "averaged cell rolls 18 reps). `B direct-goto` and `B pass` "
        "summed across tasks then expressed as count / 18."
    )
    out.append("")
    out.append(
        "| variant | A pass | B pass | A tok (mean) | B tok (mean) | Δ tok | A steps | B steps | B direct-goto | B cost |"
    )
    out.append("|---|---|---|---|---|---|---|---|---|---|")
    for v in VARIANTS:
        a_pass = 0
        b_pass = 0
        a_n = 0
        b_n = 0
        a_tok = []
        b_tok = []
        a_steps = []
        b_steps = []
        b_cost = []
        b_direct = 0
        for t in TASKS:
            c = cells[(v, t)]["scenarios"]
            a = c.get("gpt5-mini-baseline")
            b = c.get("gpt5-mini-guarded")
            if a is None or b is None:
                continue
            a_pass += a["pass"]
            b_pass += b["pass"]
            a_n += a["n"]
            b_n += b["n"]
            if a["total_tokens"] is not None:
                a_tok.append(a["total_tokens"])
            if b["total_tokens"] is not None:
                b_tok.append(b["total_tokens"])
            if a["steps"] is not None:
                a_steps.append(a["steps"])
            if b["steps"] is not None:
                b_steps.append(b["steps"])
            if b["cost"] is not None:
                b_cost.append(b["cost"])
            b_direct += b["direct_goto"]
        out.append(
            f"| `{v}` ({VARIANT_LABELS[v]}) "
            f"| {a_pass}/{a_n} "
            f"| {b_pass}/{b_n} "
            f"| {fmt_int(mean(a_tok))} "
            f"| {fmt_int(mean(b_tok))} "
            f"| {fmt_pct_delta(mean(a_tok), mean(b_tok))} "
            f"| {fmt_steps(mean(a_steps))} "
            f"| {fmt_steps(mean(b_steps))} "
            f"| {b_direct}/{b_n} "
            f"| {fmt_money(mean(b_cost))} |"
        )
    out.append("")

    # Per-task direct-goto matrix for quick visual scan
    out.append("## Direct-goto matrix (B side)")
    out.append("")
    out.append("Rows = task, columns = variant. Cells = `direct-goto / n reps`.")
    out.append("")
    header = "| task | " + " | ".join(f"`{v}` ({VARIANT_LABELS[v]})" for v in VARIANTS) + " |"
    out.append(header)
    out.append("|" + "---|" * (len(VARIANTS) + 1))
    for task in TASKS:
        row = [f"`{task}`"]
        for v in VARIANTS:
            b = cells[(v, task)]["scenarios"].get("gpt5-mini-guarded")
            if b is None:
                row.append("—")
            else:
                row.append(f"{b['direct_goto']}/{b['n']}")
        out.append("| " + " | ".join(row) + " |")
    out.append("")

    return "\n".join(out)


def main() -> int:
    md = render()
    out_path = RESULTS_ROOT / "expand_summary.md"
    out_path.write_text(md, encoding="utf-8")
    print(f"wrote {out_path.relative_to(REPO_ROOT)}")
    print()
    print(md)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
