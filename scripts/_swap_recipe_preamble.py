#!/usr/bin/env -S uv run --script
# Copyright (c) 2026 PixieBrix, Inc.
# Licensed under PolyForm Shield 1.0.0 — see LICENSE.

# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Rewrite the leading line of every `search-url-helper` recipe across all
extension/data/sites/*.yaml files so we can A/B-test different preamble
wording in autoresearch experiments without committing one variant per
branch.

Matches the canonical line shape used by ~60 recipes today:

    abs URL helper for {host} — prefer URL navigation over typing.

Replaces it with the chosen variant text, substituting `{host}` in the new
line with whatever host the original line carried. A `.preamble-bak` file
is written alongside each modified yaml so `--restore` can put the original
back without git knowing anything happened.

Recipes whose first line doesn't match the canonical shape (e.g.
google-flights, which has its own preamble) are skipped — those preambles
encode site-specific guidance and shouldn't be flattened.

Usage:
  ./scripts/_swap_recipe_preamble.py --variant baseline
  ./scripts/_swap_recipe_preamble.py --variant no-guess
  ./scripts/_swap_recipe_preamble.py --variant terse
  ./scripts/_swap_recipe_preamble.py --restore
  ./scripts/_swap_recipe_preamble.py --list

Variants are inlined below so they live with the script. Edit VARIANTS to
add or refine. `{host}` in the template is substituted with the captured
host from the original line.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SITES_DIR = REPO_ROOT / "extension" / "data" / "sites"
BAK_SUFFIX = ".preamble-bak"

# Captures `abs URL helper for <host> — prefer URL navigation over typing.`
# anywhere in the file. The host can contain `.`, `/`, `-`, and parenthesized
# clarifiers (e.g. `hn.algolia.com (Hacker News search)`); the trailing em-dash
# and exact suffix anchor the match so we don't accidentally rewrite hand-
# written preambles like google-flights'.
CANONICAL = re.compile(
    r"abs URL helper for ([^—\n]+?) — prefer URL navigation over typing\.",
)

VARIANTS: dict[str, str] = {
    # Current shipped wording — kept here so `--variant baseline` is the
    # explicit "restore to current trunk" knob alongside `--restore`.
    "baseline": "abs URL helper for {host} — prefer URL navigation over typing.",
    # Explicit no-guess clause: warns the agent off inventing host-internal
    # identifiers, points it at the search template / on-page UI as the
    # fallback. The hypothesis under test is that this reduces wasted
    # steps on recipes that include `Direct {entity}: /…/{ID}` templates
    # (Amazon ASINs, IKEA category codes, IMDb tt-ids, etc.).
    "no-guess": (
        "abs URL helper for {host} — prefer URL navigation over typing "
        "when you can fill every {placeholder} in the template from the "
        "user's request or the current page. Do not guess host-internal "
        "IDs, slugs, or codes — fall back to the Search: template or the "
        "on-page search box instead."
    ),
    # Tighter restatement of no-guess: front-loads the rule, drops the
    # softening. Useful for telling whether verbosity or the rule itself
    # is doing the work.
    "terse-no-guess": (
        "abs URL helper for {host}. Use a template only when every "
        "{value} is already known (user intent or this page's DOM). "
        "Never invent IDs / slugs / codes — use Search: or the on-page UI."
    ),
    # Same no-guess rule but front-loads the Search: template as the
    # default URL move, with direct-lookup templates only when fully
    # known. Tests whether emphasising the Search: fallback (vs. just
    # warning off guessing) is the load-bearing piece.
    "search-default": (
        "abs URL helper for {host} — search-by-URL is the default move. "
        "Use the Search: template for any query the user gave you. Use "
        "Direct/{entity}: templates only when every {value} is already "
        "known from intent or this page; never guess IDs, slugs, or codes."
    ),
}


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument(
        "--variant",
        choices=sorted(VARIANTS.keys()),
        help="Replace the canonical preamble with the named variant. "
        "Writes a .preamble-bak alongside each modified file.",
    )
    g.add_argument(
        "--restore",
        action="store_true",
        help="Restore every .preamble-bak back over the modified yaml.",
    )
    g.add_argument(
        "--list",
        action="store_true",
        help="Print the variant catalog and exit.",
    )
    return p.parse_args()


def apply_variant(template: str) -> tuple[int, int]:
    """Rewrite the canonical preamble line to `template` (with {host} filled
    in) across every yaml in SITES_DIR. Returns (changed, total)."""
    changed = 0
    total = 0
    for path in sorted(SITES_DIR.glob("*.yaml")):
        total += 1
        text = path.read_text(encoding="utf-8")
        match = CANONICAL.search(text)
        if match is None:
            continue
        host = match.group(1).strip()
        # Don't use str.format — variant templates legitimately contain
        # `{placeholder}` and `{value}` tokens we want to ship verbatim.
        new_line = template.replace("{host}", host)
        # Lambda (instead of passing `new_line` directly) so backrefs like
        # `\1` in the variant text aren't expanded by re.sub.
        new_text = CANONICAL.sub(lambda _match: new_line, text, count=1)
        if new_text == text:
            continue
        bak = path.with_suffix(path.suffix + BAK_SUFFIX)
        if not bak.exists():
            bak.write_text(text, encoding="utf-8")
        path.write_text(new_text, encoding="utf-8")
        changed += 1
    return changed, total


def restore() -> int:
    restored = 0
    for bak in sorted(SITES_DIR.glob(f"*.yaml{BAK_SUFFIX}")):
        target = bak.with_suffix("")  # strip .preamble-bak → leaves .yaml
        target.write_text(bak.read_text(encoding="utf-8"), encoding="utf-8")
        bak.unlink()
        restored += 1
    return restored


def main() -> int:
    args = parse_args()
    if args.list:
        for name, template in VARIANTS.items():
            print(f"## {name}\n{template}\n")
        return 0
    if args.restore:
        restored = restore()
        print(f"Restored {restored} yaml file(s) from .preamble-bak.")
        return 0
    template = VARIANTS[args.variant]
    changed, total = apply_variant(template)
    print(
        f"Variant '{args.variant}': rewrote canonical preamble in "
        f"{changed}/{total} yaml file(s). "
        f"Run `bun run build-site-data` (or `compare_scenarios.py`, which "
        f"rebuilds automatically) to pick up the change."
    )
    if changed == 0:
        print(
            "WARNING: no files changed. Either already-applied or canonical "
            "line is missing.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
