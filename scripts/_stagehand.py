# Copyright (c) 2026 PixieBrix, Inc.
# Licensed under PolyForm Shield 1.0.0 — see LICENSE.

# pyright: strict

"""Helpers shared by scripts/agent_task.py and scripts/benchmark_run.py.

This module is imported, not run as a script — its callers declare the
relevant PEP 723 dependencies (stagehand, browserbase, python-dotenv).

`event_to_dict` and `extract_usage` are *defensive* parsers — Stagehand
payload shapes vary across event types (pydantic models, tuples, raw
dicts), so their public signatures take `Any`. Internally we narrow with
`isinstance` checks plus explicit `cast()`s at the boundary so strict
mode sees concrete dict/list element types instead of `Unknown`.
"""

from __future__ import annotations

import json
import logging
import os
import sys
from typing import Any, cast

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
    if isinstance(event, (tuple, list)):
        seq = cast("list[Any] | tuple[Any, ...]", event)
        if len(seq) == 2 and isinstance(seq[0], str):
            return {"type": seq[0], "payload": event_to_dict(seq[1])}
        return [event_to_dict(item) for item in seq]
    if isinstance(event, dict):
        event_dict = cast("dict[Any, Any]", event)
        return {k: event_to_dict(v) for k, v in event_dict.items()}
    dump = cast("Any", getattr(event, "model_dump", None))
    if callable(dump):
        try:
            return event_to_dict(dump())
        # Fall through to other serialization strategies if model_dump() raises.
        except Exception:  # nosec B110
            pass
    if hasattr(event, "__dict__") and not isinstance(event, type):
        attrs = cast("dict[str, Any]", vars(event))
        return {k: event_to_dict(v) for k, v in attrs.items() if not k.startswith("_")}
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
    payload_dict = cast("dict[str, Any]", payload)

    def find_in(root: Any, key_names: tuple[str, ...]) -> Any:
        # Breadth-first hunt for the first matching key anywhere in the tree.
        # `stack` is heterogeneous (any subtree element); each pop narrows via
        # isinstance + cast so strict mode sees concrete dict/list types.
        stack: list[Any] = [root]
        while stack:
            node = stack.pop()
            if isinstance(node, dict):
                node_dict = cast("dict[str, Any]", node)
                for key in key_names:
                    if key in node_dict:
                        return node_dict[key]
                stack.extend(node_dict.values())
            elif isinstance(node, list):
                node_list = cast("list[Any]", node)
                stack.extend(node_list)
        return None

    usage_block = find_in(payload_dict, ("usage", "token_usage", "tokenUsage"))
    if not isinstance(usage_block, dict):
        return None
    usage = cast("dict[str, Any]", usage_block)
    input_tok = (
        usage.get("input_tokens")
        or usage.get("inputTokens")
        or usage.get("prompt_tokens")
        or usage.get("promptTokens")
        or usage.get("prompt_token_count")
        or usage.get("promptTokenCount")
    )
    output_tok = (
        usage.get("output_tokens")
        or usage.get("outputTokens")
        or usage.get("completion_tokens")
        or usage.get("completionTokens")
        or usage.get("candidates_token_count")
        or usage.get("candidatesTokenCount")
    )
    if input_tok is None and output_tok is None:
        return None
    input_n = int(input_tok or 0)
    output_n = int(output_tok or 0)
    cached_tok = find_in(
        usage,
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
        usage,
        ("cache_creation_input_tokens", "cacheCreationInputTokens"),
    )
    reasoning_tok = find_in(
        usage,
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
