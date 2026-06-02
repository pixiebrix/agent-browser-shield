# Copyright (c) 2026 PixieBrix, Inc.
# Licensed under PolyForm Shield 1.0.0 — see LICENSE.

# pyright: strict

"""Tests for `compare_scenarios` pure helpers — the formatters and
aggregators that render the cost-diff Markdown digest the benchmark loop
emits. A regression in `mean` or `summarize_scenario` silently corrupts
every diff report."""

from __future__ import annotations

from typing import Any

from compare_scenarios import (
    fmt_abs_delta,
    fmt_float,
    fmt_int,
    fmt_money,
    fmt_pct_delta,
    fmt_secs,
    judge_verdict,
    mean,
    summarize_scenario,
    token_field,
)


class TestFmtInt:
    def test_none_renders_em_dash(self) -> None:
        assert fmt_int(None) == "—"

    def test_integer_thousands_separator(self) -> None:
        assert fmt_int(1234567) == "1,234,567"

    def test_float_is_rounded(self) -> None:
        assert fmt_int(1234.7) == "1,235"

    def test_non_numeric_falls_back_to_str(self) -> None:
        assert fmt_int("oops") == "oops"


class TestFmtMoney:
    def test_none_renders_em_dash(self) -> None:
        assert fmt_money(None) == "—"

    def test_four_decimal_precision(self) -> None:
        # Per-call LLM costs run to sub-cent precision; four decimals is the
        # convention so $0.0001-level deltas are visible in the diff.
        assert fmt_money(0.123456) == "$0.1235"

    def test_zero(self) -> None:
        assert fmt_money(0) == "$0.0000"


class TestFmtSecs:
    def test_none_renders_em_dash(self) -> None:
        assert fmt_secs(None) == "—"

    def test_one_decimal_precision(self) -> None:
        assert fmt_secs(12.34) == "12.3s"


class TestFmtFloat:
    def test_default_one_decimal(self) -> None:
        assert fmt_float(3.14159) == "3.1"

    def test_custom_precision(self) -> None:
        assert fmt_float(3.14159, places=3) == "3.142"


class TestFmtPctDelta:
    def test_none_or_zero_baseline_renders_em_dash(self) -> None:
        assert fmt_pct_delta(None, 100) == "—"
        assert fmt_pct_delta(0, 100) == "—"
        assert fmt_pct_delta(100, None) == "—"

    def test_positive_delta_signed(self) -> None:
        assert fmt_pct_delta(100, 150) == "+50%"

    def test_negative_delta_signed(self) -> None:
        assert fmt_pct_delta(100, 80) == "-20%"


class TestFmtAbsDelta:
    def test_none_renders_em_dash(self) -> None:
        assert fmt_abs_delta(None, 100) == "—"
        assert fmt_abs_delta(100, None) == "—"

    def test_int_kind_signed_with_thousands(self) -> None:
        assert fmt_abs_delta(1000, 1500, kind="int") == "+500"
        assert fmt_abs_delta(5000, 3000, kind="int") == "-2,000"

    def test_money_kind_four_decimals(self) -> None:
        assert fmt_abs_delta(0.5, 0.7, kind="money") == "+0.2000"

    def test_secs_kind_one_decimal(self) -> None:
        assert fmt_abs_delta(10, 12.5, kind="secs") == "+2.5s"


class TestMean:
    def test_empty_list_returns_none(self) -> None:
        assert mean([]) is None

    def test_all_none_returns_none(self) -> None:
        # Critical: a column where every row has missing data must not
        # crash with `statistics.mean([])` — it must yield None so the diff
        # renders an em-dash instead.
        assert mean([None, None, None]) is None

    def test_filters_none_before_averaging(self) -> None:
        # A reasoning-tokens column may have None for non-reasoning models
        # mixed with real values for reasoning models in the same row set.
        assert mean([10, None, 20, None, 30]) == 20.0

    def test_mixed_int_and_float(self) -> None:
        assert mean([1, 2.5, 4]) == 2.5


class TestTokenField:
    def test_returns_none_when_tokens_block_absent(self) -> None:
        rows: list[dict[str, Any]] = [{"scenario": "a"}, {"scenario": "b"}]
        assert token_field(rows, "input") == [None, None]

    def test_picks_named_token_field_per_row(self) -> None:
        rows: list[dict[str, Any]] = [
            {"tokens": {"input": 100, "output": 50}},
            {"tokens": {"input": 200, "output": 75}},
        ]
        assert token_field(rows, "input") == [100, 200]
        assert token_field(rows, "output") == [50, 75]

    def test_missing_subfield_returns_none(self) -> None:
        rows: list[dict[str, Any]] = [
            {"tokens": {"input": 100}},
            {"tokens": {"input": 200, "reasoning": 30}},
        ]
        assert token_field(rows, "reasoning") == [None, 30]


class TestJudgeVerdict:
    def test_error_row_returns_error(self) -> None:
        # Error wins over judge state — a run that crashed mid-flight
        # shouldn't be counted as pass/fail based on a stale judge field.
        assert judge_verdict({"error": "timeout", "judge": {"pass": True}}) == "error"

    def test_pass_true(self) -> None:
        assert judge_verdict({"judge": {"pass": True}}) == "pass"

    def test_pass_false(self) -> None:
        assert judge_verdict({"judge": {"pass": False}}) == "fail"

    def test_missing_judge_block_is_ungraded(self) -> None:
        assert judge_verdict({}) == "ungraded"
        assert judge_verdict({"judge": {}}) == "ungraded"

    def test_pass_field_none_is_ungraded(self) -> None:
        # Judge was attempted but couldn't decide (e.g., model refused) —
        # distinct from "didn't run" but rendered the same in the diff.
        assert judge_verdict({"judge": {"pass": None}}) == "ungraded"


class TestSummarizeScenario:
    def test_empty_rows_returns_zeroed_summary(self) -> None:
        result = summarize_scenario([])
        assert result["n"] == 0
        assert result["pass"] == 0
        assert result["fail"] == 0
        assert result["input"] is None  # mean of empty → None
        assert result["cost"] is None

    def test_counts_judge_verdicts(self) -> None:
        rows: list[dict[str, Any]] = [
            {"judge": {"pass": True}},
            {"judge": {"pass": True}},
            {"judge": {"pass": False}},
            {"error": "timeout"},
            {"judge": {}},
        ]
        result = summarize_scenario(rows)
        assert result["n"] == 5
        assert result["pass"] == 2
        assert result["fail"] == 1
        assert result["error"] == 1
        assert result["ungraded"] == 1

    def test_averages_numeric_fields(self) -> None:
        rows: list[dict[str, Any]] = [
            {
                "tokens": {"input": 100, "output": 50, "total": 150},
                "cost_usd": 0.001,
                "steps_taken": 5,
                "duration_s": 10.0,
            },
            {
                "tokens": {"input": 200, "output": 100, "total": 300},
                "cost_usd": 0.003,
                "steps_taken": 7,
                "duration_s": 14.0,
            },
        ]
        result = summarize_scenario(rows)
        assert result["input"] == 150.0
        assert result["output"] == 75.0
        assert result["total"] == 225.0
        assert result["cost"] == 0.002
        assert result["steps"] == 6.0
        assert result["duration"] == 12.0
