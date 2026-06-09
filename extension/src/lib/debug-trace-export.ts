// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// JSONL serialization for the popup's "Export" button. Lives in `lib/` so
// the schema-conformance test can validate the output without dragging the
// popup React hook into the test harness.
//
// Each line is the IDB-stored event minus `addedAt` (the background's
// append timestamp is internal bookkeeping; each entry already carries its
// own `timestamp` stamped at content-script emit time). The on-wire shape
// matches `extension/data/debug-trace.schema.json` and the value returned
// by `window.__abs_dumpTrace()`.

import omit from "lodash/omit";
import type { DebugTraceStoredEntry } from "./detection-messages";

export type ExportedTraceRecord = Omit<DebugTraceStoredEntry, "addedAt">;

export function toExportedRecord(
  stored: DebugTraceStoredEntry,
): ExportedTraceRecord {
  return omit(stored, "addedAt");
}

export function buildJsonl(stored: DebugTraceStoredEntry[]): string {
  return stored
    .map((record) => JSON.stringify(toExportedRecord(record)))
    .join("\n");
}
