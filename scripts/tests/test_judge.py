# Copyright (c) 2026 PixieBrix, Inc.
# Licensed under PolyForm Shield 1.0.0 — see LICENSE.

# pyright: strict

"""Tests for `_judge` helpers — prompt assembly and model resolution shared
by benchmark_run.py and benchmark_report.py."""

from __future__ import annotations

from _judge import (
    DEFAULT_JUDGE_MODEL,
    build_extractor_user_prompt,
    build_judge_user_prompt,
    resolve_judge_model,
)


class TestBuildJudgeUserPrompt:
    def test_includes_task_criteria_and_answer(self) -> None:
        prompt = build_judge_user_prompt(
            task="Find the price",
            criteria="Returns the dollar amount",
            final_answer="$42.99",
        )
        assert "Find the price" in prompt
        assert "Returns the dollar amount" in prompt
        assert "$42.99" in prompt

    def test_missing_answer_renders_placeholder(self) -> None:
        # `None` and the empty string both mean "agent never produced an
        # answer" — both must surface as the same human-readable placeholder
        # so the judge LLM doesn't see literal "None" or "".
        for missing in (None, "", "   "):
            prompt = build_judge_user_prompt("t", "c", missing)
            assert "(no final answer reported)" in prompt

    def test_strips_whitespace_around_answer(self) -> None:
        prompt = build_judge_user_prompt("t", "c", "  hello  \n")
        assert "hello" in prompt
        assert "  hello  " not in prompt


class TestBuildExtractorUserPrompt:
    def test_same_shape_as_judge(self) -> None:
        # Judge and extractor currently share an identical prompt shape; if
        # this ever diverges, the assertion forces the divergence to be
        # explicit rather than accidental.
        task, criteria, answer = "t", "c", "a"
        assert build_extractor_user_prompt(task, criteria, answer) == build_judge_user_prompt(
            task, criteria, answer
        )


class TestResolveJudgeModel:
    def test_explicit_args_model_wins(self) -> None:
        assert (
            resolve_judge_model("anthropic/claude-3-5-sonnet", {"judge_model": "openai/gpt-4o"})
            == "anthropic/claude-3-5-sonnet"
        )

    def test_falls_back_to_scenario_default(self) -> None:
        assert resolve_judge_model(None, {"judge_model": "openai/gpt-4o"}) == "openai/gpt-4o"

    def test_falls_back_to_module_default(self) -> None:
        assert resolve_judge_model(None, {}) == DEFAULT_JUDGE_MODEL

    def test_empty_args_model_treated_as_unset(self) -> None:
        # CLI may surface an empty `--judge-model ""` — should NOT short-circuit
        # the lookup chain to "use the empty string as a model name".
        assert resolve_judge_model("", {"judge_model": "openai/gpt-4o"}) == "openai/gpt-4o"
