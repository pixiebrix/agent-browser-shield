#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "httpx>=0.27",
#     "python-dotenv>=1.0.0",
# ]
# ///
"""Generate product images for demo-site via OpenRouter (Gemini Flash Image).

Reads OPENROUTER_API_KEY from .env at the repo root. Writes one PNG per
product to demo-site/public/products/<slug>.png. Idempotent: existing files
are skipped unless --force is passed.

Usage:
  uv run scripts/gen_product_images.py
  uv run scripts/gen_product_images.py --force --only headphones,watch
"""

from __future__ import annotations

import argparse
import base64
import subprocess
import sys
import tempfile
from pathlib import Path

import httpx
from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = REPO_ROOT / "demo-site" / "public" / "products"
DEFAULT_MODEL = "google/gemini-2.5-flash-image"
TARGET_PX = 640  # final square edge; matches demo-site display size
JPEG_QUALITY = 82  # ~30-50KB per image on clean white-background photos

STYLE_SUFFIX = (
    "E-commerce product photo on a pure white seamless background. "
    "Centered, sharp focus, soft studio lighting, no text or watermarks, "
    "no human hands, no props, square 1:1 framing. Clean catalog style."
)

PRODUCTS: dict[str, str] = {
    "headphones": (
        "Premium over-ear wireless headphones in matte black with soft "
        "memory-foam earcups and a subtle brushed-metal hinge. Slightly "
        "angled three-quarter view."
    ),
    "coffee": (
        "Compact modern single-serve drip coffee maker in matte black and "
        "brushed stainless. Small water reservoir on the side and a slim "
        "control panel on the front. No coffee pod visible."
    ),
    "skillet": (
        "A heavy 12-inch black cast iron skillet, top-down view, showing "
        "the smooth pre-seasoned cooking surface and the long iron handle."
    ),
    "watch": (
        "A modern round-faced smartwatch with a vivid AMOLED display "
        "showing an abstract dial, on a black silicone sport band. "
        "Three-quarter view."
    ),
    "yogamat": (
        "A rolled-up premium yoga mat in deep teal, with a textured "
        "non-slip surface and a thin elastic strap. Mat is standing on end."
    ),
    "desklamp": (
        "A sleek modern LED desk lamp with a slim white articulated arm "
        "and a thin horizontal lighting bar, lit. Visible round weighted "
        "base."
    ),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Regenerate even if the target file already exists.",
    )
    parser.add_argument(
        "--only",
        type=str,
        default=None,
        help="Comma-separated subset of slugs to generate (e.g. 'headphones,watch').",
    )
    parser.add_argument(
        "--model",
        default=DEFAULT_MODEL,
        help=f"OpenRouter model id (default: {DEFAULT_MODEL}).",
    )
    return parser.parse_args()


def require_key() -> str:
    import os

    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        sys.exit("OPENROUTER_API_KEY not set in environment (.env loaded from repo root)")
    return key


def generate_one(slug: str, prompt: str, model: str, api_key: str) -> bytes:
    """Call OpenRouter and return raw PNG bytes."""
    body = {
        "model": model,
        "modalities": ["image", "text"],
        "messages": [
            {
                "role": "user",
                "content": f"{prompt}\n\n{STYLE_SUFFIX}",
            }
        ],
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/pixiebrix/agent-browser-shield",
        "X-Title": "agent-browser-shield demo-site product images",
    }
    resp = httpx.post(
        "https://openrouter.ai/api/v1/chat/completions",
        json=body,
        headers=headers,
        timeout=120.0,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"{slug}: HTTP {resp.status_code} — {resp.text[:500]}")
    data = resp.json()

    images = data.get("choices", [{}])[0].get("message", {}).get("images")
    if not images:
        raise RuntimeError(f"{slug}: no images in response — full payload: {data}")
    url = images[0].get("image_url", {}).get("url", "")
    prefix = "base64,"
    if prefix not in url:
        raise RuntimeError(f"{slug}: unexpected image_url format: {url[:120]}")
    b64 = url.split(prefix, 1)[1]
    return base64.b64decode(b64)


def compress_to_jpeg(png_bytes: bytes, dest: Path) -> None:
    """Resize to TARGET_PX square edge and write JPEG at JPEG_QUALITY.

    Uses macOS sips (preinstalled) so there's no extra Python image dep.
    On non-Darwin systems this will need a fallback.
    """
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp.write(png_bytes)
        tmp_path = Path(tmp.name)
    try:
        subprocess.run(
            [
                "sips",
                "-s",
                "format",
                "jpeg",
                "-s",
                "formatOptions",
                str(JPEG_QUALITY),
                "-Z",
                str(TARGET_PX),
                str(tmp_path),
                "--out",
                str(dest),
            ],
            check=True,
            capture_output=True,
        )
    finally:
        tmp_path.unlink(missing_ok=True)


def main() -> int:
    load_dotenv(REPO_ROOT / ".env")
    args = parse_args()
    api_key = require_key()

    targets: dict[str, str] = PRODUCTS
    if args.only:
        wanted = {s.strip() for s in args.only.split(",") if s.strip()}
        unknown = wanted - set(PRODUCTS)
        if unknown:
            sys.exit(f"Unknown slug(s) in --only: {sorted(unknown)}")
        targets = {slug: PRODUCTS[slug] for slug in wanted}

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for slug, prompt in targets.items():
        out_path = OUTPUT_DIR / f"{slug}.jpg"
        if out_path.exists() and not args.force:
            print(f"skip {slug} (exists; pass --force to regenerate)")
            continue
        print(f"gen  {slug} via {args.model}…", flush=True)
        png = generate_one(slug, prompt, args.model, api_key)
        compress_to_jpeg(png, out_path)
        print(
            f"  -> {out_path.relative_to(REPO_ROOT)} "
            f"({out_path.stat().st_size:,} bytes, was {len(png):,} PNG)"
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())
