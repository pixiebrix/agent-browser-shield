#!/usr/bin/env -S uv run --script
# Copyright (c) 2026 PixieBrix, Inc.
# Licensed under PolyForm Shield 1.0.0 — see LICENSE.

# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "httpx>=0.27",
# ]
# ///
"""Fetch JustDeleteMe sites.json and emit a TypeScript snapshot.

Output: extension/src/rules/justdeleteme.generated.ts (committed).

JustDeleteMe (https://justdelete.me/) is an MIT-licensed crowdsourced
directory of account-deletion difficulty grades. We vendor the snapshot so
builds stay deterministic and offline-capable. Re-run periodically to
refresh:

    uv run scripts/fetch_justdeleteme.py

We filter to entries graded `hard` or `impossible` — `easy` and `medium`
grades aren't roach motels.

Attribution: Robb Lewis & various contributors
(https://github.com/justdeleteme/justdelete.me), MIT License. Full license
text shipped alongside the snapshot at
`extension/data/vendored/justdeleteme-LICENSE.md`.

Output is consumed by `extension/src/rules/roach-motel-flag.ts` as a
fallback after the hand-curated YAMLs under `extension/data/sites/*.yaml`.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from urllib.parse import urlparse

import httpx

SOURCE_URL = "https://raw.githubusercontent.com/justdeleteme/justdelete.me/master/sites.json"

# The grades we keep. `easy` and `medium` aren't roach motels — easy means
# a one-click delete button, medium means a confirmation step or two.
KEPT_DIFFICULTIES = ("hard", "impossible")

OUTPUT_PATH = (
    Path(__file__).resolve().parent.parent
    / "extension"
    / "src"
    / "rules"
    / "justdeleteme.generated.ts"
)


def extract_hostnames(entry: dict) -> list[str]:
    """Return the canonical hostname(s) for a JDM entry.

    Prefers the explicit `domains` array (used by the JDM Chrome extension);
    falls back to the hostname of the `url` field. Strips a leading `www.`
    so the runtime lookup can normalize the same way.
    """
    raw_hosts: list[str] = []
    domains = entry.get("domains")
    if isinstance(domains, list):
        raw_hosts.extend(str(d).strip() for d in domains if d)
    if not raw_hosts:
        url = entry.get("url")
        if isinstance(url, str):
            parsed = urlparse(url)
            if parsed.hostname:
                raw_hosts.append(parsed.hostname)

    normalized: list[str] = []
    seen: set[str] = set()
    for host in raw_hosts:
        host = host.lower().strip()
        if not host:
            continue
        if host.startswith("www."):
            host = host[4:]
        # Skip plainly invalid entries — hostnames must contain a dot and
        # have no whitespace.
        if "." not in host or any(c.isspace() for c in host):
            continue
        if host in seen:
            continue
        seen.add(host)
        normalized.append(host)
    return normalized


def to_entry(raw: dict) -> dict | None:
    difficulty = raw.get("difficulty")
    if difficulty not in KEPT_DIFFICULTIES:
        return None
    hostnames = extract_hostnames(raw)
    if not hostnames:
        return None
    name = raw.get("name")
    if not isinstance(name, str) or not name.strip():
        return None
    # Use the English `notes` only — JDM also ships notes_fr, notes_es, etc.
    # which we drop to keep the agent-facing message in one language.
    notes = raw.get("notes")
    if not isinstance(notes, str) or not notes.strip():
        notes = None
    url = raw.get("url") if isinstance(raw.get("url"), str) else None
    return {
        "name": name.strip(),
        "hostnames": hostnames,
        "difficulty": difficulty,
        "cancellationUrl": url,
        "notes": notes.strip() if notes else None,
    }


def emit(entries: list[dict]) -> str:
    header = [
        "// AUTO-GENERATED — DO NOT EDIT BY HAND.",
        f"// Source: {SOURCE_URL}",
        "// Refresh with: uv run scripts/fetch_justdeleteme.py",
        "//",
        "// Vendored snapshot of JustDeleteMe (https://justdelete.me/).",
        "// Copyright (c) 2013 Robb Lewis & various contributors. MIT License.",
        "// Full license text: extension/data/vendored/justdeleteme-LICENSE.md",
        "//",
        "// Filtered to entries graded `hard` or `impossible`. Consumed by",
        "// `extension/src/rules/roach-motel-flag.ts` as a fallback after the",
        "// hand-curated YAMLs under `extension/data/sites/*.yaml`.",
        "",
        'export type JustDeleteMeDifficulty = "hard" | "impossible";',
        "",
        "export interface JustDeleteMeEntry {",
        "  name: string;",
        "  // Canonical base hostnames (no `www.` prefix). The runtime",
        "  // normalizes the location.hostname the same way before lookup.",
        "  hostnames: readonly string[];",
        "  difficulty: JustDeleteMeDifficulty;",
        "  cancellationUrl: string | null;",
        "  notes: string | null;",
        "}",
        "",
        "export const JUSTDELETEME_ENTRIES: readonly JustDeleteMeEntry[] = [",
    ]
    body: list[str] = []
    # Sort by primary hostname for stable diffs across refreshes.
    for entry in sorted(entries, key=lambda e: e["hostnames"][0]):
        body.append("  {")
        body.append(f"    name: {json.dumps(entry['name'])},")
        hosts_inline = ", ".join(json.dumps(h) for h in entry["hostnames"])
        body.append(f"    hostnames: [{hosts_inline}],")
        body.append(f"    difficulty: {json.dumps(entry['difficulty'])},")
        body.append(f"    cancellationUrl: {json.dumps(entry['cancellationUrl'])},")
        body.append(f"    notes: {json.dumps(entry['notes'])},")
        body.append("  },")
    footer = ["];", ""]
    return "\n".join(header + body + footer)


def main() -> int:
    print(f"fetching {SOURCE_URL}", file=sys.stderr)
    response = httpx.get(SOURCE_URL, timeout=30.0, follow_redirects=True)
    response.raise_for_status()
    data = json.loads(response.text)
    if not isinstance(data, list):
        raise SystemExit(
            f"unexpected sites.json shape: top level is {type(data).__name__}, expected list"
        )
    entries: list[dict] = []
    for raw in data:
        if not isinstance(raw, dict):
            continue
        normalized = to_entry(raw)
        if normalized is not None:
            entries.append(normalized)
    output = emit(entries)
    OUTPUT_PATH.write_text(output, encoding="utf-8")
    by_difficulty: dict[str, int] = {}
    for entry in entries:
        by_difficulty[entry["difficulty"]] = by_difficulty.get(entry["difficulty"], 0) + 1
    print(
        f"wrote {OUTPUT_PATH.relative_to(Path.cwd())} "
        f"({len(entries):,} entries: {by_difficulty}, {len(output):,} bytes)",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
