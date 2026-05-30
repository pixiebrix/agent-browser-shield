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
        except Exception:
            pass
    if hasattr(event, "__dict__") and not isinstance(event, type):
        return {k: event_to_dict(v) for k, v in vars(event).items() if not k.startswith("_")}
    if isinstance(event, (str, int, float, bool)) or event is None:
        return event
    return str(event)


def format_event(event: Any) -> str:
    try:
        return json.dumps(event_to_dict(event), indent=2, default=str, sort_keys=True)
    except (TypeError, ValueError):
        return repr(event)
