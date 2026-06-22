// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Popup-side hook that surfaces a live count + byte size of the active
// tab's trace. The popup runs at the extension origin so it shares the
// same IDB the background writes to — no message round-trip required.
//
// Polls the lightweight `getTabStats` cursor scan once a second while
// the popup is open: events trickle in as the user keeps the popup open
// during a fresh page interaction, and "show me what's piling up" is the
// main reason a developer leaves the trace toggle on. The cursor walk
// touches each record but doesn't transfer the full `outerHTML` payloads
// — full entries are only fetched on `exportJsonl()`.

import { saveAs } from "file-saver";
import { useCallback, useEffect, useState } from "react";
import { buildJsonl } from "../lib/debug-trace-export";
import {
  clearTab,
  getEventsForTab,
  getTabStats,
} from "../lib/debug-trace-store";

const POLL_INTERVAL_MS = 1000;

export interface TabDebugTrace {
  eventCount: number;
  byteSize: number;
  clear: () => Promise<void>;
  exportJsonl: () => Promise<void>;
}

export function useTabDebugTrace(tabId: number | null): TabDebugTrace {
  const [eventCount, setEventCount] = useState(0);
  const [byteSize, setByteSize] = useState(0);

  useEffect(() => {
    if (tabId === null) {
      setEventCount(0);
      setByteSize(0);
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const stats = await getTabStats(tabId);
        if (!cancelled) {
          setEventCount(stats.eventCount);
          setByteSize(stats.byteSize);
        }
      } catch {
        // Keep the previous values — a transient IDB error during a poll
        // shouldn't blank the readout the developer is watching.
      }
    };
    void poll();
    const intervalId = setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [tabId]);

  const clear = useCallback(async () => {
    if (tabId === null) {
      return;
    }
    await clearTab(tabId);
    setEventCount(0);
    setByteSize(0);
  }, [tabId]);

  // JSONL (one entry per line) instead of a JSON array: lets a developer
  // stream the export through `jq -c`, grep for a rule id, or diff two
  // captures without parsing the whole file. file-saver triggers an
  // anchor-based download from the popup's extension origin — no
  // chrome.downloads permission needed. Per-line shape is the
  // `ExportedTraceRecord` defined by `lib/debug-trace-export.ts`
  // (`DebugTraceEntry` + `tabId` + `frameId`), asserted against
  // `data/debug-trace.schema.json` in `__tests__/debug-trace-export.test.ts`.
  const exportJsonl = useCallback(async () => {
    if (tabId === null) {
      return;
    }
    const stored = await getEventsForTab(tabId);
    const payload = buildJsonl(stored);
    const blob = new Blob([payload], {
      type: "application/x-ndjson;charset=utf-8",
    });
    const now = new Date();
    const timestamp = now
      .toISOString()
      .replaceAll(/[.:]/g, "-")
      .replaceAll("T", "_")
      .slice(0, 19);
    saveAs(blob, `agent-browser-shield-trace-tab${tabId}-${timestamp}.jsonl`);
  }, [tabId]);

  return { eventCount, byteSize, clear, exportJsonl };
}
