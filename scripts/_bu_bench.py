"""Decrypt and adapt BU Bench V1 tasks to agent-browser-shield's Task shape.

Browser Use's BU Bench V1 ships its 100 tasks as a Fernet-encrypted blob
(`BU_Bench_V1.enc`) to discourage LLM-training contamination. The decryption
passphrase is hardcoded in upstream's `run_eval.py` and reproduced here.

This module is imported, not run as a script — callers (currently
`benchmark_run.py`) declare `cryptography` in their PEP 723 deps.
"""

from __future__ import annotations

import base64
import hashlib
import json
from pathlib import Path
from typing import Any

# Upstream uses sha256(b"BU_Bench_V1") as the Fernet key seed; see
# https://github.com/browser-use/benchmark `run_eval.py`.
_FERNET_PASSPHRASE = b"BU_Bench_V1"


def _fernet_key() -> bytes:
    return base64.urlsafe_b64encode(hashlib.sha256(_FERNET_PASSPHRASE).digest())


def decrypt_bu_bench(enc_path: Path) -> list[dict[str, Any]]:
    """Decrypt the canonical BU Bench V1 blob in-memory."""
    from cryptography.fernet import Fernet

    blob = base64.b64decode(enc_path.read_bytes())
    plaintext = Fernet(_fernet_key()).decrypt(blob)
    data = json.loads(plaintext)
    if not isinstance(data, list):
        raise ValueError(f"{enc_path}: expected JSON list, got {type(data).__name__}")
    return data


def load_plain_bu_bench(path: Path) -> list[dict[str, Any]]:
    """Load an already-decrypted .json (list) or .jsonl file for local dev."""
    text = path.read_text(encoding="utf-8")
    if path.suffix.lower() == ".jsonl":
        return [json.loads(line) for line in text.splitlines() if line.strip()]
    data = json.loads(text)
    if not isinstance(data, list):
        raise ValueError(f"{path}: expected JSON list, got {type(data).__name__}")
    return data


def synthesize_criteria(entry: dict[str, Any]) -> str:
    """Build a judge-facing criteria string from a BU Bench entry.

    Our OpenAI judge expects a `success_criteria` field. BU Bench tasks ship
    with `confirmed_task` plus an optional `answer` (ground truth). Encode the
    ground truth here so the existing judge prompt grades factually without
    needing changes.
    """
    answer = (entry.get("answer") or "").strip()
    category = entry.get("category") or "unspecified"
    if answer:
        return (
            f"Source: BU Bench V1 ({category}). Ground truth answer:\n{answer}\n\n"
            "Pass if the agent's response correctly conveys this answer. "
            "Formatting differences are fine; factual content must match."
        )
    return (
        f"Source: BU Bench V1 ({category}). No ground-truth answer provided "
        "(open-ended task). Pass if the agent meaningfully completed the "
        "user's request as written and reported a coherent final answer."
    )
