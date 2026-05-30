# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""Download the BU Bench V1 encrypted task blob from the upstream repo.

Browser Use's BU Bench V1 ships its 100 tasks as a Fernet-encrypted blob to
discourage LLM-training contamination of the benchmark. We do not redistribute
the blob from this repository — fetch it on demand to `benchmark/BU_Bench_V1.enc`.

Usage:
    uv run scripts/fetch_bu_bench.py
    uv run scripts/fetch_bu_bench.py --force   # re-download even if present
"""

from __future__ import annotations

import argparse
import sys
import urllib.request
from pathlib import Path

UPSTREAM_URL = "https://raw.githubusercontent.com/browser-use/benchmark/main/BU_Bench_V1.enc"
TARGET = Path(__file__).resolve().parent.parent / "benchmark" / "BU_Bench_V1.enc"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-download even if the file already exists.",
    )
    parser.add_argument(
        "--url",
        default=UPSTREAM_URL,
        help=f"Source URL (default: {UPSTREAM_URL}).",
    )
    args = parser.parse_args()

    if TARGET.exists() and not args.force:
        print(f"{TARGET.relative_to(Path.cwd())} already exists; pass --force to re-download.")
        return 0

    TARGET.parent.mkdir(parents=True, exist_ok=True)
    print(f"Fetching {args.url} → {TARGET.relative_to(Path.cwd())}")
    try:
        with urllib.request.urlopen(args.url) as response:
            data = response.read()
    except OSError as exc:
        print(f"error: download failed: {exc}", file=sys.stderr)
        return 1

    TARGET.write_bytes(data)
    print(f"Wrote {len(data):,} bytes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
