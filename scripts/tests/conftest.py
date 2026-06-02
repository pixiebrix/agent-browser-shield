# Copyright (c) 2026 PixieBrix, Inc.
# Licensed under PolyForm Shield 1.0.0 — see LICENSE.

# pyright: strict

"""Pytest configuration for the scripts/ helper tests.

The scripts/ directory is intentionally not a package (it holds PEP 723
inline-dep entry points, not a library), so we put it on sys.path here so
tests can `from _judge import …` the same way the scripts import each
other at runtime.
"""

from __future__ import annotations

import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent.parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))
