// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Opt-in dev-mode structured trace of rule application. When the user
// flips the "Debug trace" toggle in the popup, the engine records each
// placeholder/hide mutation with the matched selector, the rule id, and
// the outerHTML before/after the swap so a false-positive report can be
// reproduced offline.
//
// The toggle gates emission at the source: when off, `recordRuleApplication`
// and `recordSegment` are no-ops that do not even compute `outerHTML`
// (which is the heavy part on a busy page). The chrome.runtime.sendMessage
// transport is fire-and-forget — the background may be asleep, in which
// case the rejection is swallowed exactly like the rule-count reporter
// does for the same reason.
//
// The segment counter ticks once per `recordSegment` call and is stamped
// on every rule-application event so the background can group events by
// segment without round-tripping back to the content script. A fresh
// content script starts at segment 0 (representing "initial-load" which
// `segment-tracker.ts` records explicitly at startup).

import { createChromeStorageValue } from "./chrome-storage-value";
import type {
  DebugTraceEntry,
  DebugTraceEventMessage,
  RuleApplicationKind,
  SegmentKind,
} from "./detection-messages";

export const DEBUG_TRACE_ENABLED_DEFAULT = false;

// Storage key intentionally matches the existing prefix; popup reads via
// `useChromeStorageValue` and content script reads via a cached subscribe
// (see `enabled` below).
export const debugTraceStorage = createChromeStorageValue<boolean>({
  key: "agent-browser-shield.debug-trace-enabled",
  defaultValue: DEBUG_TRACE_ENABLED_DEFAULT,
});

let enabled = DEBUG_TRACE_ENABLED_DEFAULT;
let segmentCounter = 0;
let storageSubscribed = false;

// Lazy first-use init: pay the storage round-trip once when something
// tries to emit, not on module import. Avoids forcing every test that
// imports a rule module to mock chrome.storage.
function ensureSubscribed(): void {
  if (storageSubscribed) {
    return;
  }
  storageSubscribed = true;
  void debugTraceStorage.get().then((value) => {
    enabled = value;
  });
  debugTraceStorage.subscribe((next) => {
    enabled = next;
    if (!next) {
      // Reset the counter when the user turns the toggle off so a later
      // re-enable starts a fresh trace rather than appending to a stale
      // segment id space. The background buffer is keyed by tabId, not
      // segment id, so this only affects how the next session is grouped.
      segmentCounter = 0;
    }
  });
}

function send(entry: DebugTraceEntry): void {
  const message: DebugTraceEventMessage = {
    type: "debug-trace-event",
    entry,
  };
  // Service worker may be asleep or not yet ready — swallow the rejection
  // exactly like `rule-count.ts:128`.
  chrome.runtime.sendMessage(message).catch(() => {
    // noop
  });
}

export function isDebugTraceEnabled(): boolean {
  ensureSubscribed();
  return enabled;
}

// Emit a segment marker. Bumps the segment counter so subsequent rule
// applications are attributed to the new segment. Returns the new id
// so callers can also bookkeep against it locally.
export function recordSegment(
  kind: SegmentKind,
  meta: Record<string, string | number> = {},
): number {
  ensureSubscribed();
  if (!enabled) {
    return segmentCounter;
  }
  segmentCounter += 1;
  send({
    type: "segment",
    segmentId: segmentCounter,
    kind,
    timestamp: Date.now(),
    meta,
  });
  return segmentCounter;
}

export interface RuleApplicationInput {
  // string rather than `RuleId` — see the note on `RuleApplicationEvent`
  // in detection-messages.ts.
  ruleId: string;
  kind: RuleApplicationKind;
  selector: string;
  beforeHtml: string;
  afterHtml: string;
  beforeText?: string;
}

// Emit a rule-application event. Callers compute outerHTML themselves
// only after this returns true via `isDebugTraceEnabled()` — see the
// guard pattern in `placeholder.ts` / `selector-hide-rule.ts` so the
// heavy serialization is skipped when the toggle is off.
export function recordRuleApplication(input: RuleApplicationInput): void {
  ensureSubscribed();
  if (!enabled) {
    return;
  }
  send({
    type: "rule-application",
    segmentId: segmentCounter,
    ruleId: input.ruleId,
    kind: input.kind,
    timestamp: Date.now(),
    selector: input.selector,
    beforeHtml: input.beforeHtml,
    afterHtml: input.afterHtml,
    ...(input.beforeText === undefined ? {} : { beforeText: input.beforeText }),
  });
}

// Test-only: reset module state between cases. The subscribe install
// would otherwise carry the storage listener across tests.
export function __resetDebugTraceForTesting(): void {
  enabled = DEBUG_TRACE_ENABLED_DEFAULT;
  segmentCounter = 0;
  storageSubscribed = false;
}

// Test-only: bypass storage and force enabled on/off synchronously so
// tests don't have to flush microtasks before exercising the recorder.
export function __setDebugTraceEnabledForTesting(value: boolean): void {
  enabled = value;
  storageSubscribed = true;
}
