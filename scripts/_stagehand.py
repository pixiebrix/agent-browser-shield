# Copyright (c) 2026 PixieBrix, Inc.
# Licensed under PolyForm Shield 1.0.0 — see LICENSE.

"""Helpers shared by scripts/agent_task.py and scripts/benchmark_run.py.

This module is imported, not run as a script — its callers declare the
relevant PEP 723 dependencies (stagehand, browserbase, python-dotenv).
"""

from __future__ import annotations

import json
import logging
import os
import sys
from typing import Any

LOG = logging.getLogger("agent-browser-shield")

SDK_LOGGERS = ("stagehand", "browserbase", "browser_use", "httpx", "openai")


def configure_logging(verbosity: int) -> None:
    if verbosity >= 2:
        root_level, sdk_level = logging.DEBUG, logging.DEBUG
    elif verbosity == 1:
        root_level, sdk_level = logging.INFO, logging.INFO
    else:
        root_level, sdk_level = logging.WARNING, logging.WARNING
    logging.basicConfig(
        level=root_level,
        format="%(asctime)s %(levelname)-5s %(name)s | %(message)s",
        datefmt="%H:%M:%S",
    )
    for name in SDK_LOGGERS:
        logging.getLogger(name).setLevel(sdk_level)
    LOG.setLevel(logging.INFO if verbosity == 0 else root_level)


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        sys.exit(f"Missing required environment variable: {name}")
    return value


def optional_env(name: str) -> str | None:
    """Return the env var if set and non-empty, else None.

    Used for MODEL_API_KEY: when unset, Stagehand routes the agent's LLM
    calls through Browserbase Model Gateway (billed to BROWSERBASE_API_KEY).
    """
    value = os.environ.get(name)
    return value or None


def event_to_dict(event: Any) -> Any:
    """Best-effort recursive conversion of a Stagehand event to a
    json-serializable structure.

    Stagehand's `sessions.execute()` yields `(name, payload)` tuples where the
    payload is usually a pydantic `Data` model (with `.result.usage`,
    `.result.message`, `.result.actions`, …). Without recursive conversion the
    payload lands as a `repr()` string and downstream parsers can't see the
    structured fields.
    """
    if isinstance(event, (tuple, list)) and len(event) == 2 and isinstance(event[0], str):
        return {"type": event[0], "payload": event_to_dict(event[1])}
    if isinstance(event, (list, tuple)):
        return [event_to_dict(item) for item in event]
    if isinstance(event, dict):
        return {k: event_to_dict(v) for k, v in event.items()}
    dump = getattr(event, "model_dump", None)
    if callable(dump):
        try:
            return event_to_dict(dump())
        # Fall through to other serialization strategies if model_dump() raises.
        except Exception:  # nosec B110
            pass
    if hasattr(event, "__dict__") and not isinstance(event, type):
        return {k: event_to_dict(v) for k, v in vars(event).items() if not k.startswith("_")}
    if isinstance(event, (str, int, float, bool)) or event is None:
        return event
    return str(event)


def extract_usage(payload: Any) -> dict[str, int] | None:
    """Walk an event payload looking for token-usage fields. Stagehand wraps
    LLM call usage in different shapes across event types; this is defensive.

    Cache and reasoning fields are gathered across providers:
      - OpenAI: `cached_input_tokens` (Stagehand-normalized) or nested
        `prompt_tokens_details.cached_tokens` / `completion_tokens_details.reasoning_tokens`.
      - Anthropic: `cache_read_input_tokens` (cache hits, billed at a discount)
        and `cache_creation_input_tokens` (cache writes, billed at a premium).
      - Gemini: `cached_content_token_count` / `cachedContentTokenCount`.

    Stagehand's gateway already maps the per-provider field into
    `cached_input_tokens` in `usage` for routed calls, but we still search
    the raw provider names so direct-provider events (and future schema
    drift) work without code changes.
    """
    if not isinstance(payload, dict):
        return None

    def find(key_names: tuple[str, ...]) -> Any:
        # Breadth-first hunt for the first matching key anywhere in the tree.
        stack: list[Any] = [payload]
        while stack:
            node = stack.pop()
            if isinstance(node, dict):
                for key in key_names:
                    if key in node:
                        return node[key]
                stack.extend(node.values())
            elif isinstance(node, list):
                stack.extend(node)
        return None

    def find_in(root: Any, key_names: tuple[str, ...]) -> Any:
        stack: list[Any] = [root]
        while stack:
            node = stack.pop()
            if isinstance(node, dict):
                for key in key_names:
                    if key in node:
                        return node[key]
                stack.extend(node.values())
            elif isinstance(node, list):
                stack.extend(node)
        return None

    usage_block = find(("usage", "token_usage", "tokenUsage"))
    if not isinstance(usage_block, dict):
        return None
    input_tok = (
        usage_block.get("input_tokens")
        or usage_block.get("inputTokens")
        or usage_block.get("prompt_tokens")
        or usage_block.get("promptTokens")
        or usage_block.get("prompt_token_count")
        or usage_block.get("promptTokenCount")
    )
    output_tok = (
        usage_block.get("output_tokens")
        or usage_block.get("outputTokens")
        or usage_block.get("completion_tokens")
        or usage_block.get("completionTokens")
        or usage_block.get("candidates_token_count")
        or usage_block.get("candidatesTokenCount")
    )
    if input_tok is None and output_tok is None:
        return None
    input_n = int(input_tok or 0)
    output_n = int(output_tok or 0)
    cached_tok = find_in(
        usage_block,
        (
            "cached_input_tokens",
            "cachedInputTokens",
            "cache_read_input_tokens",
            "cacheReadInputTokens",
            "cached_tokens",
            "cachedTokens",
            "cached_content_token_count",
            "cachedContentTokenCount",
        ),
    )
    cache_creation_tok = find_in(
        usage_block,
        ("cache_creation_input_tokens", "cacheCreationInputTokens"),
    )
    reasoning_tok = find_in(
        usage_block,
        ("reasoning_tokens", "reasoningTokens"),
    )
    result: dict[str, int] = {
        "input": input_n,
        "output": output_n,
        "total": input_n + output_n,
    }
    if cached_tok is not None:
        result["cached"] = int(cached_tok or 0)
    if cache_creation_tok is not None:
        result["cache_creation"] = int(cache_creation_tok or 0)
    if reasoning_tok is not None:
        result["reasoning"] = int(reasoning_tok or 0)
    return result


def format_event(event: Any) -> str:
    try:
        return json.dumps(event_to_dict(event), indent=2, default=str, sort_keys=True)
    except (TypeError, ValueError):
        return repr(event)
