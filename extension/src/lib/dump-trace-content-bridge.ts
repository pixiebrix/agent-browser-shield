// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Isolated-world counterpart to `lib/dump-trace-bridge-source.ts`.
// Listens for `{ source: "abs-dump-trace", direction: "request" }`
// postMessages from the page world, forwards a `get-tab-debug-trace`
// runtime message to the background (which reads IDB via
// `getEventsForTab(sender.tab.id)`), and echoes the response back to
// the page world by id.
//
// Always installed — the MAIN-world bridge is what gates exposure of
// `window.__abs_dumpTrace`, so this listener is idle on tabs where
// the user hasn't enabled the recorder (the page can't issue a request
// because the function doesn't exist).
//
// Started from `content.ts` inside the existing `isTopFrame()` block.

import type {
  GetTabDebugTraceRequest,
  GetTabDebugTraceResponse,
} from "./detection-messages";
import { log } from "./log";

// Protocol constants — kept as module-scope literals here. The MAIN-world
// source mirrors them inline (no module imports cross the world
// boundary); a unit test asserts the two agree.
const SOURCE = "abs-dump-trace";
const MAX_REQUEST_ID_LENGTH = 128;

interface BridgeRequest {
  source: typeof SOURCE;
  direction: "request";
  id: string;
}

function isBridgeRequest(value: unknown): value is BridgeRequest {
  if (!value || typeof value !== "object") {
    return false;
  }
  const data = value as { source?: unknown; direction?: unknown; id?: unknown };
  return (
    data.source === SOURCE &&
    data.direction === "request" &&
    typeof data.id === "string" &&
    data.id.length > 0 &&
    data.id.length <= MAX_REQUEST_ID_LENGTH
  );
}

function postResponse(
  id: string,
  body: { entries?: unknown; error?: string },
): void {
  window.postMessage(
    { source: SOURCE, direction: "response", id, ...body },
    globalThis.location.origin,
  );
}

async function forwardRequest(id: string): Promise<void> {
  const request: GetTabDebugTraceRequest = { type: "get-tab-debug-trace" };
  let response: GetTabDebugTraceResponse;
  try {
    response = await chrome.runtime.sendMessage<
      GetTabDebugTraceRequest,
      GetTabDebugTraceResponse
    >(request);
  } catch (error) {
    log.warn("dump-trace bridge: background request failed", { error });
    postResponse(id, { error: String(error) });
    return;
  }
  postResponse(id, { entries: response.entries });
}

function bridgeListener(event: MessageEvent): void {
  if (event.source !== globalThis) {
    return;
  }
  if (event.origin !== globalThis.location.origin) {
    return;
  }
  if (!isBridgeRequest(event.data)) {
    return;
  }
  void forwardRequest(event.data.id);
}

// Returns an unsubscribe handle. Production callers ignore it (the
// bridge lives for the document lifetime), but tests use it in
// `afterEach` so stale listeners don't accumulate across cases.
export function startDumpTraceContentBridge(): () => void {
  window.addEventListener("message", bridgeListener);
  return () => {
    window.removeEventListener("message", bridgeListener);
  };
}
