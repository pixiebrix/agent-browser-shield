#!/usr/bin/env -S uv run --script
# Copyright (c) 2026 PixieBrix, Inc.
# Licensed under PolyForm Shield 1.0.0 — see LICENSE.

# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "httpx>=0.27",
# ]
# ///
"""Fetch EasyList generic element-hiding rules and emit a TypeScript snapshot.

Output: extension/src/rules/easylist-generic.generated.ts (committed).

The snapshot ships with the extension so builds stay deterministic and
offline-capable. Re-run periodically to refresh:

    uv run scripts/fetch_easylist.py

We pull `easylist_general_hide.txt` only — the subset of EasyList with no
domain scoping, applicable on any page. Selectors using ABP extended
pseudo-classes (`:has-text()`, `:matches-css()`, `:-abp-*`, etc.) are
filtered out so each selector is valid CSS3 and safe to drop into a
stylesheet without invalidating the whole rule.

Output is consumed by `extension/src/rules/ads-hide.ts`, which injects the
selectors as a `display:none !important` stylesheet at content-script
inject time.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import httpx

# easylist-downloads.adblockplus.org publishes only the combined easylist.txt;
# the split source files (general_hide, specific_hide, etc.) live in the
# GitHub source repo. We pull from master — the file's been at this path
# for years.
SOURCE_URL = (
    "https://raw.githubusercontent.com/easylist/easylist/master/easylist/easylist_general_hide.txt"
)

OUTPUT_PATH = (
    Path(__file__).resolve().parent.parent
    / "extension"
    / "src"
    / "rules"
    / "easylist-generic.generated.ts"
)

# ABP / uBlock extended pseudo-classes that aren't valid CSS3. Including
# one of these in a CSS rule would silently drop that rule in the browser's
# CSSOM — so we exclude them at generation time. We deliberately KEEP `:has()`
# (now standard CSS, Chrome 105+; we assume Chrome 148+).
ABP_EXTENDED_MARKERS = (
    ":has-text(",
    ":contains(",
    ":matches-css(",
    ":matches-css-before(",
    ":matches-css-after(",
    ":matches-attr(",
    ":matches-path(",
    ":matches-property(",
    ":matches-media(",
    ":min-text-length(",
    ":if(",
    ":if-not(",
    ":nth-ancestor(",
    ":upward(",
    ":remove(",
    ":style(",
    ":xpath(",
    ":watch-attr(",
    ":others(",
    ":-abp-",
)

# Filter-list line markers that are not generic element-hiding rules:
#   ##+js(  scriptlet injection
#   #@#     element-hide exception
#   #?#     procedural cosmetic filter (ABP-extended)
#   #$#     CSS injection rule
#   #$?#    procedural CSS injection
SKIP_LINE_MARKERS = ("##+js(", "#@#", "#?#", "#$#", "#$?#")


def parse(text: str) -> list[str]:
    """Extract standard-CSS element-hiding selectors from an EasyList file."""
    selectors: list[str] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("!") or line.startswith("["):
            continue
        if any(marker in line for marker in SKIP_LINE_MARKERS):
            continue
        # easylist_general_hide.txt rules are domain-unscoped — they begin
        # with "##". Defensively skip anything else (a scoped rule that
        # might have slipped into the list).
        if not line.startswith("##"):
            continue
        selector = line[2:].strip()
        if not selector:
            continue
        if any(marker in selector for marker in ABP_EXTENDED_MARKERS):
            continue
        selectors.append(selector)
    # Preserve source order but dedupe — EasyList occasionally repeats a
    # selector under different comment sections.
    seen: set[str] = set()
    unique: list[str] = []
    for s in selectors:
        if s in seen:
            continue
        seen.add(s)
        unique.append(s)
    return unique


def emit(selectors: list[str]) -> str:
    lines = [
        "// AUTO-GENERATED — DO NOT EDIT BY HAND.",
        f"// Source: {SOURCE_URL}",
        "// Refresh with: uv run scripts/fetch_easylist.py",
        "//",
        "// EasyList generic element-hiding selectors, filtered to standard CSS",
        "// (ABP extended pseudos like :has-text(), :matches-css(), :-abp-* are",
        "// excluded so each selector can sit in a stylesheet rule without",
        "// invalidating it).",
        "",
        "export const EASYLIST_GENERIC_SELECTORS: readonly string[] = [",
    ]
    for selector in selectors:
        lines.append(f"  {json.dumps(selector)},")
    lines.append("] as const;")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    print(f"fetching {SOURCE_URL}", file=sys.stderr)
    response = httpx.get(SOURCE_URL, timeout=30.0, follow_redirects=True)
    response.raise_for_status()
    selectors = parse(response.text)
    output = emit(selectors)
    OUTPUT_PATH.write_text(output, encoding="utf-8")
    print(
        f"wrote {OUTPUT_PATH.relative_to(Path.cwd())} "
        f"({len(selectors):,} selectors, {len(output):,} bytes)",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
