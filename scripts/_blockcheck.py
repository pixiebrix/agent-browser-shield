# Copyright (c) 2026 PixieBrix, Inc.
# Licensed under PolyForm Shield 1.0.0 — see LICENSE.

"""LLM-as-detector helper that decides whether a benchmark run was blocked
by an anti-agent / anti-scraping defense (Cloudflare, hCaptcha,
"Press & Hold", "Access Denied" / 403, 429 rate-limit, login walls, etc.).

Shape mirrors `_judge.py` so it composes the same way at call sites:
  - dataclass with `.to_record()` for results.jsonl serialization
  - one entrypoint per row (`call_block_detector`)
  - vendor dispatch reused from `_judge._call_json_llm`

The detector reads the *trajectory* (URLs visited + ariaTree text +
reasoning) from the per-row events JSONL, since block signals live there
rather than in the agent's final answer.
"""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_traces
from _judge import _call_json_llm

ALLOWED_DEFENSE_TYPES = {
    "cloudflare",
    "captcha",
    "press_and_hold",
    "access_denied",
    "rate_limit",
    "login_wall",
    "other",
}

BLOCK_SYSTEM = (
    "You analyze a browser-use agent's run trajectory and decide whether "
    "the run was blocked by an anti-bot / anti-scraping defense.\n\n"
    "Examples of blocks:\n"
    "  - Cloudflare 'Verify you are human' / Turnstile interstitial\n"
    "  - hCaptcha or reCAPTCHA challenge widget\n"
    "  - 'Press & Hold' challenge (PerimeterX / DataDome / Kasada)\n"
    "  - Akamai Bot Manager interstitial\n"
    "  - 'Access Denied' / 403 wall, 'Request blocked' page\n"
    "  - 429 / 'Too many requests' / explicit rate-limit page\n"
    "  - Hard login wall that prevents the task from being completed\n\n"
    "DO NOT mark blocked when the agent:\n"
    "  - merely answered incorrectly\n"
    "  - hit a soft cookie / consent banner that's just dismissible\n"
    "  - failed to find an element that exists on a normal page\n"
    "  - timed out without seeing a challenge page\n"
    "  - encountered a 404 / generic 'page not found'\n\n"
    "Classify the defense_type as one of: cloudflare, captcha, "
    "press_and_hold, access_denied, rate_limit, login_wall, other. "
    "Use 'other' for clearly-a-block pages that don't match the named "
    "types. Set defense_type=null when blocked=false.\n\n"
    "step_index is the 0-based index of the trajectory step where the "
    "defense first appeared (null if unclear).\n\n"
    "Respond with strict JSON of the form "
    '{"blocked": true|false, "defense_type": "<type>"|null, '
    '"step_index": <int>|null, "reason": "<one short sentence>"}. '
    "No prose outside JSON."
)


@dataclass
class BlockVerdict:
    blocked: bool
    defense_type: str | None
    step_index: int | None
    reason: str
    model: str

    def to_record(self) -> dict[str, Any]:
        return {
            "blocked": self.blocked,
            "defense_type": self.defense_type,
            "step_index": self.step_index,
            "reason": self.reason,
            "model": self.model,
        }


def _truncate_middle(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    head = max_chars // 2
    tail = max_chars - head - len(" […] ")
    return f"{text[:head]} […] {text[-tail:]}"


def summarize_trajectory(event_path: Path, *, max_chars: int = 6000) -> str:
    """Render the run's trajectory as compact text for the detector LLM.

    Reuses the canonical event parser + step correlator from
    `build_traces` so we stay in lockstep with how the diff report
    interprets events. Per-step ariaTree text is truncated to keep total
    length bounded — block signals tend to surface in titles / headings /
    the first few hundred chars of the tree, so middle-truncation is
    fine.
    """
    parsed = build_traces.parse_events_file(event_path)
    steps = build_traces.correlate_steps(parsed.get("actions") or [], parsed.get("messages") or [])
    if not steps:
        return "(no trajectory events captured)"

    # Budget per step's ariaTree slice. Leave headroom for headers,
    # reasoning, and metadata so the final string stays near max_chars.
    n_aria = sum(1 for s in steps if (s.get("tool_result") or {}).get("kind") == "aria_tree")
    aria_budget = (max_chars - 600) // max(n_aria, 1)
    aria_budget = max(400, min(aria_budget, 1200))

    lines: list[str] = []
    for s in steps:
        idx = s.get("index")
        tool_name = (s.get("tool_call") or {}).get("tool_name") or s.get("type") or "?"
        page_url = s.get("page_url") or ""
        tr = s.get("tool_result") or {}
        kind = tr.get("kind") or ""
        text = tr.get("text") or ""

        header = f"[step {idx}] {tool_name}"
        if page_url:
            header += f"  url={page_url}"
        if kind:
            header += f"  ({kind})"
        lines.append(header)

        reasoning = (s.get("reasoning") or "").strip()
        if reasoning:
            lines.append(f"  reasoning: {_truncate_middle(reasoning, 400)}")

        if kind == "aria_tree" and text:
            lines.append(f"  tree: {_truncate_middle(text, aria_budget)}")
        elif kind in {"json", "text"} and text:
            lines.append(f"  result: {_truncate_middle(text, 400)}")

    summary = "\n".join(lines)
    if len(summary) > max_chars:
        summary = _truncate_middle(summary, max_chars)
    return summary


def build_block_user_prompt(task: str, trajectory: str, final_answer: str | None) -> str:
    answer = final_answer.strip() if final_answer else "(no final answer reported)"
    return (
        f"Task: {task}\n\n"
        f"Trajectory (steps with URLs, accessibility-tree snippets, and "
        f"reasoning):\n{trajectory}\n\n"
        f"Agent's final answer:\n{answer}"
    )


def call_block_detector(
    model: str, task: str, trajectory: str, final_answer: str | None
) -> BlockVerdict:
    user_prompt = build_block_user_prompt(task, trajectory, final_answer)
    text = _call_json_llm(model, BLOCK_SYSTEM, user_prompt, max_tokens=4000)
    parsed = json.loads(text)
    blocked = bool(parsed.get("blocked"))
    defense_type = parsed.get("defense_type")
    if defense_type is not None:
        defense_type = str(defense_type).strip().lower() or None
        if defense_type not in ALLOWED_DEFENSE_TYPES:
            defense_type = "other"
    if not blocked:
        defense_type = None
    step_index_raw = parsed.get("step_index")
    step_index: int | None
    try:
        step_index = int(step_index_raw) if step_index_raw is not None else None
    except (TypeError, ValueError):
        step_index = None
    return BlockVerdict(
        blocked=blocked,
        defense_type=defense_type,
        step_index=step_index,
        reason=str(parsed.get("reason") or "")[:500],
        model=model,
    )
