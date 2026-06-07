// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Popup-side hook that opens the debug-trace IDB and returns the active
// tab's events. The popup runs at the extension origin so it shares the
// same DB the background writes to — no message round-trip required.
//
// Popups are short-lived; we do a one-shot read on mount. If the user
// wants a fresh snapshot they can reopen the popup or hit the in-section
// refresh button.

import { useCallback, useEffect, useState } from "react";
import { clearTab, getEventsForTab } from "../lib/debug-trace-store";
import type { DebugTraceEntry } from "../lib/detection-messages";

export interface TabDebugTrace {
  entries: DebugTraceEntry[];
  loading: boolean;
  reload: () => void;
  clear: () => Promise<void>;
}

export function useTabDebugTrace(tabId: number | null): TabDebugTrace {
  const [entries, setEntries] = useState<DebugTraceEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (tabId === null) {
      setEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const stored = await getEventsForTab(tabId);
      setEntries(stored.map((record) => record.entry));
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [tabId]);

  useEffect(() => {
    let cancelled = false;
    void load().then(() => {
      if (cancelled) {
        setEntries([]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const reload = useCallback(() => {
    void load();
  }, [load]);

  const clear = useCallback(async () => {
    if (tabId === null) {
      return;
    }
    await clearTab(tabId);
    setEntries([]);
  }, [tabId]);

  return { entries, loading, reload, clear };
}
