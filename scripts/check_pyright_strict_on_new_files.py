#!/usr/bin/env -S uv run --script
# Copyright (c) 2026 PixieBrix, Inc.
# Licensed under PolyForm Shield 1.0.0 — see LICENSE.

# pyright: strict

# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Enforce the per-file pyright-strict ratchet on newly-added scripts.

The global pyright mode in `pyproject.toml` is `standard` because flipping
the whole ~7.6k-LOC `scripts/` tree to strict would fire hundreds of
"missing generic argument" errors in legacy data-shuffling helpers. To stop
the legacy debt from growing, every file ADDED in a PR must opt in to
strict mode with a `# pyright: strict` header comment. Existing files stay
on standard until they're cleaned up and promoted explicitly.

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

STRICT_MARKER = "# pyright: strict"
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


def has_strict_marker(path: Path) -> bool:
    """True if `# pyright: strict` appears in the file's header comment block.

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
                if line.strip() == STRICT_MARKER:
                    return True
    except OSError:
        return False
    return False


def main() -> int:
    base_ref = sys.argv[1] if len(sys.argv) > 1 else "origin/main"
    new_files = added_python_files(base_ref)
    if not new_files:
        return 0

    missing = [path for path in new_files if not has_strict_marker(path)]
    if not missing:
        print(f"OK — all {len(new_files)} new Python file(s) declare `{STRICT_MARKER}`")
        return 0

    for path in missing:
        # GitHub Actions annotation — surfaces inline in PR review.
        print(
            f"::error file={path}::New Python file must declare "
            f"`{STRICT_MARKER}` in its top comment block "
            f"(legacy files stay on `standard` mode; new files ratchet to strict).",
            file=sys.stderr,
        )
    return 1


if __name__ == "__main__":
    sys.exit(main())
