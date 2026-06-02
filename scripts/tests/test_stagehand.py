# Copyright (c) 2026 PixieBrix, Inc.
# Licensed under PolyForm Shield 1.0.0 — see LICENSE.

# pyright: strict

"""Tests for `_stagehand.extract_usage` — defensive parser that pulls token
usage out of Stagehand event payloads across OpenAI, Anthropic, and Gemini
shapes. Regressions here corrupt the per-row `tokens` field that the cost
diff and cost ratchets read."""

from __future__ import annotations

from typing import Any

from _stagehand import extract_usage


class TestExtractUsageBasic:
    def test_returns_none_for_non_dict_payload(self) -> None:
        assert extract_usage(None) is None
        assert extract_usage("not a dict") is None
        assert extract_usage([]) is None

    def test_returns_none_when_no_usage_block(self) -> None:
        assert extract_usage({"event_type": "log", "message": "hi"}) is None

    def test_returns_none_when_usage_block_has_no_token_fields(self) -> None:
        # `usage` present but neither input nor output token counts under it —
        # should not synthesize a `total: 0` result.
        assert extract_usage({"usage": {"latency_ms": 123}}) is None


class TestExtractUsageVendorShapes:
    def test_openai_style_snake_case(self) -> None:
        payload: dict[str, Any] = {
            "usage": {
                "prompt_tokens": 1200,
                "completion_tokens": 300,
                "prompt_tokens_details": {"cached_tokens": 800},
                "completion_tokens_details": {"reasoning_tokens": 100},
            }
        }
        result = extract_usage(payload)
        assert result == {
            "input": 1200,
            "output": 300,
            "total": 1500,
            "cached": 800,
            "reasoning": 100,
        }

    def test_anthropic_style(self) -> None:
        payload: dict[str, Any] = {
            "usage": {
                "input_tokens": 500,
                "output_tokens": 200,
                "cache_read_input_tokens": 400,
                "cache_creation_input_tokens": 50,
            }
        }
        result = extract_usage(payload)
        assert result == {
            "input": 500,
            "output": 200,
            "total": 700,
            "cached": 400,
            "cache_creation": 50,
        }

    def test_gemini_style_camel_case(self) -> None:
        payload: dict[str, Any] = {
            "tokenUsage": {
                "promptTokenCount": 800,
                "candidatesTokenCount": 250,
                "cachedContentTokenCount": 600,
            }
        }
        result = extract_usage(payload)
        assert result == {
            "input": 800,
            "output": 250,
            "total": 1050,
            "cached": 600,
        }


class TestExtractUsageDefensive:
    def test_finds_usage_nested_under_event_envelope(self) -> None:
        # Stagehand frequently wraps the LLM response in an outer event
        # envelope; the BFS should find usage anywhere in the tree.
        payload: dict[str, Any] = {
            "event_type": "agent.llm_call",
            "response": {
                "id": "resp_abc",
                "usage": {"input_tokens": 100, "output_tokens": 50},
            },
        }
        result = extract_usage(payload)
        assert result == {"input": 100, "output": 50, "total": 150}

    def test_zero_output_with_nonzero_input(self) -> None:
        # An aborted / refused call may report input tokens with no output.
        # We still want a record so it shows up in totals — not silently
        # dropped as "no usage info".
        result = extract_usage({"usage": {"input_tokens": 42, "output_tokens": 0}})
        assert result == {"input": 42, "output": 0, "total": 42}

    def test_omits_optional_fields_when_absent(self) -> None:
        # If the provider didn't report cached/reasoning tokens at all, the
        # result must NOT carry `cached: 0` — downstream code uses presence
        # to decide whether to show the column.
        result = extract_usage({"usage": {"input_tokens": 10, "output_tokens": 5}})
        assert result == {"input": 10, "output": 5, "total": 15}
        assert result is not None
        assert "cached" not in result
        assert "reasoning" not in result
