// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Dev-mode trace summary. Visible only when the user has enabled the
// "Debug trace" toggle. Shows a live count + byte size of the trace
// piling up in IDB and exposes the three actions a developer needs:
// Refresh (force-poll), Export (download full payload as JSONL), Clear
// (drop this tab's trace).
//
// The per-event / per-segment render that used to live here was hidden
// because the segment-grouped HTML inspector is more useful in a wider
// surface than the 280px popup. Keeping the summary in the popup means
// the developer can confirm trace capture is working without leaving
// whatever page they're debugging.

import type { TabDebugTrace } from "./use-tab-debug-trace";

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function DebugTraceSection({ trace }: { trace: TabDebugTrace }) {
  const hasEntries = trace.byteSize > 0;
  return (
    <section className="debug-trace">
      <header className="debug-trace__header">
        <h2 className="debug-trace__heading">Debug trace</h2>
        <div className="debug-trace__actions">
          <button
            type="button"
            className="debug-trace__action"
            onClick={trace.reload}
            disabled={trace.loading}
          >
            Refresh
          </button>
          <button
            type="button"
            className="debug-trace__action"
            onClick={() => {
              void trace.exportJsonl();
            }}
            disabled={!hasEntries}
          >
            Export
          </button>
          <button
            type="button"
            className="debug-trace__action"
            onClick={() => {
              void trace.clear();
            }}
            disabled={!hasEntries}
          >
            Clear
          </button>
        </div>
      </header>
      {trace.loading && !hasEntries ? (
        <p className="debug-trace__empty">Loading trace…</p>
      ) : hasEntries ? (
        <p className="debug-trace__meta">
          {trace.eventCount} event{trace.eventCount === 1 ? "" : "s"} captured (
          {formatBytes(trace.byteSize)}).
        </p>
      ) : (
        <p className="debug-trace__empty">
          No trace events for this tab yet. Reload the page with the toggle on
          to capture.
        </p>
      )}
    </section>
  );
}
