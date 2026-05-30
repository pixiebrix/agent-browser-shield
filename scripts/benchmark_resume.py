#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "browserbase>=1.7.0",
#     "stagehand>=0.5.0",
#     "python-dotenv>=1.0.0",
#     "pyyaml>=6.0",
#     "anthropic>=0.40.0",
#     "openai>=1.50.0",
# ]
# ///
"""Resume / repair an incomplete benchmark run.

One command that finishes any unfinished work in an existing run:

  uv run scripts/benchmark_resume.py --run-id <run_id>

What it reruns:
  - Rows missing from results.jsonl entirely.
  - Rows whose `error` field is non-null (infrastructure failure mid-session:
    Browserbase disconnect, model-API connection error, Stagehand crash).

What it does NOT rerun:
  - Rows where the agent completed but gave a wrong answer.
  - Rows where the agent exhausted `max_steps` without a final answer.
  Those are legitimate results, not failures to retry.

After Browserbase reruns finish, it also backfills any null
`judge` / `extracted_answer` / `blocked_by_defense` fields via the
configured LLM-as-judge model. No flags needed — every backfill that
applies is run automatically. The script is idempotent: re-running it
on a complete run is a no-op.

Scenario + task definitions come from the run's `manifest.json` (frozen
at original run time), so editing `benchmark/tasks.csv` afterwards has
no effect on what gets retried.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

from browserbase import Browserbase
from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parent.parent
RESULTS_ROOT = REPO_ROOT / "output" / "results"

sys.path.insert(0, str(Path(__file__).resolve().parent))
import benchmark_report  # noqa: E402
import benchmark_run  # noqa: E402
from _stagehand import LOG, configure_logging, optional_env, require_env  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--run-id", required=True)
    parser.add_argument(
        "--concurrency",
        type=int,
        default=25,
        help="Max concurrent Browserbase sessions (default: 25).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the plan (rows that would be retried + backfilled) and exit.",
    )
    parser.add_argument("-v", "--verbose", action="count", default=0)
    return parser.parse_args()


def reconstruct_scenarios(manifest: dict[str, Any]) -> list[benchmark_run.Scenario]:
    return [
        benchmark_run.Scenario(
            id=s["id"],
            extension=bool(s.get("extension", False)),
            model=s["model"],
            max_steps=int(s["max_steps"]),
        )
        for s in manifest.get("scenarios") or []
    ]


def reconstruct_tasks(manifest: dict[str, Any]) -> list[benchmark_run.Task]:
    return [
        benchmark_run.Task(
            id=t["id"],
            url=t["url"],
            task=t["task"],
            success_criteria=t["success_criteria"],
            max_steps=t.get("max_steps"),
        )
        for t in manifest.get("tasks") or []
    ]


def classify_units(
    scenarios: list[benchmark_run.Scenario],
    tasks: list[benchmark_run.Task],
    repetitions: int,
    last_by_key: dict[tuple[str, str, int], dict[str, Any]],
) -> list[tuple[benchmark_run.WorkUnit, str]]:
    """Return work units needing a Browserbase rerun, paired with a reason
    string ('missing' or 'error: …') for the plan summary."""
    out: list[tuple[benchmark_run.WorkUnit, str]] = []
    for sc in scenarios:
        for tk in tasks:
            for rep in range(1, repetitions + 1):
                row = last_by_key.get((sc.id, tk.id, rep))
                if row is None:
                    out.append((benchmark_run.WorkUnit(sc, tk, rep), "missing"))
                elif row.get("error"):
                    snippet = str(row["error"])[:80]
                    out.append((benchmark_run.WorkUnit(sc, tk, rep), f"error: {snippet}"))
    return out


def count_pending_backfills(rows: list[dict[str, Any]]) -> dict[str, int]:
    """Estimate how many rows need each LLM backfill. Matches the filters
    inside benchmark_report.run_judge / run_extractor / run_block_detector."""
    has_answer = [r for r in rows if r.get("error") is None and r.get("final_answer") is not None]
    return {
        "judge": sum(1 for r in has_answer if r.get("judge") is None),
        "extract": sum(1 for r in has_answer if r.get("extracted_answer") is None),
        "blocked_by_defense": sum(1 for r in rows if r.get("blocked_by_defense") is None),
    }


def upload_extension(manifest: dict[str, Any], bb_api_key: str) -> str:
    """Resolve + upload the extension zip recorded in the manifest. Warn if
    the on-disk SHA differs from what the original run recorded."""
    ext_zip_rel = manifest.get("extension_zip")
    ext_zip = (REPO_ROOT / ext_zip_rel) if ext_zip_rel else benchmark_run.DEFAULT_EXTENSION_ZIP
    if not ext_zip.is_file():
        sys.exit(
            f"Extension zip not found at {ext_zip} — needed because the run "
            f"includes a scenario with extension=true. Rebuild with "
            f"`cd extension && bun run build && bun run package` or restore "
            f"the file at the recorded path."
        )
    current_sha = benchmark_run.sha256_file(ext_zip)
    recorded = manifest.get("extension_zip_sha256")
    if recorded and recorded != current_sha:
        LOG.warning(
            "extension zip SHA differs from original run "
            "(current=%s..., recorded=%s...); retried sessions will use the "
            "CURRENT zip",
            current_sha[:12],
            recorded[:12],
        )
    bb = Browserbase(api_key=bb_api_key)
    with ext_zip.open("rb") as fh:
        extension = bb.extensions.create(file=fh)
    LOG.info("uploaded extension %s (%s)", extension.id, ext_zip.name)
    return extension.id


def run_browserbase_retries(
    *,
    run_id: str,
    work: list[tuple[benchmark_run.WorkUnit, str]],
    results_path: Path,
    events_dir: Path,
    manifest: dict[str, Any],
    pricing: dict[str, dict[str, float]],
    judge_model: str | None,
    concurrency: int,
) -> tuple[int, int]:
    """Spin Browserbase sessions for each unit in `work`. Returns (ok, err)."""
    bb_api_key = require_env("BROWSERBASE_API_KEY")
    bb_project_id = require_env("BROWSERBASE_PROJECT_ID")
    model_api_key = optional_env("MODEL_API_KEY")
    if model_api_key is None:
        LOG.info("MODEL_API_KEY not set; routing agent via Browserbase Model Gateway")

    needs_extension = any(unit.scenario.extension for unit, _ in work)
    extension_id = upload_extension(manifest, bb_api_key) if needs_extension else None

    sink = benchmark_run.JsonlSink(results_path)
    started = time.monotonic()
    ok = err = 0
    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        futures = {
            pool.submit(
                benchmark_run.run_one,
                unit,
                run_id=run_id,
                bb_api_key=bb_api_key,
                bb_project_id=bb_project_id,
                model_api_key=model_api_key,
                extension_id=extension_id,
                pricing=pricing,
                events_dir=events_dir,
                results=sink,
                judge_model=judge_model,
            ): unit
            for unit, _ in work
        }
        for index, future in enumerate(as_completed(futures), start=1):
            unit = futures[future]
            try:
                record = future.result()
            except Exception as exc:
                err += 1
                LOG.exception(
                    "worker crashed for %s/%s_r%d",
                    unit.scenario.id,
                    unit.task.id,
                    unit.repetition,
                )
                print(
                    f"  [{index}/{len(work)}] CRASH "
                    f"{unit.scenario.id}/{unit.task.id}_r{unit.repetition}: {exc}"
                )
                continue
            if record.get("error"):
                err += 1
                status = "ERR"
            else:
                ok += 1
                status = "OK "
            print(
                f"  [{index}/{len(work)}] {status} "
                f"{unit.scenario.id}/{unit.task.id}_r{unit.repetition} "
                f"({record.get('duration_s')}s) -> "
                f"{record.get('session_url') or 'no session'}"
            )
    print(f"\nBrowserbase: {ok} ok, {err} failed in {time.monotonic() - started:.1f}s")
    return ok, err


def main() -> int:
    load_dotenv(REPO_ROOT / ".env")
    args = parse_args()
    configure_logging(args.verbose)

    run_dir = RESULTS_ROOT / args.run_id
    if not run_dir.is_dir():
        sys.exit(f"run dir not found: {run_dir}")
    manifest_path = run_dir / "manifest.json"
    results_path = run_dir / "results.jsonl"
    if not manifest_path.is_file():
        sys.exit(f"manifest not found: {manifest_path}")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    scenarios = reconstruct_scenarios(manifest)
    tasks = reconstruct_tasks(manifest)
    repetitions = int(manifest.get("repetitions") or 3)
    judge_model: str | None = manifest.get("judge_model")
    pricing_rel = manifest.get("pricing_file")
    pricing_path = (REPO_ROOT / pricing_rel) if pricing_rel else benchmark_run.DEFAULT_PRICING
    pricing = benchmark_run.load_pricing(pricing_path)

    rows = benchmark_report.load_jsonl(results_path)
    last_by_key = {(r["scenario_id"], r["task_id"], int(r.get("repetition") or 1)): r for r in rows}

    work = classify_units(scenarios, tasks, repetitions, last_by_key)
    backfill_estimate = count_pending_backfills(rows)

    expected = len(scenarios) * len(tasks) * repetitions
    print(f"run_id: {args.run_id}")
    print(
        f"expected units: {expected}  "
        f"existing: {len(last_by_key)}  "
        f"to rerun on Browserbase: {len(work)}"
    )
    if work:
        for unit, reason in work:
            print(f"  - {unit.scenario.id}/{unit.task.id}_r{unit.repetition}  [{reason}]")
    if any(v for v in backfill_estimate.values()):
        print("pending LLM backfills (before retry):")
        for field, n in backfill_estimate.items():
            if n:
                print(f"  - {field}: {n}")
    if not work and not any(v for v in backfill_estimate.values()):
        print("nothing to do — run is already complete")
        return 0

    if args.dry_run:
        return 0

    events_dir = run_dir / "events"
    events_dir.mkdir(parents=True, exist_ok=True)

    if work:
        run_browserbase_retries(
            run_id=args.run_id,
            work=work,
            results_path=results_path,
            events_dir=events_dir,
            manifest=manifest,
            pricing=pricing,
            judge_model=judge_model,
            concurrency=args.concurrency,
        )

    if judge_model:
        # Reload after the Browserbase pass so backfills see fresh rows
        # (and any inline-judged fields the retries already populated).
        rows = benchmark_report.load_jsonl(results_path)
        benchmark_report.run_judge(results_path, rows, judge_model=judge_model, rejudge=False)
        rows = benchmark_report.load_jsonl(results_path)
        benchmark_report.run_extractor(results_path, rows, judge_model=judge_model, reextract=False)
        rows = benchmark_report.load_jsonl(results_path)
        benchmark_report.run_block_detector(
            results_path, rows, judge_model=judge_model, redetect=False
        )
    else:
        print("manifest has no judge_model; skipping judge / extract / block-detector backfills")

    print(
        f"\nresume complete. render report: "
        f"uv run scripts/benchmark_report.py --run-id {args.run_id} --open"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
