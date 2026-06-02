# Copyright (c) 2026 PixieBrix, Inc.
# Licensed under PolyForm Shield 1.0.0 — see LICENSE.

# pyright: strict

"""Tests for `_blockcheck` helpers — the LLM-as-block-detector module that
decides whether a benchmark run hit an anti-agent defense."""

from __future__ import annotations

from _blockcheck import _truncate_middle  # pyright: ignore[reportPrivateUsage]


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
