"""LLM-as-judge + LLM-as-extractor helpers shared by benchmark_run.py and
benchmark_report.py.

This module is imported, not run as a script — its callers declare the
relevant PEP 723 dependencies (anthropic, openai, pyyaml, python-dotenv).
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

DEFAULT_JUDGE_MODEL = "openai/gpt-4o-mini"

JUDGE_SYSTEM = (
    "You grade browser-agent task completions on factual correctness, not "
    "formatting. Given the task, the success criteria, and the agent's final "
    "answer, decide whether the correct answer is present in the response.\n\n"
    "Important: a separate downstream step extracts and canonicalizes the "
    "final answer, so you should IGNORE formatting requirements in the task "
    "(exact templates, punctuation, casing, units, surrounding prose, "
    'phrases like "report in this exact format and nothing else"). The '
    "agent's response is allowed to include explanation, narration of steps "
    "taken, or extra prose around the answer. Pass as long as the correct "
    "value(s) are clearly stated somewhere in the response and a reader "
    "could unambiguously identify them.\n\n"
    "Only fail when the answer is factually wrong, missing a required "
    "component, ambiguous between multiple candidates, or when the agent "
    "explicitly says it could not complete the task.\n\n"
    "Respond with strict JSON of the form "
    '{"pass": true|false, "reason": "<one short sentence>"}. No prose outside JSON.'
)

EXTRACTOR_SYSTEM = (
    "You extract the canonical single answer from a browser-agent's response "
    "when the task admits one. Some tasks have a single comparable answer "
    "(a version number, a price, a numeric count, a specific product/model "
    "code, a named entity); others are open-ended (paraphrased descriptions, "
    "headlines whose wording varies, multi-element answers). Decide which "
    "case applies based on the task and success criteria.\n\n"
    "Respond with strict JSON of the form "
    '{"extractable": true|false, "value": "<normalized>"|null, '
    '"reason": "<one short sentence>"}. No prose outside JSON.\n\n'
    "Normalization rules so two runs producing the same canonical answer "
    "yield identical strings: digits without thousands separators; prices "
    'like "$129.99"; versions like "19.2.0"; preserve proper-noun casing; '
    "trim surrounding whitespace. When the task has multiple required parts "
    "(e.g. model + price), join them with ' / ' in a stable order matching "
    "the task wording. Set extractable=false (and value=null) when the task "
    "is genuinely open-ended. If the agent didn't provide the value, set "
    "value=null but still report extractable based on the *task*, not the "
    "agent's failure."
)


@dataclass
class JudgeVerdict:
    passed: bool
    reason: str
    model: str

    def to_record(self) -> dict[str, Any]:
        return {"pass": self.passed, "reason": self.reason, "model": self.model}


@dataclass
class ExtractedAnswer:
    extractable: bool
    value: str | None
    reason: str
    model: str

    def to_record(self) -> dict[str, Any]:
        return {
            "extractable": self.extractable,
            "value": self.value,
            "reason": self.reason,
            "model": self.model,
        }


def build_judge_user_prompt(task: str, criteria: str, final_answer: str | None) -> str:
    answer = final_answer.strip() if final_answer else "(no final answer reported)"
    return f"Task: {task}\n\nSuccess criteria: {criteria}\n\nAgent's final answer:\n{answer}"


def build_extractor_user_prompt(task: str, criteria: str, final_answer: str | None) -> str:
    answer = final_answer.strip() if final_answer else "(no final answer reported)"
    return f"Task: {task}\n\nSuccess criteria: {criteria}\n\nAgent's final answer:\n{answer}"


def _call_json_llm(model: str, system: str, user_prompt: str, *, max_tokens: int = 4000) -> str:
    """Dispatch to the configured vendor and return the raw JSON text."""
    vendor, _, model_name = model.partition("/")
    if not model_name:
        raise ValueError(f"model must be vendor/name, got {model!r}")

    openrouter_key = os.environ.get("OPENROUTER_API_KEY")
    if openrouter_key:
        from openai import OpenAI

        client = OpenAI(
            api_key=openrouter_key,
            base_url="https://openrouter.ai/api/v1",
        )
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
            max_tokens=max_tokens,
        )
        return resp.choices[0].message.content or ""

    if vendor == "anthropic":
        from anthropic import Anthropic

        api_key = os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("MODEL_API_KEY")
        if not api_key:
            raise RuntimeError("ANTHROPIC_API_KEY (or MODEL_API_KEY) required for anthropic model")
        client = Anthropic(api_key=api_key)
        resp = client.messages.create(
            model=model_name,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user_prompt}],
        )
        return "".join(block.text for block in resp.content if getattr(block, "type", "") == "text")
    if vendor == "openai":
        from openai import OpenAI

        api_key = os.environ.get("OPENAI_API_KEY") or os.environ.get("MODEL_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY (or MODEL_API_KEY) required for openai model")
        client = OpenAI(api_key=api_key)
        resp = client.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
        )
        return resp.choices[0].message.content or ""
    raise ValueError(f"unsupported vendor: {vendor!r}")


def call_judge(model: str, task: str, criteria: str, final_answer: str | None) -> JudgeVerdict:
    user_prompt = build_judge_user_prompt(task, criteria, final_answer)
    text = _call_json_llm(model, JUDGE_SYSTEM, user_prompt, max_tokens=4000)
    parsed = json.loads(text)
    return JudgeVerdict(
        passed=bool(parsed.get("pass")),
        reason=str(parsed.get("reason") or "")[:500],
        model=model,
    )


def call_extractor(
    model: str, task: str, criteria: str, final_answer: str | None
) -> ExtractedAnswer:
    user_prompt = build_extractor_user_prompt(task, criteria, final_answer)
    text = _call_json_llm(model, EXTRACTOR_SYSTEM, user_prompt, max_tokens=4000)
    parsed = json.loads(text)
    raw_value = parsed.get("value")
    value: str | None
    if raw_value is None:
        value = None
    else:
        value = str(raw_value).strip() or None
    return ExtractedAnswer(
        extractable=bool(parsed.get("extractable")),
        value=value,
        reason=str(parsed.get("reason") or "")[:500],
        model=model,
    )


def load_judge_defaults_from_scenarios(scenarios_path: Path) -> dict[str, Any]:
    """Pull the `defaults` block from a scenarios.yaml file. Returns {} on miss."""
    try:
        import yaml

        return yaml.safe_load(scenarios_path.read_text(encoding="utf-8")).get("defaults") or {}
    except Exception:
        return {}


def resolve_judge_model(args_model: str | None, defaults: dict[str, Any]) -> str:
    return args_model or defaults.get("judge_model") or DEFAULT_JUDGE_MODEL
