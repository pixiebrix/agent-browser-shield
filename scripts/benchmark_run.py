#!/usr/bin/env -S uv run --script
# Copyright (c) 2026 PixieBrix, Inc.
# Licensed under PolyForm Shield 1.0.0 — see LICENSE.

# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "browserbase>=1.7.0",
#     "stagehand>=0.5.0",
#     "python-dotenv>=1.0.0",
#     "pyyaml>=6.0",
#     "anthropic>=0.40.0",
#     "openai>=1.50.0",
#     "cryptography>=42.0.0",
# ]
# ///
"""Run a matrix of (scenario × task) work units on Browserbase + Stagehand,
streaming partial results to a JSONL file under a per-run nonce.

Each successful task is judged inline by an LLM-as-judge right after it
finishes, so results.jsonl carries verdicts as soon as rows land. Pass
--no-judge to skip; re-grade later with `benchmark_report.py --judge`.

Usage:
  uv run scripts/benchmark_run.py \\
      --scenarios benchmark/scenarios.example.yaml \\
      --tasks benchmark/tasks.csv \\
      --concurrency 25

Output:
  output/results/<run_id>/manifest.json
  output/results/<run_id>/results.jsonl
  output/results/<run_id>/events/<scenario>_<task>.jsonl

Render report (judging already done inline):
  uv run scripts/benchmark_report.py --run-id <run_id> --open

Re-judge everything (e.g., after changing judge_model or the prompt):
  uv run scripts/benchmark_report.py --run-id <run_id> --judge --rejudge
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import fnmatch
import hashlib
import json
import os
import secrets
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml
from browserbase import Browserbase
from dotenv import load_dotenv
from stagehand import Stagehand

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _blockcheck import call_block_detector, summarize_trajectory
from _bu_bench import (
    decrypt_bu_bench,
    load_plain_bu_bench,
    synthesize_criteria,
)
from _judge import call_extractor, call_judge, resolve_judge_model
from _stagehand import (
    LOG,
    configure_logging,
    event_to_dict,
    extract_usage,
    optional_env,
    require_env,
)

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_EXTENSION_ZIP = REPO_ROOT / "output" / "extension.zip"
DEFAULT_PRICING = REPO_ROOT / "benchmark" / "pricing.json"
RESULTS_ROOT = REPO_ROOT / "output" / "results"


@dataclass
class Scenario:
    id: str
    extension: bool
    model: str
    max_steps: int
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass
class Task:
    id: str
    url: str | None
    task: str
    success_criteria: str
    max_steps: int | None = None


@dataclass
class WorkUnit:
    scenario: Scenario
    task: Task
    repetition: int = 1


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--scenarios", type=Path, required=True)
    parser.add_argument("--tasks", type=Path, required=True)
    parser.add_argument(
        "--extension-zip",
        type=Path,
        default=DEFAULT_EXTENSION_ZIP,
        help=f"Default: {DEFAULT_EXTENSION_ZIP.relative_to(REPO_ROOT)}",
    )
    parser.add_argument(
        "--pricing",
        type=Path,
        default=DEFAULT_PRICING,
        help=f"Default: {DEFAULT_PRICING.relative_to(REPO_ROOT)}",
    )
    parser.add_argument("--concurrency", type=int, default=25)
    parser.add_argument(
        "-n",
        "--repetitions",
        type=int,
        default=None,
        help="Run each (scenario × task) N times in fresh sessions. "
        "Overrides defaults.repetitions from the scenarios file. "
        "If neither is set, defaults to 3.",
    )
    parser.add_argument(
        "--run-id",
        default=None,
        help="Override the auto-generated run id (run_<utc_ts>_<nonce>).",
    )
    parser.add_argument(
        "--scenario",
        action="append",
        default=[],
        metavar="GLOB",
        help="Only run scenarios matching this glob. Repeatable.",
    )
    parser.add_argument(
        "--task",
        action="append",
        default=[],
        metavar="GLOB",
        help="Only run tasks matching this glob. Repeatable.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the planned work units and exit without launching sessions.",
    )
    parser.add_argument(
        "--judge-model",
        default=None,
        help="Override judge model (default: defaults.judge_model from scenarios "
        "file, then openai/gpt-4o-mini).",
    )
    parser.add_argument(
        "--no-judge",
        action="store_true",
        help="Skip the inline judge call after each task. Use benchmark_report.py "
        "--judge to grade later.",
    )
    parser.add_argument(
        "--llm-proxy-url",
        default=None,
        help="Route Stagehand's agent LLM calls through this OpenAI-compatible "
        "endpoint (e.g. a cloudflared tunnel exposing scripts/llm_proxy.py) so "
        "the proxy can log the full messages array per step. Requires "
        "OPENROUTER_API_KEY in env (forwarded as the agent's api_key). Only "
        "the agent calls are proxied — judge/extractor continue calling "
        "OpenAI directly with OPENAI_API_KEY.",
    )
    parser.add_argument("-v", "--verbose", action="count", default=0)
    return parser.parse_args()


def load_scenarios(path: Path) -> tuple[list[Scenario], dict[str, Any]]:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    defaults: dict[str, Any] = dict(data.get("defaults") or {})
    raw_scenarios = data.get("scenarios") or []
    if not raw_scenarios:
        sys.exit(f"{path}: no scenarios defined")

    scenarios: list[Scenario] = []
    seen_ids: set[str] = set()
    for index, raw in enumerate(raw_scenarios):
        if not isinstance(raw, dict):
            sys.exit(f"{path}: scenarios[{index}] must be a mapping")
        merged = {**defaults, **raw}
        sid = merged.get("id")
        if not sid:
            sys.exit(f"{path}: scenarios[{index}] missing required 'id'")
        if sid in seen_ids:
            sys.exit(f"{path}: duplicate scenario id: {sid}")
        seen_ids.add(sid)

        extension_field = merged.get("extension", False)
        if isinstance(extension_field, dict):
            LOG.warning(
                "scenario %s: extension is a mapping (rule-level config); "
                "v1 ignores rule overrides and treats this as extension=True.",
                sid,
            )
            extension = True
        else:
            extension = bool(extension_field)

        model = merged.get("model")
        if not model:
            sys.exit(f"{path}: scenarios[{index}] ({sid}) missing required 'model'")

        max_steps = int(merged.get("max_steps", 15))
        scenarios.append(
            Scenario(
                id=sid,
                extension=extension,
                model=model,
                max_steps=max_steps,
                raw=raw,
            )
        )
    return scenarios, defaults


TRUTHY = {"true", "1", "yes", "y", "on"}
FALSY = {"false", "0", "no", "n", "off"}


def parse_enabled(value: str | None, path: Path, row_no: int) -> bool:
    """Parse the optional `enabled` column. Empty / missing → True."""
    if value is None:
        return True
    text = value.strip().lower()
    if text == "":
        return True
    if text in TRUTHY:
        return True
    if text in FALSY:
        return False
    sys.exit(
        f"{path}: row {row_no} has invalid 'enabled' value {value!r} "
        f"(expected true/false/yes/no/1/0 or empty)"
    )


def parse_optional_max_steps(value: str | None, path: Path, row_no: int) -> int | None:
    """Parse the optional `max_steps` column. Empty / missing → None (use scenario)."""
    if value is None or value.strip() == "":
        return None
    try:
        parsed = int(value.strip())
    except ValueError:
        sys.exit(
            f"{path}: row {row_no} has invalid 'max_steps' value {value!r} "
            f"(expected a positive integer or empty)"
        )
    if parsed < 1:
        sys.exit(f"{path}: row {row_no} has invalid 'max_steps' value {value!r} (must be >= 1)")
    return parsed


def load_tasks(path: Path) -> list[Task]:
    """Dispatch on file extension: .csv → agent-browser-shield CSV; .enc/.json/.jsonl → BU Bench."""
    suffix = path.suffix.lower()
    if suffix == ".csv":
        return _load_csv_tasks(path)
    if suffix in (".enc", ".json", ".jsonl"):
        return _load_bu_bench_tasks(path)
    sys.exit(
        f"{path}: unsupported tasks file extension {suffix!r} "
        "(expected .csv, .enc, .json, or .jsonl)"
    )


def _load_csv_tasks(path: Path) -> list[Task]:
    tasks: list[Task] = []
    seen_ids: set[str] = set()
    skipped: list[str] = []
    with path.open(encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for index, row in enumerate(reader):
            row_no = index + 2  # +1 for header, +1 for 1-indexing
            for field_name in ("id", "url", "task", "success_criteria"):
                if not (row.get(field_name) or "").strip():
                    sys.exit(f"{path}: row {row_no} missing required column '{field_name}'")
            tid = row["id"].strip()
            if tid in seen_ids:
                sys.exit(f"{path}: duplicate task id: {tid}")
            seen_ids.add(tid)
            if not parse_enabled(row.get("enabled"), path, row_no):
                skipped.append(tid)
                continue
            tasks.append(
                Task(
                    id=tid,
                    url=row["url"].strip(),
                    task=row["task"].strip(),
                    success_criteria=row["success_criteria"].strip(),
                    max_steps=parse_optional_max_steps(row.get("max_steps"), path, row_no),
                )
            )
    if not tasks:
        sys.exit(f"{path}: no tasks enabled (all rows disabled or file empty)")
    if skipped:
        LOG.info("skipping %d disabled task(s): %s", len(skipped), ", ".join(skipped))
    return tasks


def _load_bu_bench_tasks(path: Path) -> list[Task]:
    """Load Browser Use BU Bench V1 tasks (encrypted .enc or plain .json/.jsonl).

    BU Bench tasks ship as `{task_id, category, confirmed_task, answer?}` with
    no starting URL (the agent navigates from about:blank; URLs are embedded
    in the task text when needed) and no per-task step budget (use scenario).
    """
    if path.suffix.lower() == ".enc":
        entries = decrypt_bu_bench(path)
    else:
        entries = load_plain_bu_bench(path)

    tasks: list[Task] = []
    seen_ids: set[str] = set()
    for index, entry in enumerate(entries):
        if not isinstance(entry, dict):
            sys.exit(f"{path}: entry {index} is not a JSON object")
        tid = str(entry.get("task_id") or "").strip()
        confirmed = str(entry.get("confirmed_task") or "").strip()
        if not tid:
            sys.exit(f"{path}: entry {index} missing 'task_id'")
        if not confirmed:
            sys.exit(f"{path}: entry {index} ({tid}) missing 'confirmed_task'")
        if tid in seen_ids:
            sys.exit(f"{path}: duplicate task_id: {tid}")
        seen_ids.add(tid)
        tasks.append(
            Task(
                id=tid,
                url=None,
                task=confirmed,
                success_criteria=synthesize_criteria(entry),
                max_steps=None,
            )
        )
    if not tasks:
        sys.exit(f"{path}: no tasks found")
    return tasks


def apply_globs(items: list[str], globs: list[str]) -> set[str]:
    if not globs:
        return set(items)
    matched: set[str] = set()
    for pattern in globs:
        matched.update(name for name in items if fnmatch.fnmatchcase(name, pattern))
    return matched


def mint_run_id() -> str:
    ts = dt.datetime.now(dt.UTC).strftime("%Y%m%d_%H%M%S")
    return f"run_{ts}_{secrets.token_hex(2)}"


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def git_sha() -> str | None:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=REPO_ROOT, text=True
        ).strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


def load_pricing(path: Path) -> dict[str, dict[str, float]]:
    if not path.is_file():
        LOG.warning("pricing file %s not found; all cost_usd will be null", path)
        return {}
    raw = json.loads(path.read_text(encoding="utf-8"))
    return {k: v for k, v in raw.items() if not k.startswith("_")}


def compute_cost(
    model: str, tokens: dict[str, int] | None, pricing: dict[str, dict[str, float]]
) -> tuple[float | None, bool]:
    """Return (cost_usd, pricing_missing). cost is None when tokens are unknown
    or the model isn't in the pricing table."""
    entry = pricing.get(model)
    if entry is None:
        return None, True
    if not tokens:
        return None, False
    input_tok = tokens.get("input") or 0
    output_tok = tokens.get("output") or 0
    cost = (input_tok / 1_000_000.0) * entry["input_per_mtok"] + (output_tok / 1_000_000.0) * entry[
        "output_per_mtok"
    ]
    return round(cost, 6), False


