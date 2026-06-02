#!/usr/bin/env -S uv run --script
# Copyright (c) 2026 PixieBrix, Inc.
# Licensed under PolyForm Shield 1.0.0 — see LICENSE.

# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "fastapi>=0.110.0",
#     "httpx>=0.27.0",
#     "python-dotenv>=1.0.0",
#     "uvicorn>=0.27.0",
# ]
# ///
"""OpenRouter logging proxy (OpenAI-compatible wire format).

Forwards POST /v1/* to https://openrouter.ai/api/v1/* using
`OPENROUTER_API_KEY`, logging each request/response pair to a JSONL file.
The point is to capture the exact messages Browserbase ships to the model —
system prompt, tool definitions, accumulated history, and the rendered
accessibility tree per step — so you can diff what guarded vs. baseline
runs send.

Browserbase's backend (not your laptop) is what calls the LLM, so the proxy
must be reachable from the public internet. Pair this with `cloudflared
tunnel --url http://localhost:8787` (or `ngrok http 8787`) and pass the
tunnel URL to `benchmark_run.py --llm-proxy-url <URL>`.

Streaming responses (text/event-stream) are passed through chunk-by-chunk
while the full body is buffered for logging.

Judge/extractor calls in `scripts/_judge.py` go directly to OpenAI with
`OPENAI_API_KEY` and intentionally bypass this proxy — only the
Browserbase-driven agent traffic is logged here.

Usage:
  uv run scripts/llm_proxy.py                          # default 127.0.0.1:8787
  uv run scripts/llm_proxy.py --port 9000 --out my.jsonl
  cloudflared tunnel --url http://localhost:8787      # in another terminal
  uv run scripts/benchmark_run.py ... --llm-proxy-url https://<tunnel>.trycloudflare.com
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
from pathlib import Path
from typing import Any

import httpx
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse

REPO_ROOT = Path(__file__).resolve().parent.parent
LOG_ROOT = REPO_ROOT / "output" / "llm-proxy"
OPENROUTER_BASE = "https://openrouter.ai/api"

# Headers that must NOT be forwarded — either hop-by-hop, or rewritten below.
_STRIP_REQUEST_HEADERS = {
    "host",
    "content-length",
    "authorization",
    "accept-encoding",
    "connection",
    "transfer-encoding",
}

# Headers from the upstream response that must NOT be forwarded back —
# they describe the upstream's transport, not ours.
_STRIP_RESPONSE_HEADERS = {
    "content-length",
    "content-encoding",
    "transfer-encoding",
    "connection",
}


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help=(
            "Log file path (default: output/llm-proxy/proxy_<UTC-timestamp>.jsonl). "
            "Parent directory is created if missing."
        ),
    )
    parser.add_argument(
        "--upstream",
        default=OPENROUTER_BASE,
        help=f"Override upstream base URL (default: {OPENROUTER_BASE}).",
    )
    return parser.parse_args()


def _default_log_path() -> Path:
    stamp = dt.datetime.now(dt.UTC).strftime("%Y%m%dT%H%M%SZ")
    return LOG_ROOT / f"proxy_{stamp}.jsonl"


def _kept_request_headers(headers: dict[str, str]) -> dict[str, str]:
    return {k: v for k, v in headers.items() if k.lower() not in _STRIP_REQUEST_HEADERS}


def _kept_response_headers(headers: httpx.Headers) -> dict[str, str]:
    return {k: v for k, v in headers.items() if k.lower() not in _STRIP_RESPONSE_HEADERS}


def _try_parse_json(raw: bytes) -> Any:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError):
        try:
            return raw.decode("utf-8", errors="replace")
        except Exception:  # pragma: no cover - defensive
            return None


def build_app(*, log_path: Path, upstream_base: str, upstream_key: str) -> FastAPI:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    client = httpx.AsyncClient(base_url=upstream_base, timeout=600.0)
    app = FastAPI(title="agent-browser-shield LLM proxy")

    def _write_log(record: dict[str, Any]) -> None:
        with log_path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, default=str, ensure_ascii=False) + "\n")
            fh.flush()

    @app.get("/health")
    async def health() -> JSONResponse:
        return JSONResponse({"ok": True, "upstream": upstream_base, "log": str(log_path)})

    @app.api_route("/v1/{path:path}", methods=["POST"])
    async def passthrough(path: str, request: Request) -> Response:
        body = await request.body()
        forwarded_headers = _kept_request_headers(dict(request.headers))
        forwarded_headers["authorization"] = f"Bearer {upstream_key}"

        started_at = dt.datetime.now(dt.UTC).isoformat()
        upstream_req = client.build_request(
            "POST",
            f"/v1/{path}",
            content=body,
            headers=forwarded_headers,
            params=dict(request.query_params),
        )

        # Use stream=True so SSE responses can be forwarded incrementally
        # while we still capture the full body for the log.
        upstream_resp = await client.send(upstream_req, stream=True)
        is_event_stream = upstream_resp.headers.get("content-type", "").startswith(
            "text/event-stream"
        )

        if not is_event_stream:
            raw = await upstream_resp.aread()
            await upstream_resp.aclose()
            ended_at = dt.datetime.now(dt.UTC).isoformat()
            _write_log(
                {
                    "started_at": started_at,
                    "ended_at": ended_at,
                    "endpoint": f"/v1/{path}",
                    "query": dict(request.query_params),
                    "status": upstream_resp.status_code,
                    "request_headers": forwarded_headers,
                    "request": _try_parse_json(body),
                    "response_headers": dict(upstream_resp.headers),
                    "response": _try_parse_json(raw),
                }
            )
            return Response(
                content=raw,
                status_code=upstream_resp.status_code,
                headers=_kept_response_headers(upstream_resp.headers),
                media_type=upstream_resp.headers.get("content-type"),
            )

        # Streaming: buffer chunks for logging, forward to the caller live.
        buffered = bytearray()

        async def iterator():
            try:
                async for chunk in upstream_resp.aiter_raw():
                    buffered.extend(chunk)
                    yield chunk
            finally:
                await upstream_resp.aclose()
                ended_at = dt.datetime.now(dt.UTC).isoformat()
                _write_log(
                    {
                        "started_at": started_at,
                        "ended_at": ended_at,
                        "endpoint": f"/v1/{path}",
                        "query": dict(request.query_params),
                        "status": upstream_resp.status_code,
                        "stream": True,
                        "request_headers": forwarded_headers,
                        "request": _try_parse_json(body),
                        "response_headers": dict(upstream_resp.headers),
                        "response_raw": bytes(buffered).decode("utf-8", errors="replace"),
                    }
                )

        return StreamingResponse(
            iterator(),
            status_code=upstream_resp.status_code,
            headers=_kept_response_headers(upstream_resp.headers),
            media_type=upstream_resp.headers.get("content-type"),
        )

    return app


def main() -> int:
    args = _parse_args()
    load_dotenv()
    upstream_key = os.environ.get("OPENROUTER_API_KEY")
    if not upstream_key:
        sys.exit("OPENROUTER_API_KEY is required (set in env or .env)")

    log_path = args.out or _default_log_path()
    print(f"upstream: {args.upstream}")
    print(f"log: {log_path}")
    print(f"listening on http://{args.host}:{args.port}")
    print(
        "expose with `cloudflared tunnel --url http://"
        f"{args.host}:{args.port}` (or ngrok) and pass the public URL via "
        "`benchmark_run.py --llm-proxy-url ...`"
    )

    app = build_app(log_path=log_path, upstream_base=args.upstream, upstream_key=upstream_key)
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
