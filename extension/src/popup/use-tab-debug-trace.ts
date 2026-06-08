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
// — full entries are only fetched on `copyJson()`.

import { useCallback, useEffect, useState } from "react";
import {
  clearTab,
  getEventsForTab,
  getTabStats,
} from "../lib/debug-trace-store";

const POLL_INTERVAL_MS = 1000;

export interface TabDebugTrace {
  eventCount: number;
  byteSize: number;
  loading: boolean;
  reload: () => void;
  clear: () => Promise<void>;
  copyJson: () => Promise<void>;
}

export function useTabDebugTrace(tabId: number | null): TabDebugTrace {
  const [eventCount, setEventCount] = useState(0);
  const [byteSize, setByteSize] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (showLoading: boolean) => {
      if (tabId === null) {
        setEventCount(0);
        setByteSize(0);
        setLoading(false);
        return;
      }
      if (showLoading) {
        setLoading(true);
      }
      try {
        const stats = await getTabStats(tabId);
        setEventCount(stats.eventCount);
        setByteSize(stats.byteSize);
      } catch {
        // Keep the previous values — a transient IDB error during a poll
        // shouldn't blank the readout the developer is watching.
      } finally {
        if (showLoading) {
          setLoading(false);
        }
      }
    },
    [tabId],
  );

  useEffect(() => {
    void load(true);
    if (tabId === null) {
      return;
    }
    const intervalId = globalThis.setInterval(() => {
      void load(false);
    }, POLL_INTERVAL_MS);
    return () => {
      globalThis.clearInterval(intervalId);
    };
  }, [tabId, load]);

  const reload = useCallback(() => {
    void load(true);
  }, [load]);

  const clear = useCallback(async () => {
    if (tabId === null) {
      return;
    }
    await clearTab(tabId);
    setEventCount(0);
    setByteSize(0);
  }, [tabId]);

  const copyJson = useCallback(async () => {
    if (tabId === null) {
      return;
    }
    const stored = await getEventsForTab(tabId);
    const payload = JSON.stringify(
      stored.map((record) => record.entry),
      null,
      2,
    );
    await navigator.clipboard.writeText(payload);
  }, [tabId]);

  return { eventCount, byteSize, loading, reload, clear, copyJson };
}
