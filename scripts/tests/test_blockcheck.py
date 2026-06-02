# Copyright (c) 2026 PixieBrix, Inc.
# Licensed under PolyForm Shield 1.0.0 — see LICENSE.

# pyright: strict

"""Tests for `_blockcheck` helpers — the LLM-as-block-detector module that
decides whether a benchmark run hit an anti-agent defense."""

from __future__ import annotations

from _blockcheck import (
    _truncate_middle,  # pyright: ignore[reportPrivateUsage]
    build_block_user_prompt,
)


class TestTruncateMiddle:
    def test_under_budget_returns_input_unchanged(self) -> None:
        assert _truncate_middle("short text", max_chars=100) == "short text"

    def test_at_exact_budget_returns_unchanged(self) -> None:
        text = "x" * 50
        assert _truncate_middle(text, max_chars=50) == text

    def test_over_budget_keeps_head_and_tail(self) -> None:
        text = "A" * 1000 + "B" * 1000
        out = _truncate_middle(text, max_chars=200)
        # Both the start of the original (the "A" run) and the end (the "B"
        # run) must survive so block signals at either end aren't dropped.
        assert out.startswith("A")
        assert out.endswith("B")
        assert " […] " in out

    def test_truncated_length_stays_close_to_budget(self) -> None:
        text = "x" * 10_000
        out = _truncate_middle(text, max_chars=500)
        # The function reserves room for the ellipsis marker, so the result
        # is at most max_chars (well, max_chars-ish; the marker is 5 chars).
        assert len(out) <= 500

    def test_empty_input(self) -> None:
        assert _truncate_middle("", max_chars=100) == ""


class TestBuildBlockUserPrompt:
    def test_includes_task_trajectory_and_answer(self) -> None:
        prompt = build_block_user_prompt(
            task="Find the price",
            trajectory="[step 0] goto  url=https://example.com",
            final_answer="$42.99",
        )
        assert "Find the price" in prompt
        assert "[step 0] goto" in prompt
        assert "$42.99" in prompt

    def test_missing_answer_renders_placeholder(self) -> None:
        # Mirror the bug pinned by `_judge`'s tests: `None`, empty string,
        # and whitespace-only must all surface the same human-readable
        # placeholder so the detector LLM doesn't see a literal empty
        # answer (and a truthy whitespace string doesn't slip through the
        # `if final_answer` check to be `.strip()`'d into nothing).
        for missing in (None, "", "   "):
            prompt = build_block_user_prompt("t", "trajectory", missing)
            assert "(no final answer reported)" in prompt

    def test_strips_whitespace_around_answer(self) -> None:
        prompt = build_block_user_prompt("t", "trajectory", "  hello  \n")
        assert "hello" in prompt
        assert "  hello  " not in prompt
