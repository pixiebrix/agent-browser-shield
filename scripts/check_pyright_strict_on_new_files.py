#!/usr/bin/env -S uv run --script
# Copyright (c) 2026 PixieBrix, Inc.
# Licensed under PolyForm Shield 1.0.0 — see LICENSE.

# pyright: strict

# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Enforce an explicit per-file pyright mode declaration on newly-added scripts.

The global pyright mode in `pyproject.toml` is `standard` because flipping
the whole ~7.6k-LOC `scripts/` tree to strict would fire hundreds of
"missing generic argument" errors in legacy data-shuffling helpers. To
stop legacy debt from growing, every file ADDED in a PR must declare its
mode explicitly with a header comment:

  - `# pyright: strict` — the default for new code; preferred.
  - `# pyright: standard` — opt-out for files that genuinely can't be
    strict (e.g. `_judge_client.py` touches unresolved vendor SDK
    imports whose unknown types cascade into "unknown type" errors on
    every client variable). Must be paired with a comment in the file's
    docstring explaining why.

Either is acceptable; declaring neither is a CI failure. This forces the
mode decision to be visible at review time rather than implicit.

Usage:
  uv run scripts/check_pyright_strict_on_new_files.py [base-ref]

`base-ref` defaults to `origin/main`. In CI we pass `origin/${{ github.base_ref }}`.
Local pre-commit runs operate on staged files only and skip this script
(the diff against a base ref isn't meaningful for a single commit).
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ACCEPTED_MARKERS = ("# pyright: strict", "# pyright: standard")
SCAN_LINE_BUDGET = 20


def added_python_files(base_ref: str) -> list[Path]:
    """Return paths of Python files added (not modified) since base_ref."""
    result = subprocess.run(
        [
            "git",
            "diff",
            "--name-only",
            "--diff-filter=A",
            f"{base_ref}...HEAD",
            "--",
            "scripts/*.py",
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return [Path(line) for line in result.stdout.splitlines() if line]


def has_mode_marker(path: Path) -> bool:
    """True if any accepted pyright mode marker appears in the file's header.

    Pyright only honors the directive if it precedes the first non-comment
    line, so we cap the scan at SCAN_LINE_BUDGET lines — enough room for a
    shebang, license header, and PEP 723 dep block.
    """
    try:
        with path.open() as f:
            for _ in range(SCAN_LINE_BUDGET):
                line = f.readline()
                if not line:
                    break
                if line.strip() in ACCEPTED_MARKERS:
                    return True
    except OSError:
        return False
    return False


def main() -> int:
    base_ref = sys.argv[1] if len(sys.argv) > 1 else "origin/main"
    new_files = added_python_files(base_ref)
    if not new_files:
        return 0

    missing = [path for path in new_files if not has_mode_marker(path)]
    if not missing:
        markers = " or ".join(f"`{m}`" for m in ACCEPTED_MARKERS)
        print(f"OK — all {len(new_files)} new Python file(s) declare {markers}")
        return 0

    for path in missing:
        markers = " or ".join(f"`{m}`" for m in ACCEPTED_MARKERS)
        # GitHub Actions annotation — surfaces inline in PR review.
        print(
            f"::error file={path}::New Python file must declare {markers} "
            f"in its top comment block. `strict` is preferred; `standard` is "
            f"a deliberate opt-out that should be paired with a docstring "
            f"comment explaining why this file can't be strict.",
            file=sys.stderr,
        )
    return 1


if __name__ == "__main__":
    sys.exit(main())
