// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Shared setup for tests that exercise the debug-trace recorder, the
// segment tracker, or anything downstream of `recordRuleApplication`.
//
// Installs a jest.fn() over `chrome.runtime.sendMessage`, resets the
// recorder module state, and gives callers a typed accessor for the
// captured trace entries. Use in beforeEach:
//
//   let stub: DebugTraceStub;
//   beforeEach(() => { stub = installDebugTraceStub(); });
//   afterEach(() => { stub.reset(); });

import {
  __resetDebugTraceForTesting,
  __setDebugTraceEnabledForTesting,
} from "../lib/debug-trace";
import type {
  DebugTraceEntry,
  DebugTraceEventMessage,
} from "../lib/detection-messages";

export interface DebugTraceStub {
  sendMessage: jest.Mock;
  setEnabled: (value: boolean) => void;
  // Every entry sent via the `debug-trace-event` message, in call order.
  sentEntries: () => DebugTraceEntry[];
  reset: () => void;
}

export function installDebugTraceStub(): DebugTraceStub {
  __resetDebugTraceForTesting();
  const sendMessage = jest.fn().mockResolvedValue(undefined);
  (globalThis as { chrome: unknown }).chrome = {
    runtime: { sendMessage },
  };
  return {
    sendMessage,
    setEnabled: __setDebugTraceEnabledForTesting,
    sentEntries: () =>
      sendMessage.mock.calls
        .map(([message]) => message as { type: string })
        .filter(
          (message): message is DebugTraceEventMessage =>
            message.type === "debug-trace-event",
        )
        .map((message) => message.entry),
    reset: __resetDebugTraceForTesting,
  };
}
