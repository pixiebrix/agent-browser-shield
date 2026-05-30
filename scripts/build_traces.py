#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Build per-task trace bundles + side-by-side diff HTML from a completed run.

Reads `output/results/<run_id>/{manifest.json, results.jsonl, events/*.jsonl}`
and writes:

  output/results/<run_id>/traces/<scenario>__<task>__r<n>/
    summary.json    # the results.jsonl row for this (scenario, task, rep)
    steps.json      # ordered agent actions with reasoning + tool_call + tool_result
    messages.json   # the LLM message log, lightly normalized

  output/reports/<run_id>__<task>.html
    Side-by-side scenario diff for one task. Step lists per scenario+rep with
    accordion expansions for reasoning, tool input, tool result, and unified
    diffs of ariaTree results between sides.

Idempotent: skips bundles + HTML pages whose outputs are newer than their
inputs.

Usage:
  uv run scripts/build_traces.py --run-id <run_id>
  uv run scripts/build_traces.py --run-id <run_id> --task-id wiki-claude --open
"""

from __future__ import annotations

import argparse
import difflib
import fnmatch
import hashlib
import html
import json
import sys
import webbrowser
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
RESULTS_ROOT = REPO_ROOT / "output" / "results"
REPORTS_ROOT = REPO_ROOT / "output" / "reports"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--run-id", required=True)
    parser.add_argument(
        "--task-id",
        action="append",
        default=[],
        metavar="GLOB",
        help="Only render diff HTML for tasks matching this glob. Repeatable. "
        "(Trace bundles are always built for every row.)",
    )
    parser.add_argument(
        "--open",
        action="store_true",
        help="Open the first matching diff HTML page in the default browser.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Rebuild even when outputs are newer than inputs.",
    )
    return parser.parse_args()


def safe_filename(part: str) -> str:
    return "".join(c if (c.isalnum() or c in "-_.") else "_" for c in part)


def trace_dirname(scenario_id: str, task_id: str, rep: int) -> str:
    return f"{safe_filename(scenario_id)}__{safe_filename(task_id)}__r{rep}"


def events_filename(scenario_id: str, task_id: str, rep: int) -> str:
    return f"{safe_filename(scenario_id)}_{safe_filename(task_id)}_r{rep}.jsonl"


def diff_html_filename(run_id: str, task_id: str) -> str:
    return f"{safe_filename(run_id)}__{safe_filename(task_id)}.html"


# ---------- events.jsonl parsing ----------


def parse_events_file(path: Path) -> dict[str, Any]:
    """Walk every line of an events file, accumulating the latest seen actions[]
    and messages[] from "data" events. Late events supersede earlier ones since
    Stagehand emits cumulative state."""
    actions: list[dict[str, Any]] = []
    messages: list[dict[str, Any]] = []
    completed = False
    final_answer: str | None = None
    usage: dict[str, Any] | None = None
    success: bool | None = None
    if not path.is_file():
        return {
            "actions": actions,
            "messages": messages,
            "completed": completed,
            "final_answer": final_answer,
            "usage": usage,
            "success": success,
        }
    with path.open(encoding="utf-8") as fh:
        for line_no, line in enumerate(fh, 1):
            line = line.strip()
            if not line:
                continue
            try:
                ev = json.loads(line)
            except json.JSONDecodeError as exc:
                print(f"warning: {path}:{line_no} invalid json: {exc}", file=sys.stderr)
                continue
            if ev.get("type") != "data":
                continue
            payload = ev.get("payload") or {}
            result = payload.get("result") or {}
            new_actions = result.get("actions")
            if isinstance(new_actions, list) and len(new_actions) >= len(actions):
                actions = new_actions
            new_messages = result.get("messages")
            if isinstance(new_messages, list) and len(new_messages) >= len(messages):
                messages = new_messages
            if result.get("completed") is True:
                completed = True
            msg = result.get("message")
            if isinstance(msg, str) and msg.strip():
                final_answer = msg
            if isinstance(result.get("usage"), dict):
                usage = result["usage"]
            if isinstance(result.get("success"), bool):
                success = result["success"]
    return {
        "actions": actions,
        "messages": messages,
        "completed": completed,
        "final_answer": final_answer,
        "usage": usage,
        "success": success,
    }


def extract_tool_result_text(part: dict[str, Any]) -> tuple[str, str]:
    """Return (kind, text) from a tool-result content part. `kind` is
    "text" | "json" | "unknown"."""
    out = part.get("output") or {}
    out_type = out.get("type")
    if out_type == "content":
        chunks: list[str] = []
        for x in out.get("value") or []:
            if isinstance(x, dict) and x.get("type") == "text":
                chunks.append(x.get("text") or "")
        return ("text", "".join(chunks))
    if out_type == "json":
        try:
            return ("json", json.dumps(out.get("value"), ensure_ascii=False, indent=2))
        except (TypeError, ValueError):
            return ("json", str(out.get("value")))
    try:
        return ("unknown", json.dumps(out, ensure_ascii=False))
    except (TypeError, ValueError):
        return ("unknown", str(out))


def correlate_steps(
    actions: list[dict[str, Any]], messages: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Pair each entry of actions[] with the i-th tool-call/tool-result pair in
    messages[]. The agent's reasoning lives in either action.reasoning or the
    assistant message's reasoning part."""
    # Walk messages, collecting an ordered list of {reasoning, tool_call,
    # tool_result_kind, tool_result_text}.
    pairs: list[dict[str, Any]] = []
    pending: dict[str, Any] | None = None
    for m in messages:
        role = m.get("role")
        content = m.get("content")
        if role == "assistant" and isinstance(content, list):
            reasoning_chunks: list[str] = []
            tool_call: dict[str, Any] | None = None
            for p in content:
                if not isinstance(p, dict):
                    continue
                if p.get("type") == "reasoning":
                    t = p.get("text") or ""
                    if t.strip():
                        reasoning_chunks.append(t)
                elif p.get("type") == "tool-call":
                    tool_call = p
            if tool_call is not None:
                pending = {
                    "reasoning": "\n".join(reasoning_chunks).strip(),
                    "tool_call": tool_call,
                }
        elif role == "tool" and isinstance(content, list) and pending is not None:
            tc = pending["tool_call"]
            for p in content:
                if (
                    isinstance(p, dict)
                    and p.get("type") == "tool-result"
                    and p.get("toolCallId") == tc.get("toolCallId")
                ):
                    kind, text = extract_tool_result_text(p)
                    pairs.append(
                        {
                            "reasoning": pending["reasoning"],
                            "tool_name": tc.get("toolName"),
                            "tool_input": tc.get("input"),
                            "tool_call_id": tc.get("toolCallId"),
                            "tool_result_kind": kind,
                            "tool_result_text": text,
                        }
                    )
                    pending = None
                    break

    steps: list[dict[str, Any]] = []
    start_ts: int | None = None
    for i, action in enumerate(actions):
        ts = action.get("timestamp")
        if start_ts is None and isinstance(ts, (int, float)):
            start_ts = int(ts)
        pair = pairs[i] if i < len(pairs) else {}
        text = pair.get("tool_result_text") or ""
        tool_name = pair.get("tool_name") or action.get("type")
        # Classify ariaTree results: a real tree starts with "Accessibility Tree:";
        # short placeholder strings ("ARIA tree extracted for context of page
        # elements") are flagged separately so the diff view can skip them.
        kind: str
        if tool_name == "ariaTree":
            if text.startswith("Accessibility Tree:"):
                kind = "aria_tree"
            elif text.strip():
                kind = "aria_tree_placeholder"
            else:
                kind = "empty"
        else:
            kind = pair.get("tool_result_kind") or ("empty" if not text else "text")
        ms_since_start = 0
        if isinstance(ts, (int, float)) and start_ts is not None:
            ms_since_start = int(ts) - start_ts
        page_url = action.get("pageUrl") or action.get("page_url")
        reasoning = (action.get("reasoning") or pair.get("reasoning") or "").strip()
        step: dict[str, Any] = {
            "index": i,
            "type": action.get("type"),
            "instruction": action.get("instruction"),
            "reasoning": reasoning,
            "page_url": page_url,
            "timestamp_ms": int(ts) if isinstance(ts, (int, float)) else None,
            "ms_since_start": ms_since_start,
            "tool_call": {
                "tool_name": tool_name,
                "input": pair.get("tool_input") or {},
            },
            "tool_result": {
                "kind": kind,
                "text": text,
                "text_len": len(text),
                "text_sha256": (hashlib.sha256(text.encode("utf-8")).hexdigest() if text else None),
            },
        }
        if action.get("type") == "extract":
            step["extract_result"] = {
                "schema": action.get("schema"),
                "value": action.get("result"),
            }
        steps.append(step)
    return steps


