// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Page-world (main-world) bridge that exposes `window.__abs_dumpTrace()` —
// an async function CDP-driven harnesses call via
// `Runtime.evaluate("(async () => await window.__abs_dumpTrace())()",
// { awaitPromise: true })` to scrape the current tab's debug-trace
// IndexedDB store mid-flow, without needing the popup's Export button.
//
// IDB lives at the extension origin so the page can't read it directly;
// instead the page posts a `{ source: "abs-dump-trace", direction: "request" }`
// message to its own window, the isolated-world content-script bridge
// (`lib/dump-trace-content-bridge.ts`) forwards a `get-tab-debug-trace`
// runtime message to the background, the background reads IDB via
// `getEventsForTab(sender.tab.id)`, and the response chain echoes the
// stored entries back through the same hops. A per-request id correlates
// the round-trip across the two postMessage boundaries.
//
// Registered only when the debug-trace toggle is on
// (`lib/page-world-hooks.ts`) — `window.__abs_dumpTrace`
// is undefined on every page in builds where the recorder is off, so
// pages don't fingerprint the extension by probing the global.
//
// The function must not reference any module-scope identifiers — only
// the function body's source crosses into the page world via the
// bundled `dump-trace-bridge.js` entry point. The protocol literals
// (`source`, `direction`, request id format) are mirrored as constants
// in the isolated-world bridge; a unit test asserts the two agree.

export function installDumpTraceBridge(this: Window): void {
  const FLAG = "__abs_dump_trace_installed";
  const bridgeWindow = this as Window & Record<string, unknown>;
  if (bridgeWindow[FLAG]) {
    return;
  }
  bridgeWindow[FLAG] = true;

  const SOURCE = "abs-dump-trace";
  const REQUEST_TIMEOUT_MS = 10_000;

  interface PendingRequest {
    resolve: (entries: unknown) => void;
    reject: (error: unknown) => void;
    timer: ReturnType<typeof setTimeout>;
  }
  const pending = new Map<string, PendingRequest>();
  let counter = 0;
  function nextId(): string {
    counter += 1;
    return `abs-${Date.now().toString(36)}-${counter.toString(36)}`;
  }

  bridgeWindow.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== bridgeWindow) {
      return;
    }
    if (event.origin !== bridgeWindow.location.origin) {
      return;
    }
    const data = event.data as {
      source?: unknown;
      direction?: unknown;
      id?: unknown;
      entries?: unknown;
      error?: unknown;
    } | null;
    if (!data || typeof data !== "object") {
      return;
    }
    if (data.source !== SOURCE || data.direction !== "response") {
      return;
    }
    if (typeof data.id !== "string") {
      return;
    }
    const handler = pending.get(data.id);
    if (!handler) {
      return;
    }
    pending.delete(data.id);
    clearTimeout(handler.timer);
    if (typeof data.error === "string") {
      handler.reject(new Error(data.error));
      return;
    }
    handler.resolve(data.entries);
  });

  function dumpTrace(): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = nextId();
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("abs:__abs_dumpTrace timed out"));
      }, REQUEST_TIMEOUT_MS);
      pending.set(id, { resolve, reject, timer });
      try {
        bridgeWindow.postMessage(
          { source: SOURCE, direction: "request", id },
          bridgeWindow.location.origin,
        );
      } catch (error) {
        pending.delete(id);
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  bridgeWindow.__abs_dumpTrace = dumpTrace;
}