# extract_usage lives in _stagehand.py so benchmark_report can re-aggregate
# token usage from events/*.jsonl without pulling in the Stagehand SDK.


def event_type_of(payload: Any) -> str | None:
    """Pull the event-name from a converted event dict.

    `event_to_dict` normalizes the SDK's `(name, payload)` tuple into
    `{"type": name, "payload": ...}` — we read it back from there.
    """
    if isinstance(payload, dict):
        return payload.get("type")
    return None


def extract_data_result(event_dict: Any) -> dict[str, Any] | None:
    """For a converted `data` event, return the inner `DataResult` dict.

    Stagehand's data event shape: `{"type": "data", "payload": {"result": {...}}}`
    where `result` carries `actions`, `completed`, `message`, `usage`, etc.
    """
    if not isinstance(event_dict, dict):
        return None
    if event_dict.get("type") != "data":
        return None
    payload = event_dict.get("payload")
    if not isinstance(payload, dict):
        return None
    result = payload.get("result")
    return result if isinstance(result, dict) else None


def safe_filename(part: str) -> str:
    return "".join(c if (c.isalnum() or c in "-_.") else "_" for c in part)


class JsonlSink:
    """Thread-safe append-and-flush JSONL writer."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.lock = threading.Lock()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        # Touch the file so report.py can show "0 rows so far" instead of FileNotFound.
        self.path.touch(exist_ok=True)

    def append(self, record: dict[str, Any]) -> None:
        line = json.dumps(record, default=str, sort_keys=True)
        with self.lock:
            with self.path.open("a", encoding="utf-8") as fh:
                fh.write(line + "\n")
                fh.flush()
                os.fsync(fh.fileno())


def _agent_model_config(model: str, proxy_url: str | None, openrouter_api_key: str | None) -> Any:
    """Build the `agent_config.model` value.

    When no proxy is configured, the model is passed as a string and Stagehand
    routes through the Browserbase Model Gateway (or `model_api_key` if set).
    When a proxy URL is configured, the model is a structured object whose
    `base_url` points at the proxy and whose `api_key` is the developer's
    OpenRouter key — Browserbase calls the proxy in place of OpenRouter.

    The `openai/` provider prefix is stripped before handing the name to
    Stagehand: with `provider: openai`, Stagehand validates the model against
    OpenAI's catalog and rejects the prefixed form client-side ("Failed to
    execute task: Not Found"). The proxy re-prefixes the bare name when
    forwarding to OpenRouter, which needs the prefix as its routing key.
    """
    if not proxy_url:
        return model
    if not openrouter_api_key:
        sys.exit(
            "--llm-proxy-url requires OPENROUTER_API_KEY in env (forwarded to the "
            "proxy as the agent's api_key)"
        )
    bare = model.split("/", 1)[1] if model.startswith("openai/") else model
    return {
        "provider": "openai",
        "modelName": bare,
        "baseURL": proxy_url.rstrip("/"),
        "apiKey": openrouter_api_key,
    }


def run_one(
    unit: WorkUnit,
    *,
    run_id: str,
    bb_api_key: str,
    bb_project_id: str,
    model_api_key: str | None,
    extension_id: str | None,
    pricing: dict[str, dict[str, float]],
    events_dir: Path,
    results: JsonlSink,
    judge_model: str | None,
    llm_proxy_url: str | None = None,
    openrouter_api_key: str | None = None,
) -> dict[str, Any]:
    """Run a single (scenario, task, repetition). Always writes one row to
    results.jsonl, even on failure."""
    scenario, task = unit.scenario, unit.task
    effective_max_steps = task.max_steps if task.max_steps is not None else scenario.max_steps
    started_at = dt.datetime.now(dt.UTC)
    record: dict[str, Any] = {
        "run_id": run_id,
        "scenario_id": scenario.id,
        "task_id": task.id,
        "repetition": unit.repetition,
        "model": scenario.model,
        "extension": scenario.extension,
        "max_steps": effective_max_steps,
        "started_at": started_at.isoformat().replace("+00:00", "Z"),
        "ended_at": None,
        "duration_s": None,
        "session_id": None,
        "session_url": None,
        "steps_taken": 0,
        "completed_within_budget": False,
        "final_answer": None,
        "tokens": None,
        "tokens_missing": True,
        "cost_usd": None,
        "pricing_missing": False,
        "judge": None,
        "extracted_answer": None,
        "blocked_by_defense": None,
        "error": None,
    }

    event_path = events_dir / (
        f"{safe_filename(scenario.id)}_{safe_filename(task.id)}_r{unit.repetition}.jsonl"
    )
    event_path.parent.mkdir(parents=True, exist_ok=True)

    bb_create_params: dict[str, object] = {}
    if scenario.extension and extension_id:
        bb_create_params["extension_id"] = extension_id

    stagehand_kwargs: dict[str, object] = {
        "browserbase_api_key": bb_api_key,
        "browserbase_project_id": bb_project_id,
        "timeout": 600.0,
    }
    if model_api_key is not None:
        stagehand_kwargs["model_api_key"] = model_api_key
    stagehand = Stagehand(**stagehand_kwargs)
    session = None
    try:
        session = stagehand.sessions.start(
            model_name=scenario.model,
            browserbase_session_create_params=bb_create_params or None,
        )
        record["session_id"] = session.id
        record["session_url"] = f"https://www.browserbase.com/sessions/{session.id}"
        LOG.info(
            "[%s/%s_r%d] session=%s",
            scenario.id,
            task.id,
            unit.repetition,
            session.id,
        )

        if task.url:
            stagehand.sessions.navigate(id=session.id, url=task.url)

        agg_tokens: dict[str, int] = {"input": 0, "output": 0, "total": 0}
        agg_optional: dict[str, int] = {}
        any_usage = False
        steps = 0
        final_answer: str | None = None
        result_completed = False

        with event_path.open("w", encoding="utf-8") as event_fh:
            for event in stagehand.sessions.execute(
                id=session.id,
                agent_config={
                    "model": _agent_model_config(scenario.model, llm_proxy_url, openrouter_api_key)
                },
                execute_options={
                    "instruction": task.task,
                    "maxSteps": effective_max_steps,
                },
            ):
                event_dict = event_to_dict(event)
                event_fh.write(json.dumps(event_dict, default=str) + "\n")
                event_fh.flush()

                result = extract_data_result(event_dict)
                if result is not None:
                    actions = result.get("actions")
                    if isinstance(actions, list):
                        steps = len(actions)
                    if result.get("completed") is True:
                        result_completed = True
                    message = result.get("message")
                    if isinstance(message, str) and message.strip():
                        final_answer = message

                usage = extract_usage(event_dict)
                if usage:
                    any_usage = True
                    agg_tokens["input"] += usage["input"]
                    agg_tokens["output"] += usage["output"]
                    agg_tokens["total"] += usage["total"]
                    for opt_key in ("cached", "cache_creation", "reasoning"):
                        if opt_key in usage:
                            agg_optional[opt_key] = agg_optional.get(opt_key, 0) + usage[opt_key]

        record["steps_taken"] = steps
        record["completed_within_budget"] = result_completed and steps <= effective_max_steps
        record["final_answer"] = final_answer
        if any_usage:
            record["tokens"] = {**agg_tokens, **agg_optional}
            record["tokens_missing"] = False
        cost, pricing_missing = compute_cost(scenario.model, record["tokens"], pricing)
        record["cost_usd"] = cost
        record["pricing_missing"] = pricing_missing
    except Exception as exc:
        LOG.exception("[%s/%s_r%d] failed", scenario.id, task.id, unit.repetition)
        record["error"] = f"{type(exc).__name__}: {exc}"
    finally:
        if session is not None:
            try:
                stagehand.sessions.end(id=session.id)
            except Exception as exc:
                LOG.warning(
                    "[%s/%s_r%d] session.end failed: %s",
                    scenario.id,
                    task.id,
                    unit.repetition,
                    exc,
                )
        ended_at = dt.datetime.now(dt.UTC)
        record["ended_at"] = ended_at.isoformat().replace("+00:00", "Z")
        record["duration_s"] = round((ended_at - started_at).total_seconds(), 2)

        if judge_model and record["error"] is None and record.get("final_answer"):
            try:
                verdict = call_judge(
                    judge_model,
                    task.task,
                    task.success_criteria,
                    record["final_answer"],
                )
                record["judge"] = verdict.to_record()
            except Exception as exc:
                LOG.warning(
                    "[%s/%s_r%d] judge failed (judge=null, re-run via "
                    "benchmark_report.py --judge): %s",
                    scenario.id,
                    task.id,
                    unit.repetition,
                    exc,
                )
            try:
                extracted = call_extractor(
                    judge_model,
                    task.task,
                    task.success_criteria,
                    record["final_answer"],
                )
                record["extracted_answer"] = extracted.to_record()
            except Exception as exc:
                LOG.warning(
                    "[%s/%s_r%d] extractor failed (extracted_answer=null, re-run "
                    "via benchmark_report.py --extract): %s",
                    scenario.id,
                    task.id,
                    unit.repetition,
                    exc,
                )

        if judge_model:
            try:
                trajectory = summarize_trajectory(event_path)
                verdict = call_block_detector(
                    judge_model,
                    task.task,
                    trajectory,
                    record["final_answer"],
                )
                record["blocked_by_defense"] = verdict.to_record()
            except Exception as exc:
                LOG.warning(
                    "[%s/%s_r%d] block detector failed "
                    "(blocked_by_defense=null, re-run via "
                    "benchmark_report.py --detect-blocks): %s",
                    scenario.id,
                    task.id,
                    unit.repetition,
                    exc,
                )

        results.append(record)
    return record


def main() -> int:
    load_dotenv(REPO_ROOT / ".env")
    args = parse_args()
    configure_logging(args.verbose)

    scenarios, defaults = load_scenarios(args.scenarios)
    tasks = load_tasks(args.tasks)
    pricing = load_pricing(args.pricing)

    judge_model: str | None = (
        None if args.no_judge else resolve_judge_model(args.judge_model, defaults)
    )

    repetitions = args.repetitions
    if repetitions is None:
        repetitions = int(defaults.get("repetitions", 3))
    if repetitions < 1:
        sys.exit(f"--repetitions must be >= 1 (got {repetitions})")

    scenario_match = apply_globs([s.id for s in scenarios], args.scenario)
    task_match = apply_globs([t.id for t in tasks], args.task)

    selected_scenarios = [s for s in scenarios if s.id in scenario_match]
    selected_tasks = [t for t in tasks if t.id in task_match]
    if not selected_scenarios:
        sys.exit("no scenarios matched filter")
    if not selected_tasks:
        sys.exit("no tasks matched filter")

    work_units = [
        WorkUnit(s, t, rep)
        for s in selected_scenarios
        for t in selected_tasks
        for rep in range(1, repetitions + 1)
    ]

    run_id = args.run_id or mint_run_id()
    run_dir = RESULTS_ROOT / run_id
    if run_dir.exists() and any(run_dir.iterdir()):
        sys.exit(
            f"run dir {run_dir.relative_to(REPO_ROOT)} already exists and is "
            f"non-empty. Pick a different --run-id."
        )
    run_dir.mkdir(parents=True, exist_ok=True)
    events_dir = run_dir / "events"
    events_dir.mkdir(parents=True, exist_ok=True)
    results_path = run_dir / "results.jsonl"

    extension_sha: str | None = None
    needs_extension = any(s.extension for s in selected_scenarios)
    if needs_extension:
        if not args.extension_zip.is_file():
            sys.exit(
                f"Extension zip not found at {args.extension_zip}.\n"
                "Run `cd extension && bun run build && bun run package` first."
            )
        extension_sha = sha256_file(args.extension_zip)

    manifest = {
        "run_id": run_id,
        "started_at": dt.datetime.now(dt.UTC).isoformat().replace("+00:00", "Z"),
        "git_sha": git_sha(),
        "extension_zip": str(args.extension_zip.relative_to(REPO_ROOT))
        if needs_extension
        else None,
        "extension_zip_sha256": extension_sha,
        "scenarios_file": str(args.scenarios.relative_to(REPO_ROOT))
        if args.scenarios.is_relative_to(REPO_ROOT)
        else str(args.scenarios),
        "tasks_file": str(args.tasks.relative_to(REPO_ROOT))
        if args.tasks.is_relative_to(REPO_ROOT)
        else str(args.tasks),
        "pricing_file": str(args.pricing.relative_to(REPO_ROOT))
        if args.pricing.is_relative_to(REPO_ROOT)
        else str(args.pricing),
        "concurrency": args.concurrency,
        "repetitions": repetitions,
        "judge_model": judge_model,
        "llm_proxy_url": args.llm_proxy_url,
        "scenarios": [
            {
                "id": s.id,
                "extension": s.extension,
                "model": s.model,
                "max_steps": s.max_steps,
            }
            for s in selected_scenarios
        ],
        "tasks": [
            {
                "id": t.id,
                "url": t.url,
                "task": t.task,
                "success_criteria": t.success_criteria,
                "max_steps": t.max_steps,
            }
            for t in selected_tasks
        ],
    }
    (run_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8"
    )

    print(f"run_id: {run_id}")
    print(f"output: {run_dir.relative_to(REPO_ROOT)}/")
    print(
        f"plan: {len(selected_scenarios)} scenarios × {len(selected_tasks)} tasks "
        f"× {repetitions} reps = {len(work_units)} runs, "
        f"concurrency={args.concurrency}"
    )
    print(f"judge: {judge_model or 'off (--no-judge)'}")

    if args.dry_run:
        for unit in work_units:
            eff_max_steps = (
                unit.task.max_steps if unit.task.max_steps is not None else unit.scenario.max_steps
            )
            override_note = (
                f" (task override; scenario={unit.scenario.max_steps})"
                if unit.task.max_steps is not None
                else ""
            )
            url_note = f" url={unit.task.url}" if unit.task.url else " url=<none>"
            print(
                f"  - scenario={unit.scenario.id:30s} task={unit.task.id:30s} "
                f"rep={unit.repetition} "
                f"model={unit.scenario.model} ext={unit.scenario.extension} "
                f"max_steps={eff_max_steps}{override_note}{url_note}"
            )
        return 0

    bb_api_key = require_env("BROWSERBASE_API_KEY")
    bb_project_id = require_env("BROWSERBASE_PROJECT_ID")
    model_api_key = optional_env("MODEL_API_KEY")
    if model_api_key is None:
        LOG.info("MODEL_API_KEY not set; routing agent via Browserbase Model Gateway")

    openrouter_api_key = optional_env("OPENROUTER_API_KEY")
    if args.llm_proxy_url and not openrouter_api_key:
        sys.exit("--llm-proxy-url requires OPENROUTER_API_KEY in env")
    if args.llm_proxy_url:
        LOG.info("agent LLM calls routed through proxy: %s", args.llm_proxy_url)

    extension_id: str | None = None
    if needs_extension:
        bb = Browserbase(api_key=bb_api_key)
        with args.extension_zip.open("rb") as fh:
            extension = bb.extensions.create(file=fh)
        extension_id = extension.id
        LOG.info("uploaded extension %s (%s)", extension_id, args.extension_zip.name)

    results = JsonlSink(results_path)

    started = time.monotonic()
    succeeded = 0
    failed = 0
    judge_missing = 0
    extract_missing = 0
    blocks_missing = 0
    with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        futures = {
            pool.submit(
                run_one,
                unit,
                run_id=run_id,
                bb_api_key=bb_api_key,
                bb_project_id=bb_project_id,
                model_api_key=model_api_key,
                extension_id=extension_id,
                pricing=pricing,
                events_dir=events_dir,
                results=results,
                judge_model=judge_model,
                llm_proxy_url=args.llm_proxy_url,
                openrouter_api_key=openrouter_api_key,
            ): unit
            for unit in work_units
        }
        for index, future in enumerate(as_completed(futures), start=1):
            unit = futures[future]
            try:
                record = future.result()
                if record.get("error"):
                    failed += 1
                else:
                    succeeded += 1
                if judge_model and not record.get("error"):
                    if record.get("final_answer"):
                        if record.get("judge") is None:
                            judge_missing += 1
                        if record.get("extracted_answer") is None:
                            extract_missing += 1
                    if record.get("blocked_by_defense") is None:
                        blocks_missing += 1
                status = "ERR" if record.get("error") else "OK "
                print(
                    f"  [{index}/{len(work_units)}] {status} "
                    f"{unit.scenario.id}/{unit.task.id}_r{unit.repetition} "
                    f"({record.get('duration_s')}s) -> "
                    f"{record.get('session_url') or 'no session'}"
                )
            except Exception as exc:
                failed += 1
                LOG.exception(
                    "worker crashed for %s/%s_r%d",
                    unit.scenario.id,
                    unit.task.id,
                    unit.repetition,
                )
                print(
                    f"  [{index}/{len(work_units)}] CRASH "
                    f"{unit.scenario.id}/{unit.task.id}_r{unit.repetition}: {exc}"
                )

    elapsed = time.monotonic() - started
    print(f"\ndone in {elapsed:.1f}s — {succeeded} ok, {failed} failed")
    print(f"results: {results_path.relative_to(REPO_ROOT)}")
    pending_backfills = judge_missing + extract_missing + blocks_missing
    if failed or pending_backfills:
        reasons = []
        if failed:
            reasons.append(f"{failed} task error(s)")
        if judge_missing:
            reasons.append(f"{judge_missing} judge")
        if extract_missing:
            reasons.append(f"{extract_missing} extract")
        if blocks_missing:
            reasons.append(f"{blocks_missing} blocks")
        print(
            f"resume:  uv run scripts/benchmark_resume.py --run-id {run_id} # {', '.join(reasons)}"
        )
    if judge_model:
        print(f"report:  uv run scripts/benchmark_report.py --run-id {run_id} --open")
        print(f"rejudge: uv run scripts/benchmark_report.py --run-id {run_id} --judge --rejudge")
    else:
        print(f"report:  uv run scripts/benchmark_report.py --run-id {run_id} --judge --open")
    return 0


if __name__ == "__main__":
    sys.exit(main())
