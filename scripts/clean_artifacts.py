#!/usr/bin/env -S uv run --script
# Copyright (c) 2026 PixieBrix, Inc.
# Licensed under PolyForm Shield 1.0.0 — see LICENSE.

# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Clean out old benchmark run artifacts from `output/results/` and `output/reports/`.

A "run artifact" is everything under one of:

  output/results/<run_id>/           # manifest, results.jsonl, events/, traces/
  output/reports/<run_id>*.html      # build_traces.py side-by-side diff pages

Run IDs are timestamped (`run_YYYYMMDD_HHMMSS_xxxx`), so lexicographic order is
chronological. By default the script keeps the N most-recent runs and reports
what it would delete without actually deleting; pass `--apply` to commit.

Examples:

  # Dry-run: show what would be deleted, keeping the 3 most recent runs
  uv run scripts/clean_artifacts.py

  # Actually delete, keeping the 5 most recent runs
  uv run scripts/clean_artifacts.py --keep 5 --apply

  # Keep only one explicit run plus the latest two
  uv run scripts/clean_artifacts.py --keep 2 --keep-run run_20260526_015924_0377 --apply

  # Delete reports/ orphans only (HTML files whose run_id is no longer in results/)
  uv run scripts/clean_artifacts.py --orphans-only --apply
"""

from __future__ import annotations

import argparse
import re
import shutil
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
RESULTS_DIR = REPO_ROOT / "output" / "results"
REPORTS_DIR = REPO_ROOT / "output" / "reports"

RUN_ID_RE = re.compile(r"^run_\d{8}_\d{6}_[0-9a-f]+$")
REPORT_FILE_RE = re.compile(r"^(run_\d{8}_\d{6}_[0-9a-f]+)(?:__.+)?\.html$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--keep",
        type=int,
        default=3,
        help="Number of most-recent runs to retain (default: 3).",
    )
    parser.add_argument(
        "--keep-run",
        action="append",
        default=[],
        metavar="RUN_ID",
        help="Explicit run ID to retain in addition to --keep. May be repeated.",
    )
    parser.add_argument(
        "--orphans-only",
        action="store_true",
        help="Only delete reports whose run_id is not in output/results/. Leaves all results alone.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually delete. Without this flag, the script is dry-run.",
    )
    return parser.parse_args()


def list_runs() -> list[str]:
    if not RESULTS_DIR.exists():
        return []
    return sorted(
        (p.name for p in RESULTS_DIR.iterdir() if p.is_dir() and RUN_ID_RE.match(p.name)),
        reverse=True,
    )


def dir_size_bytes(path: Path) -> int:
    if not path.exists():
        return 0
    total = 0
    for item in path.rglob("*"):
        if item.is_file():
            try:
                total += item.stat().st_size
            except OSError:
                pass
    return total


def fmt_bytes(n: int) -> str:
    size = float(n)
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024:
            return f"{int(size)}B" if unit == "B" else f"{size:.1f}{unit}"
        size /= 1024
    return f"{size:.1f}TB"


def report_paths_for(run_id: str) -> list[Path]:
    if not REPORTS_DIR.exists():
        return []
    return sorted(
        p
        for p in REPORTS_DIR.iterdir()
        if (p.is_file() and p.name.startswith(f"{run_id}.")) or p.name.startswith(f"{run_id}__")
    )


def orphan_reports(known_run_ids: set[str]) -> list[Path]:
    if not REPORTS_DIR.exists():
        return []
    orphans = []
    for p in sorted(REPORTS_DIR.iterdir()):
        if not p.is_file():
            continue
        m = REPORT_FILE_RE.match(p.name)
        if not m:
            continue
        if m.group(1) not in known_run_ids:
            orphans.append(p)
    return orphans


def main() -> int:
    args = parse_args()

    runs = list_runs()
    known_run_ids = set(runs)

    if args.orphans_only:
        to_keep = set(runs)
        to_delete_runs: list[str] = []
    else:
        explicit_keep = set(args.keep_run)
        unknown = explicit_keep - known_run_ids
        if unknown:
            print(
                f"warning: --keep-run referenced unknown runs: {sorted(unknown)}",
                file=sys.stderr,
            )
        to_keep = set(runs[: max(args.keep, 0)]) | (explicit_keep & known_run_ids)
        to_delete_runs = [r for r in runs if r not in to_keep]

    orphans = orphan_reports(known_run_ids)

    if not to_delete_runs and not orphans:
        print("nothing to clean.")
        if runs:
            print(f"  retained {len(runs)} run(s): {', '.join(sorted(to_keep, reverse=True))}")
        return 0

    action = "deleting" if args.apply else "would delete"
    total_bytes = 0

    if to_delete_runs:
        print(f"== {action} {len(to_delete_runs)} run(s) ==")
        for run_id in to_delete_runs:
            run_dir = RESULTS_DIR / run_id
            reports = report_paths_for(run_id)
            size = dir_size_bytes(run_dir) + sum(p.stat().st_size for p in reports if p.exists())
            total_bytes += size
            print(f"  {run_id}  ({fmt_bytes(size)}, {len(reports)} report file(s))")
            if args.apply:
                if run_dir.exists():
                    shutil.rmtree(run_dir)
                for p in reports:
                    p.unlink(missing_ok=True)

    if orphans:
        print(f"== {action} {len(orphans)} orphan report(s) ==")
        for p in orphans:
            size = p.stat().st_size
            total_bytes += size
            print(f"  {p.name}  ({fmt_bytes(size)})")
            if args.apply:
                p.unlink(missing_ok=True)

    print()
    print(f"total: {fmt_bytes(total_bytes)} ({'freed' if args.apply else 'would be freed'})")
    if to_keep:
        print(f"retained: {', '.join(sorted(to_keep, reverse=True))}")
    if not args.apply:
        print("dry-run only — re-run with --apply to delete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