# ---------- bundle writing ----------


def needs_rebuild(inputs: list[Path], output: Path, force: bool) -> bool:
    if force or not output.exists():
        return True
    out_mtime = output.stat().st_mtime
    return any(p.exists() and p.stat().st_mtime > out_mtime for p in inputs)


def write_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(obj, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )


def build_trace_bundle(
    *,
    run_dir: Path,
    scenario_id: str,
    task_id: str,
    rep: int,
    summary_row: dict[str, Any],
    force: bool,
) -> dict[str, Any] | None:
    """Write summary.json/steps.json/messages.json for one (scenario, task, rep).
    Returns the in-memory bundle (used downstream for the diff HTML), or None
    when there is no events file to read from."""
    events_path = run_dir / "events" / events_filename(scenario_id, task_id, rep)
    trace_dir = run_dir / "traces" / trace_dirname(scenario_id, task_id, rep)
    summary_path = trace_dir / "summary.json"
    steps_path = trace_dir / "steps.json"
    messages_path = trace_dir / "messages.json"

    inputs = [events_path, run_dir / "results.jsonl"]
    need = needs_rebuild(inputs, steps_path, force) or needs_rebuild(inputs, summary_path, force)
    if not need:
        # Reuse the on-disk bundle so the diff HTML pass doesn't re-parse.
        try:
            return {
                "summary": json.loads(summary_path.read_text(encoding="utf-8")),
                "steps": json.loads(steps_path.read_text(encoding="utf-8")),
                "messages": json.loads(messages_path.read_text(encoding="utf-8")),
                "events_path": events_path,
                "rebuilt": False,
            }
        except (OSError, json.JSONDecodeError):
            pass  # fall through and rebuild

    parsed = parse_events_file(events_path)
    steps = correlate_steps(parsed["actions"], parsed["messages"])

    write_json(summary_path, summary_row)
    write_json(steps_path, steps)
    write_json(messages_path, parsed["messages"])

    return {
        "summary": summary_row,
        "steps": steps,
        "messages": parsed["messages"],
        "events_path": events_path,
        "rebuilt": True,
    }


