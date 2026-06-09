/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/"}
 */
// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Tests for the page-world `installDumpTraceBridge` source. Mirrors the
// production install path: `dump-trace-bridge.ts` calls
// `installDumpTraceBridge.call(globalThis)` in MAIN world; jsdom's
// single-world model means installing into the test world exercises the
// same code path.
//
// The isolated-world half is not in play here — these tests stub the
// response side directly by posting a `direction: "response"` message
// from the same window, simulating what `dump-trace-content-bridge.ts`
// would do after a background round-trip.

import { installDumpTraceBridge } from "../dump-trace-bridge-source";

interface BridgeWindow extends Window {
  __abs_dumpTrace?: () => Promise<unknown>;
  __abs_dump_trace_installed?: boolean;
}

function getBridgeWindow(): BridgeWindow {
  return globalThis as unknown as BridgeWindow;
}

// jsdom's `window.postMessage` sets `event.source` to null and
// `event.origin` to "" — both of which the bridge's response listener
// rejects. Dispatch a MessageEvent directly with the fields the bridge
// expects so the simulated response reaches the page-side resolver.
function dispatchResponse(data: unknown): void {
  const event = new MessageEvent("message", {
    data,
    source: globalThis,
    origin: globalThis.location.origin,
  });
  globalThis.dispatchEvent(event);
}

// The bridge is install-once per window (production: each MAIN-world
// document gets one install). The flag persists across tests, so the
// `bridgeWindow.addEventListener("message", ...)` registered inside
// the installer is registered exactly once for the whole file —
// matching what a real page sees. Tests share the same
// `window.__abs_dumpTrace` reference; the request-id counter keeps
// counting up across cases, which is fine because each test asserts
// only against ids it observed during its own calls.
beforeAll(() => {
  installDumpTraceBridge.call(getBridgeWindow());
});

describe("installDumpTraceBridge", () => {
  it("exposes window.__abs_dumpTrace as an async function", () => {
    const dumpTrace = getBridgeWindow().__abs_dumpTrace;
    expect(typeof dumpTrace).toBe("function");
  });

  it("posts a request and resolves when a matching response arrives", async () => {
    const dumpTrace = getBridgeWindow().__abs_dumpTrace;

    const requestIds: string[] = [];
    const interceptor = (event: MessageEvent): void => {
      const data = event.data as {
        source?: unknown;
        direction?: unknown;
        id?: unknown;
      };
      if (data.source === "abs-dump-trace" && data.direction === "request") {
        requestIds.push(data.id as string);
        dispatchResponse({
          source: "abs-dump-trace",
          direction: "response",
          id: data.id,
          entries: [
            {
              tabId: 1,
              frameId: 0,
              addedAt: 9,
              entry: { type: "navigation", url: null, timestamp: 1 },
            },
          ],
        });
      }
    };
    window.addEventListener("message", interceptor);

    const entries = await (dumpTrace as () => Promise<unknown>)();

    expect(requestIds).toHaveLength(1);
    expect(entries).toEqual([
      {
        tabId: 1,
        frameId: 0,
        addedAt: 9,
        entry: { type: "navigation", url: null, timestamp: 1 },
      },
    ]);
    window.removeEventListener("message", interceptor);
  });

  it("rejects with an Error when the response carries an error field", async () => {
    const dumpTrace = getBridgeWindow().__abs_dumpTrace;

    const interceptor = (event: MessageEvent): void => {
      const data = event.data as {
        source?: unknown;
        direction?: unknown;
        id?: unknown;
      };
      if (data.source === "abs-dump-trace" && data.direction === "request") {
        dispatchResponse({
          source: "abs-dump-trace",
          direction: "response",
          id: data.id,
          error: "boom",
        });
      }
    };
    window.addEventListener("message", interceptor);

    await expect((dumpTrace as () => Promise<unknown>)()).rejects.toThrow(
      "boom",
    );
    window.removeEventListener("message", interceptor);
  });

  it("rejects when no response arrives before the timeout", async () => {
    jest.useFakeTimers();
    try {
      const dumpTrace = getBridgeWindow().__abs_dumpTrace;

      const promise = (dumpTrace as () => Promise<unknown>)();
      // Suppress unhandled-rejection warnings while we advance timers —
      // the rejection isn't observed until the `await expect()` below.
      promise.catch(() => {
        // noop
      });
      jest.advanceTimersByTime(11_000);
      await expect(promise).rejects.toThrow(/timed out/);
    } finally {
      jest.useRealTimers();
    }
  });

  it("is a no-op when called a second time on the same window", () => {
    const first = getBridgeWindow().__abs_dumpTrace;
    installDumpTraceBridge.call(getBridgeWindow());
    const second = getBridgeWindow().__abs_dumpTrace;

    expect(second).toBe(first);
  });

  it("assigns a unique id to each request", async () => {
    const dumpTrace = getBridgeWindow().__abs_dumpTrace;

    const seen: string[] = [];
    const interceptor = (event: MessageEvent): void => {
      const data = event.data as {
        source?: unknown;
        direction?: unknown;
        id?: unknown;
      };
      if (data.source === "abs-dump-trace" && data.direction === "request") {
        const id = data.id as string;
        seen.push(id);
        dispatchResponse({
          source: "abs-dump-trace",
          direction: "response",
          id,
          entries: [],
        });
      }
    };
    window.addEventListener("message", interceptor);

    await Promise.all([
      (dumpTrace as () => Promise<unknown>)(),
      (dumpTrace as () => Promise<unknown>)(),
      (dumpTrace as () => Promise<unknown>)(),
    ]);

    // Three calls → three distinct ids. The interceptor may also catch
    // a stray request queued by an earlier test (jsdom's postMessage
    // uses setTimeout, and the fake-timer test above can leak one
    // queued dispatch into this case); filter the snapshot to ids that
    // appear at least once, then confirm cardinality and uniqueness.
    expect(seen.length).toBeGreaterThanOrEqual(3);
    expect(new Set(seen).size).toBe(seen.length);
    window.removeEventListener("message", interceptor);
  });
});

describe("dump-trace bridge protocol parity", () => {
  it("uses the same source/direction literals as the isolated-world bridge", () => {
    // The isolated-world half hard-codes "abs-dump-trace" and
    // "request"/"response" as constants in `dump-trace-content-bridge.ts`.
    // The MAIN-world source mirrors them inline (no module imports
    // cross the world boundary). This test asserts the literals agree
    // so a future rename doesn't silently break the bridge.
    const dumpTrace = getBridgeWindow().__abs_dumpTrace;

    let observed: { source?: unknown; direction?: unknown } | undefined;
    const interceptor = (event: MessageEvent): void => {
      const data = event.data as { source?: unknown; direction?: unknown };
      if (data.source && data.direction === "request") {
        observed = data;
      }
    };
    window.addEventListener("message", interceptor);

    void (dumpTrace as () => Promise<unknown>)().catch(() => {
      // we don't resolve the request — the promise dangles until GC,
      // which is fine for a literal-equality check.
    });

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(observed?.source).toBe("abs-dump-trace");
        expect(observed?.direction).toBe("request");
        window.removeEventListener("message", interceptor);
        resolve();
      }, 0);
    });
  });
});
