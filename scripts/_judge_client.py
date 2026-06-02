# Copyright (c) 2026 PixieBrix, Inc.
# Licensed under PolyForm Shield 1.0.0 — see LICENSE.

# pyright: standard
# pyright: reportMissingImports=none

"""LLM client dispatch for the judge / extractor / block-detector helpers.

This module owns vendor-specific imports (openai, anthropic) and the
network-shaped functions that wrap them. It stays on pyright's `standard`
mode rather than `strict` because the unresolved vendor SDKs would
cascade into "unknown type" errors on every client variable — see the
ratchet note in pyproject.toml `[tool.pyright]`.

`_judge.py` (strict) owns the pure prompt-shaping and configuration
helpers and is fully covered by `scripts/tests/test_judge.py`. Cross-file
callers import the pure helpers from `_judge` and the dispatching
functions from here.
"""

from __future__ import annotations

import json
import os

from _judge import (
    EXTRACTOR_SYSTEM,
    JUDGE_SYSTEM,
    ExtractedAnswer,
    JudgeVerdict,
    build_extractor_user_prompt,
    build_judge_user_prompt,
)


def call_json_llm(model: str, system: str, user_prompt: str, *, max_tokens: int = 4000) -> str:
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
    text = call_json_llm(model, JUDGE_SYSTEM, user_prompt, max_tokens=4000)
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
    text = call_json_llm(model, EXTRACTOR_SYSTEM, user_prompt, max_tokens=4000)
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
