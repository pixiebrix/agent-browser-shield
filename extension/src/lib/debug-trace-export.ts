// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Public on-wire shape for the popup's JSONL export and the
// `window.__abs_dumpTrace()` CDP path. Both surfaces serve the same
// schema (`extension/data/debug-trace.schema.json`): the recorded
// `DebugTraceEntry` plus the `tabId` / `frameId` it was captured in.
// The IDB-internal `addedAt` is internal bookkeeping and is not exposed
// — each entry already carries its own `timestamp` stamped at
// content-script emit time, which is the field a consumer correlating
// with page activity wants.

import type {
  DebugTraceEntry,
  DebugTraceStoredEntry,
} from "./detection-messages";

export type ExportedTraceRecord = DebugTraceEntry & {
  tabId: number;
  frameId: number;
};

export function toExportedRecord(
  stored: DebugTraceStoredEntry,
): ExportedTraceRecord {
  return {
    ...stored.entry,
    tabId: stored.tabId,
    frameId: stored.frameId,
  };
}

export function buildJsonl(stored: DebugTraceStoredEntry[]): string {
  return stored
    .map((record) => JSON.stringify(toExportedRecord(record)))
    .join("\n");
}
