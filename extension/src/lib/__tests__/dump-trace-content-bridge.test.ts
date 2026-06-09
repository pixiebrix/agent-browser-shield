/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/"}
 */
// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Tests for the isolated-world content-script half of the
// `window.__abs_dumpTrace` bridge. The listener accepts
// `{ source: "abs-dump-trace", direction: "request", id }` messages
// from the page world, forwards a `get-tab-debug-trace` runtime
// message to the background, and posts the response (or error) back
// keyed by id.
//
// jsdom's single-world model means a message posted with
// `window.postMessage` reaches the bridge's listener the same way a
// page-world script would in production.

import { startDumpTraceContentBridge } from "../dump-trace-content-bridge";

interface ResponseBody {
  source?: unknown;
  direction?: unknown;
  id?: unknown;
  entries?: unknown;
  error?: unknown;
}

function captureResponses(): { responses: ResponseBody[]; stop: () => void } {
  const responses: ResponseBody[] = [];
  const handler = (event: MessageEvent): void => {
    const data = event.data as ResponseBody | null;
    if (!data || typeof data !== "object") {
      return;
    }
    if (data.source !== "abs-dump-trace" || data.direction !== "response") {
      return;
    }
    responses.push(data);
  };
  window.addEventListener("message", handler);
  return {
    responses,
    stop: () => {
      window.removeEventListener("message", handler);
    },
  };
}

// Wait for one tick of the macrotask queue so jsdom's queued postMessage
// dispatches and any pending microtasks settle. A single `setTimeout(0)`
// flush is enough for the request → sendMessage → response chain in
// these tests because each hop only adds microtasks beyond the
// already-queued message event.
function flush(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

// jsdom's `window.postMessage` sets `event.source` to null and
// `event.origin` to "" — both of which the bridge's listener rejects.
// Dispatch a MessageEvent directly with the fields the bridge expects
// so the test exercises the same code path a real same-origin page
// would take. Returns the dispatched event for assertion convenience.
// `MessageEvent.source` is typed as `MessageEventSource` (Window |
// MessagePort | ServiceWorker), but TypeScript's `typeof globalThis`
// doesn't structurally satisfy `Window` — same constraint the bridge
// works around. Cast to a Window-typed alias once.
const eventSource: Window = globalThis as unknown as Window;
function dispatchBridgeMessage(data: unknown): MessageEvent {
  const event = new MessageEvent("message", {
    data,
    source: eventSource,
    origin: eventSource.location.origin,
  });
  eventSource.dispatchEvent(event);
  return event;
}

let sendMessage: jest.Mock;
let stopBridge: () => void;
let stopCapture: () => void;

beforeEach(() => {
  sendMessage = chrome.runtime.sendMessage as unknown as jest.Mock;
  sendMessage.mockReset();
  stopBridge = () => {
    // noop until a test starts the bridge
  };
  stopCapture = () => {
    // noop until a test captures responses
  };
});

afterEach(() => {
  stopBridge();
  stopCapture();
});

describe("startDumpTraceContentBridge", () => {
  it("forwards a valid request to background and echoes entries back to the page", async () => {
    const fakeEntries = [
      {
        tabId: 7,
        frameId: 0,
        addedAt: 123,
        entry: { type: "segment", segmentId: 1, kind: "initial-load" },
      },
    ];
    sendMessage.mockResolvedValueOnce({ entries: fakeEntries });
    stopBridge = startDumpTraceContentBridge();
    const capture = captureResponses();
    stopCapture = capture.stop;
    const { responses } = capture;

    dispatchBridgeMessage({
      source: "abs-dump-trace",
      direction: "request",
      id: "req-1",
    });
    await flush();
    await flush();

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith({ type: "get-tab-debug-trace" });
    expect(responses).toHaveLength(1);
    expect(responses[0]).toMatchObject({
      source: "abs-dump-trace",
      direction: "response",
      id: "req-1",
      entries: fakeEntries,
    });
  });

  it("posts an error response when the background rejects", async () => {
    sendMessage.mockRejectedValueOnce(new Error("nope"));
    stopBridge = startDumpTraceContentBridge();
    const capture = captureResponses();
    stopCapture = capture.stop;
    const { responses } = capture;

    dispatchBridgeMessage({
      source: "abs-dump-trace",
      direction: "request",
      id: "req-err",
    });
    await flush();
    await flush();

    expect(responses).toHaveLength(1);
    expect(responses[0]?.error).toContain("nope");
    expect(responses[0]?.entries).toBeUndefined();
  });

  it("ignores messages with the wrong source literal", async () => {
    stopBridge = startDumpTraceContentBridge();

    dispatchBridgeMessage({
      source: "other-extension",
      direction: "request",
      id: "x",
    });
    await flush();

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("ignores messages with a non-string id", async () => {
    stopBridge = startDumpTraceContentBridge();

    dispatchBridgeMessage({
      source: "abs-dump-trace",
      direction: "request",
      id: 42,
    });
    await flush();

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("ignores response-direction messages so it doesn't echo its own replies", async () => {
    stopBridge = startDumpTraceContentBridge();

    dispatchBridgeMessage({
      source: "abs-dump-trace",
      direction: "response",
      id: "req-1",
      entries: [],
    });
    await flush();

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("ignores messages whose id exceeds the length cap", async () => {
    stopBridge = startDumpTraceContentBridge();

    dispatchBridgeMessage({
      source: "abs-dump-trace",
      direction: "request",
      id: "x".repeat(200),
    });
    await flush();

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("ignores cross-origin messages even with the right source literal", async () => {
    stopBridge = startDumpTraceContentBridge();

    const event = new MessageEvent("message", {
      data: { source: "abs-dump-trace", direction: "request", id: "x" },
      source: eventSource,
      origin: "https://evil.example",
    });
    eventSource.dispatchEvent(event);
    await flush();

    expect(sendMessage).not.toHaveBeenCalled();
  });
});