# ---------- diff HTML rendering ----------


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
  --diff-add: #4ade80;
  --diff-del: #f87171;
  --diff-ctx: #6b7280;
}
* { box-sizing: border-box; }
body {
  background: var(--bg); color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  margin: 0; padding: 24px;
  max-width: 1800px;
}
h1, h2, h3 { margin: 0 0 12px; font-weight: 600; }
h1 { font-size: 22px; }
h2 { font-size: 16px; margin-top: 24px; color: var(--accent); }
h3 { font-size: 15px; }
.muted { color: var(--muted); font-size: 13px; }
code { font-family: "SF Mono", Menlo, monospace; font-size: 12px; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
.panel { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin-bottom: 16px; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
.badge.pass { background: rgba(74, 222, 128, 0.15); color: var(--pass); }
.badge.fail { background: rgba(248, 113, 113, 0.15); color: var(--fail); }
.badge.pending { background: rgba(251, 191, 36, 0.15); color: var(--pending); }
.badge.error { background: rgba(248, 113, 113, 0.15); color: var(--fail); }
.badge.type {
  background: rgba(125, 211, 252, 0.12); color: var(--accent);
  font-family: "SF Mono", Menlo, monospace; font-weight: 500;
  text-transform: lowercase;
}
.badge.match {
  background: rgba(125, 211, 252, 0.1); color: var(--accent);
}
.badge.diverge {
  background: rgba(251, 191, 36, 0.18); color: var(--pending);
}
.diff-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
}
.diff-col {
  background: var(--panel); border: 1px solid var(--border);
  border-radius: 8px; padding: 16px;
  min-width: 0;
}
.col-head { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
.col-head h3 { margin: 0; }
.col-head .muted { font-size: 12px; }
.rep-tabs { display: flex; gap: 4px; }
.rep-tabs button {
  background: var(--panel-2); color: var(--muted);
  border: 1px solid var(--border); border-radius: 4px;
  padding: 4px 10px; font-size: 12px; cursor: pointer;
  font-family: inherit;
}
.rep-tabs button:hover { color: var(--text); }
.rep-tabs button.active {
  background: var(--accent); color: var(--bg);
  border-color: var(--accent);
}
.rep-pane[hidden] { display: none; }
.rep-pane .summary {
  padding: 10px 12px; margin-bottom: 12px;
  background: var(--panel-2); border-radius: 6px;
  border-left: 3px solid var(--border);
  font-size: 12px;
}
.rep-pane .summary.pass { border-left-color: var(--pass); }
.rep-pane .summary.fail { border-left-color: var(--fail); }
.rep-pane .summary.error { border-left-color: var(--fail); }
.rep-pane .summary .stats {
  color: var(--muted); margin-top: 4px;
  font-variant-numeric: tabular-nums;
}
.rep-pane .summary .reason {
  margin-top: 6px; white-space: pre-wrap; word-break: break-word;
}
.rep-pane .summary .final {
  margin-top: 6px;
  padding: 6px 8px;
  background: var(--bg); border-radius: 4px;
  border-left: 2px solid var(--accent);
  white-space: pre-wrap; word-break: break-word;
  max-height: 200px; overflow-y: auto;
}
.step {
  border: 1px solid var(--border); border-radius: 6px;
  margin-bottom: 8px; padding: 10px 12px;
  background: var(--panel-2);
}
.step .step-head {
  display: flex; flex-wrap: wrap; align-items: center;
  gap: 8px; font-size: 12px;
}
.step .step-head .idx {
  color: var(--muted); font-family: "SF Mono", Menlo, monospace;
}
.step .step-head .url {
  color: var(--muted); font-size: 11px;
  font-family: "SF Mono", Menlo, monospace;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  flex: 1; min-width: 0;
}
.step .step-head .ms {
  color: var(--muted); font-variant-numeric: tabular-nums;
  font-size: 11px;
}
.step .instr {
  font-size: 12px; margin-top: 6px;
  color: var(--text);
}
.step .reasoning {
  font-size: 12px; line-height: 1.4; margin-top: 6px;
  color: var(--text);
  padding: 6px 8px; background: var(--bg); border-radius: 4px;
  border-left: 2px solid var(--accent);
  white-space: pre-wrap; word-break: break-word;
}
.step details { margin-top: 6px; }
.step details summary {
  font-size: 11px; color: var(--muted);
  cursor: pointer; list-style: none;
}
.step details summary::-webkit-details-marker { display: none; }
.step details summary::before {
  content: "▶"; display: inline-block;
  margin-right: 4px; font-size: 9px;
  transform: translateY(-1px);
  transition: transform 0.1s ease;
}
.step details[open] summary::before {
  transform: rotate(90deg) translateX(-1px);
}
.step pre {
  background: var(--bg); border-radius: 4px;
  padding: 8px 10px; margin: 6px 0 0;
  font-family: "SF Mono", Menlo, monospace; font-size: 11px;
  line-height: 1.45;
  max-height: 400px; overflow: auto;
  white-space: pre-wrap; word-break: break-word;
}
.step pre.diff { white-space: pre; }
.step pre.diff .add { color: var(--diff-add); }
.step pre.diff .del { color: var(--diff-del); }
.step pre.diff .ctx { color: var(--diff-ctx); }
.step pre.diff .hdr { color: var(--accent); font-weight: 600; }
"""


def fmt_int(n: Any) -> str:
    if n is None:
        return "—"
    try:
        return f"{int(n):,}"
    except (TypeError, ValueError):
        return str(n)


def fmt_secs(n: Any) -> str:
    if n is None:
        return "—"
    try:
        return f"{float(n):.1f}s"
    except (TypeError, ValueError):
        return str(n)


def fmt_ms(n: Any) -> str:
    if n is None:
        return "—"
    try:
        ms = int(n)
    except (TypeError, ValueError):
        return str(n)
    if ms < 1000:
        return f"{ms}ms"
    return f"{ms / 1000.0:.1f}s"


def render_unified_diff(a: str, b: str, max_lines: int = 500) -> str:
    """Render a unified diff between two texts as HTML with line-prefix coloring.
    Truncates to max_lines of diff output (not source)."""
    a_lines = a.splitlines()
    b_lines = b.splitlines()
    diff = list(
        difflib.unified_diff(
            a_lines, b_lines, fromfile="baseline", tofile="other", n=3, lineterm=""
        )
    )
    truncated = False
    if len(diff) > max_lines:
        diff = diff[:max_lines]
        truncated = True
    out: list[str] = []
    for line in diff:
        esc = html.escape(line)
        if line.startswith("+++") or line.startswith("---") or line.startswith("@@"):
            out.append(f"<span class='hdr'>{esc}</span>")
        elif line.startswith("+"):
            out.append(f"<span class='add'>{esc}</span>")
        elif line.startswith("-"):
            out.append(f"<span class='del'>{esc}</span>")
        else:
            out.append(f"<span class='ctx'>{esc}</span>")
    if truncated:
        out.append(f"<span class='hdr'>... (diff truncated to {max_lines} lines)</span>")
    if not out:
        return "<span class='ctx'>(no differences)</span>"
    return "\n".join(out)


def step_match_kind(left: dict[str, Any], right: dict[str, Any]) -> str:
    """Return "match" if both texts identical (by sha), "diverge" if both have
    aria_tree text but differ, else "" (no badge)."""
    lt = left.get("tool_result", {})
    rt = right.get("tool_result", {})
    if lt.get("kind") == "aria_tree" and rt.get("kind") == "aria_tree":
        if lt.get("text_sha256") and lt.get("text_sha256") == rt.get("text_sha256"):
            return "match"
        return "diverge"
    return ""


def render_step(
    step: dict[str, Any],
    *,
    other_step: dict[str, Any] | None,
) -> str:
    parts: list[str] = []
    parts.append("<div class='step'>")
    type_str = step.get("type") or "?"
    badge = f"<span class='badge type'>{html.escape(str(type_str))}</span>"
    match_kind = step_match_kind(step, other_step) if other_step else ""
    match_badge = ""
    if match_kind == "match":
        match_badge = "<span class='badge match'>a11y identical</span>"
    elif match_kind == "diverge":
        match_badge = "<span class='badge diverge'>a11y diverged</span>"
    page_url = step.get("page_url") or ""
    parts.append("<div class='step-head'>")
    parts.append(f"<span class='idx'>#{int(step.get('index') or 0)}</span>")
    parts.append(badge)
    parts.append(match_badge)
    parts.append(f"<span class='ms'>{html.escape(fmt_ms(step.get('ms_since_start')))}</span>")
    parts.append(
        f"<span class='url' title='{html.escape(page_url)}'>{html.escape(page_url)}</span>"
    )
    parts.append("</div>")
    instr = step.get("instruction")
    if isinstance(instr, str) and instr.strip():
        parts.append(f"<div class='instr'>{html.escape(instr)}</div>")
    reasoning = step.get("reasoning") or ""
    if reasoning.strip():
        parts.append(f"<div class='reasoning'>{html.escape(reasoning)}</div>")

    tc = step.get("tool_call") or {}
    tc_input = tc.get("input")
    if tc_input not in (None, {}, ""):
        parts.append(
            "<details><summary>tool input</summary>"
            f"<pre>{html.escape(json.dumps(tc_input, ensure_ascii=False, indent=2))}</pre>"
            "</details>"
        )

    tr = step.get("tool_result") or {}
    text = tr.get("text") or ""
    text_len = tr.get("text_len") or 0
    kind = tr.get("kind") or "empty"
    if text_len > 0:
        summary_label = f"tool result · {kind} · {fmt_int(text_len)} chars"
        parts.append(
            f"<details><summary>{html.escape(summary_label)}</summary>"
            f"<pre>{html.escape(text)}</pre>"
            "</details>"
        )

    # Inline a11y diff against the paired step on the other side (when both are real trees).
    if match_kind == "diverge" and other_step is not None:
        a = (step.get("tool_result") or {}).get("text") or ""
        b = (other_step.get("tool_result") or {}).get("text") or ""
        diff_html = render_unified_diff(a, b)
        parts.append(
            "<details><summary>a11y diff vs other side</summary>"
            f"<pre class='diff'>{diff_html}</pre>"
            "</details>"
        )

    # Extract result for type=extract.
    extract = step.get("extract_result")
    if extract:
        parts.append(
            "<details open><summary>extract result</summary>"
            f"<pre>{html.escape(json.dumps(extract, ensure_ascii=False, indent=2))}</pre>"
            "</details>"
        )
    parts.append("</div>")
    return "".join(parts)


def _pair_key(step: dict[str, Any]) -> tuple[Any, Any]:
    """Bucketing key for cross-side step pairing. ariaTree steps split further
    by tool_result kind so a real tree only pairs with another real tree (not
    with placeholders that Stagehand emits between real snapshots)."""
    t = step.get("type")
    if t == "ariaTree":
        kind = (step.get("tool_result") or {}).get("kind")
        return (t, kind)
    return (t, None)


def pair_steps_by_type(
    left: list[dict[str, Any]], right: list[dict[str, Any]]
) -> dict[int, dict[str, Any]]:
    """Pair each left step with the Nth right step sharing the same bucket key
    (see _pair_key). Useful when both action sequences hit the same structural
    milestones (e.g., the 2nd real-tree ariaTree call) at different absolute
    indices."""
    right_by_key: dict[tuple[Any, Any], list[dict[str, Any]]] = {}
    for s in right:
        right_by_key.setdefault(_pair_key(s), []).append(s)
    seen: dict[tuple[Any, Any], int] = {}
    pairings: dict[int, dict[str, Any]] = {}
    for s in left:
        k = _pair_key(s)
        n = seen.get(k, 0)
        seen[k] = n + 1
        bucket = right_by_key.get(k) or []
        if n < len(bucket):
            pairings[id(s)] = bucket[n]
    return pairings


def render_rep_pane(bundle: dict[str, Any], other_bundle: dict[str, Any] | None) -> str:
    summary = bundle["summary"]
    steps = bundle["steps"]
    other_steps = (other_bundle or {}).get("steps") or []
    pairings = pair_steps_by_type(steps, other_steps)

    verdict = summary.get("judge") or {}
    err = summary.get("error")
    if err:
        cls = "error"
        badge = "<span class='badge error'>error</span>"
    elif verdict.get("pass") is True:
        cls = "pass"
        badge = "<span class='badge pass'>pass</span>"
    elif verdict.get("pass") is False:
        cls = "fail"
        badge = "<span class='badge fail'>fail</span>"
    else:
        cls = ""
        badge = "<span class='badge pending'>ungraded</span>"

    extracted = summary.get("extracted_answer") or {}
    extracted_str = ""
    if extracted.get("extractable") and extracted.get("value") is not None:
        extracted_str = (
            f"<div class='muted' style='margin-top:4px'>extracted: "
            f"<code>{html.escape(str(extracted['value']))}</code></div>"
        )

    final = summary.get("final_answer") or ""
    final_html = ""
    if final.strip():
        final_html = (
            "<details><summary>final answer</summary>"
            f"<div class='final'>{html.escape(final)}</div>"
            "</details>"
        )
    elif err:
        final_html = (
            f"<div class='final' style='border-left-color: var(--fail)'>"
            f"<code>{html.escape(str(err))}</code></div>"
        )

    reason = (verdict.get("reason") or "").strip()
    reason_html = f"<div class='reason'>{html.escape(reason)}</div>" if reason else ""

    tokens = (summary.get("tokens") or {}).get("total")
    stats_html = (
        f"<div class='stats'>"
        f"{fmt_int(tokens)} tok · "
        f"{summary.get('steps_taken') or 0} steps · "
        f"{fmt_secs(summary.get('duration_s'))}"
        f"</div>"
    )

    session_url = summary.get("session_url")
    session_html = ""
    if session_url:
        session_html = (
            f"<div class='muted' style='margin-top:4px'>"
            f"<a href='{html.escape(session_url)}' target='_blank'>session</a>"
            f"</div>"
        )

    pane_parts: list[str] = []
    pane_parts.append(f"<div class='summary {cls}'>")
    pane_parts.append(f"{badge}")
    pane_parts.append(stats_html)
    pane_parts.append(extracted_str)
    pane_parts.append(reason_html)
    pane_parts.append(final_html)
    pane_parts.append(session_html)
    pane_parts.append("</div>")

    if not steps:
        pane_parts.append("<div class='muted'>No steps recorded for this run.</div>")
    else:
        for step in steps:
            other_step = pairings.get(id(step))
            pane_parts.append(render_step(step, other_step=other_step))
    return "".join(pane_parts)


def render_diff_html(
    *,
    run_id: str,
    task_id: str,
    task_def: dict[str, Any],
    scenarios: list[dict[str, Any]],
    bundles_by_key: dict[tuple[str, int], dict[str, Any]],
) -> str:
    """Render the side-by-side diff HTML for one task.

    bundles_by_key maps (scenario_id, rep) -> bundle.
    """
    reps_seen: dict[str, list[int]] = {}
    for (sid, rep), _ in bundles_by_key.items():
        reps_seen.setdefault(sid, []).append(rep)
    for sid in reps_seen:
        reps_seen[sid] = sorted(reps_seen[sid])

    # Pick at most the first two scenarios for the side-by-side. If there's only
    # one scenario, render a single column.
    visible_sids = [s["id"] for s in scenarios if s["id"] in reps_seen][:2]
    if not visible_sids:
        # Nothing to render — show a stub page.
        visible_sids = [s["id"] for s in scenarios][:2]

    # For diff alignment between columns: when both visible scenarios have the
    # currently active rep, the render_step helper consults `other_step` to
    # emit "match"/"diverge" badges + inline a11y diff. Default active rep on
    # both sides is rep 1 (or the smallest available).

    def default_rep(sid: str) -> int:
        reps = reps_seen.get(sid, [])
        return reps[0] if reps else 1

    active = {sid: default_rep(sid) for sid in visible_sids}

    # Pre-render every rep pane for every visible scenario; the rep-tab JS
    # toggles `hidden` on them. For the cross-side a11y diff we use the default
    # rep pairing — diffs computed against the *default* other-side rep, not
    # whatever is currently active. This keeps the HTML static. Live cross-rep
    # diffing would require shipping both texts and computing in JS; out of
    # scope for v1.
    def other_bundle_for(sid: str) -> dict[str, Any] | None:
        # The "other side" is the *other* visible scenario at its default rep.
        for osid in visible_sids:
            if osid == sid:
                continue
            return bundles_by_key.get((osid, active[osid]))
        return None

    parts: list[str] = []
    parts.append("<!doctype html><html lang='en'><head><meta charset='utf-8'>")
    parts.append(f"<title>Task diff — {html.escape(task_id)} · {html.escape(run_id)}</title>")
    parts.append(f"<style>{CSS}</style></head><body>")

    parts.append(f"<h1>Task diff — <code>{html.escape(task_id)}</code></h1>")
    parts.append(
        f"<div class='muted'>run: <code>{html.escape(run_id)}</code> · "
        f"<a href='{html.escape(run_id)}.html'>← back to run report</a></div>"
    )
    parts.append("<div class='panel'>")
    parts.append(f"<div><strong>Task:</strong> {html.escape(task_def.get('task') or '')}</div>")
    parts.append(
        f"<div style='margin-top:6px'><strong>Success criteria:</strong> "
        f"{html.escape(task_def.get('success_criteria') or '')}</div>"
    )
    parts.append("</div>")

    if not visible_sids:
        parts.append("<div class='panel muted'>No scenarios completed for this task.</div>")
        parts.append("</body></html>")
        return "".join(parts)

    parts.append("<div class='diff-grid'>")
    for sid in visible_sids:
        scenario_def = next((s for s in scenarios if s["id"] == sid), {})
        ext = scenario_def.get("extension")
        reps = reps_seen.get(sid, [])
        if not reps:
            parts.append(
                f"<div class='diff-col'><div class='col-head'>"
                f"<h3>{html.escape(sid)} "
                f"<span class='muted'>(ext: {'on' if ext else 'off'})</span></h3>"
                f"<div class='muted'>No reps recorded.</div>"
                f"</div></div>"
            )
            continue
        parts.append(f"<div class='diff-col' data-scenario='{html.escape(sid)}'>")
        parts.append("<div class='col-head'>")
        parts.append(
            f"<h3>{html.escape(sid)} "
            f"<span class='muted'>(ext: {'on' if ext else 'off'} · "
            f"model: {html.escape(scenario_def.get('model') or '?')})</span></h3>"
        )
        parts.append("<div class='rep-tabs'>")
        for r in reps:
            cls = " active" if r == active[sid] else ""
            parts.append(
                f"<button type='button' class='rep-tab{cls}' "
                f"data-scenario='{html.escape(sid)}' data-rep='{r}'>r{r}</button>"
            )
        parts.append("</div></div>")
        for r in reps:
            bundle = bundles_by_key.get((sid, r))
            if not bundle:
                continue
            hidden = "" if r == active[sid] else " hidden"
            other_b = other_bundle_for(sid) if r == active[sid] else None
            parts.append(
                f"<div class='rep-pane' data-scenario='{html.escape(sid)}' data-rep='{r}'{hidden}>"
            )
            parts.append(render_rep_pane(bundle, other_b))
            parts.append("</div>")
        parts.append("</div>")
    parts.append("</div>")

    parts.append(
        "<script>"
        "document.querySelectorAll('.rep-tab').forEach(function(btn){"
        "  btn.addEventListener('click', function(){"
        "    var sid = btn.dataset.scenario, rep = btn.dataset.rep;"
        "    btn.parentElement.querySelectorAll('.rep-tab').forEach(function(b){"
        "      var on = b === btn;"
        "      b.classList.toggle('active', on);"
        "    });"
        "    var col = btn.closest('.diff-col');"
        "    col.querySelectorAll('.rep-pane').forEach(function(p){"
        "      p.hidden = (p.dataset.rep !== rep);"
        "    });"
        "  });"
        "});"
        "</script>"
    )
    parts.append("</body></html>")
    return "".join(parts)


# ---------- top-level entry points ----------


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    """Read results.jsonl, deduping by (scenario_id, task_id, repetition).

    Last occurrence wins so benchmark_resume.py can append retry rows
    without rewriting the file. First-seen order is preserved.
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
        row.setdefault("repetition", 1)
        key = (
            str(row.get("scenario_id") or ""),
            str(row.get("task_id") or ""),
            int(row.get("repetition") or 1),
        )
        if key not in by_key:
            order.append(key)
        by_key[key] = row
    return [by_key[k] for k in order]


def build_all(
    run_id: str,
    *,
    task_globs: list[str] | None = None,
    force: bool = False,
) -> dict[str, Any]:
    """Library entry point. Builds every trace bundle for the run, then renders
    the diff HTML for each task (optionally filtered by glob)."""
    run_dir = RESULTS_ROOT / run_id
    if not run_dir.is_dir():
        raise FileNotFoundError(f"run dir not found: {run_dir}")
    manifest_path = run_dir / "manifest.json"
    results_path = run_dir / "results.jsonl"
    if not manifest_path.is_file():
        raise FileNotFoundError(f"manifest not found: {manifest_path}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    rows = load_jsonl(results_path)
    scenarios = manifest.get("scenarios") or []
    tasks = manifest.get("tasks") or []
    task_by_id = {t["id"]: t for t in tasks}

    bundles_by_task_key: dict[str, dict[tuple[str, int], dict[str, Any]]] = {
        t["id"]: {} for t in tasks
    }
    traces_rebuilt = 0
    traces_loaded = 0
    traces_failed = 0

    for row in rows:
        sid = row.get("scenario_id")
        tid = row.get("task_id")
        rep = int(row.get("repetition") or 1)
        if not sid or not tid:
            continue
        try:
            bundle = build_trace_bundle(
                run_dir=run_dir,
                scenario_id=sid,
                task_id=tid,
                rep=rep,
                summary_row=row,
                force=force,
            )
        except Exception as exc:
            print(
                f"warning: failed to build trace for {sid}/{tid}_r{rep}: {exc}",
                file=sys.stderr,
            )
            traces_failed += 1
            continue
        if bundle is None:
            continue
        if bundle.get("rebuilt"):
            traces_rebuilt += 1
        else:
            traces_loaded += 1
        if tid in bundles_by_task_key:
            bundles_by_task_key[tid][(sid, rep)] = bundle

    # Render diff HTML per task.
    REPORTS_ROOT.mkdir(parents=True, exist_ok=True)
    matched_tids: list[str] = []
    diffs_written = 0
    for tid in [t["id"] for t in tasks]:
        if task_globs and not any(fnmatch.fnmatchcase(tid, g) for g in task_globs):
            continue
        matched_tids.append(tid)
        bundles = bundles_by_task_key.get(tid) or {}
        if not bundles:
            continue
        out_path = REPORTS_ROOT / diff_html_filename(run_id, tid)
        # Idempotency: rebuild if any of the bundle JSON files changed.
        inputs: list[Path] = []
        for sid, rep in bundles:
            tdir = run_dir / "traces" / trace_dirname(sid, tid, rep)
            inputs.extend([tdir / "steps.json", tdir / "summary.json", tdir / "messages.json"])
        if not needs_rebuild(inputs, out_path, force):
            continue
        html_text = render_diff_html(
            run_id=run_id,
            task_id=tid,
            task_def=task_by_id.get(tid) or {"id": tid},
            scenarios=scenarios,
            bundles_by_key=bundles,
        )
        out_path.write_text(html_text, encoding="utf-8")
        diffs_written += 1

    return {
        "run_id": run_id,
        "traces_rebuilt": traces_rebuilt,
        "traces_loaded": traces_loaded,
        "traces_failed": traces_failed,
        "diffs_written": diffs_written,
        "matched_tasks": matched_tids,
    }


def main() -> int:
    args = parse_args()
    result = build_all(
        args.run_id,
        task_globs=args.task_id or None,
        force=args.force,
    )
    print(
        f"traces: rebuilt {result['traces_rebuilt']}, "
        f"loaded {result['traces_loaded']}, "
        f"failed {result['traces_failed']}; "
        f"diff pages: wrote {result['diffs_written']}"
    )
    print(f"traces dir: output/results/{args.run_id}/traces/")
    print("reports dir: output/reports/")

    if args.open and result["matched_tasks"]:
        # Open the first task that has a diff page.
        for tid in result["matched_tasks"]:
            page = REPORTS_ROOT / diff_html_filename(args.run_id, tid)
            if page.is_file():
                webbrowser.open(page.as_uri())
                break
    return 0


if __name__ == "__main__":
    sys.exit(main())
