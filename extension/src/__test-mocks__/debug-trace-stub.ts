// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Shared setup for tests that exercise the debug-trace recorder, the
// segment tracker, or anything downstream of `recordRuleApplication`.
//
// The recorder now emits via the typed `lib/messenger` wrapper
// `reportDebugTraceEvent` instead of raw `chrome.runtime.sendMessage`. Tests
// that use this stub MUST mock that module so the import below resolves to a
// jest mock:
//
//   jest.mock("../../lib/messenger", () => ({
//     reportDebugTraceEvent: jest.fn(),
//     // ...any other messenger exports the test's code-under-test uses
//   }));
//
// Usage:
//
//   let stub: DebugTraceStub;
//   beforeEach(() => { stub = installDebugTraceStub(); });
//   afterEach(() => { stub.reset(); });

import {
  __resetDebugTraceForTesting,
  __setDebugTraceEnabledForTesting,
} from "../lib/debug-trace";
import type { DebugTraceEntry } from "../lib/detection-messages";
import { reportDebugTraceEvent } from "../lib/messenger";

export interface DebugTraceStub {
  setEnabled: (value: boolean) => void;
  // The mocked `reportDebugTraceEvent` — assert call counts directly.
  events: jest.Mock;
  // Every entry passed to `reportDebugTraceEvent`, in call order.
  sentEntries: () => DebugTraceEntry[];
  reset: () => void;
}

export function installDebugTraceStub(): DebugTraceStub {
  __resetDebugTraceForTesting();
  const events = reportDebugTraceEvent as jest.Mock;
  events.mockClear();
  return {
    setEnabled: __setDebugTraceEnabledForTesting,
    events,
    sentEntries: () =>
      events.mock.calls.map(([entry]) => entry as DebugTraceEntry),
    reset: () => {
      __resetDebugTraceForTesting();
      events.mockClear();
    },
  };
}
