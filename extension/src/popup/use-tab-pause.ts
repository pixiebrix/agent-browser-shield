// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Popup-side view of the active tab's recovery pause (ADR-0019). The popup runs
// at the extension origin, so unlike content scripts it can read the `session`
// area directly: `tabPauseMap.get` for the initial value, `onChanged` for live
// updates from the background or another popup. A 1s tick drives the snooze
// countdown and flips `active` to false the moment a timed pause expires while
// the popup is open.

import { useEffect, useState } from "react";
import type { TabPause } from "../lib/tab-pause";
import { isPauseActive, tabPauseMap } from "../lib/tab-pause";

const TICK_INTERVAL_MS = 1000;

export interface TabPauseState {
  // The active pause, or null when none is active (absent or expired).
  pause: TabPause | null;
  active: boolean;
  // Milliseconds left on a timed snooze; null for a pause with no time limit
  // ("page" reveal or "Pause for this tab"). Always null when not active.
  remainingMs: number | null;
}

export function useTabPause(tabId: number | null): TabPauseState {
  const [pause, setPause] = useState<TabPause | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (tabId === null) {
      setPause(null);
      return;
    }
    const key = String(tabId);
    let cancelled = false;
    void tabPauseMap.get(key).then((value) => {
      if (!cancelled) {
        setPause(value ?? null);
      }
    });
    const controller = new AbortController();
    // webext-storage types the change value as non-undefined, but it IS
    // undefined when the entry was removed (resume / nav-clear / tab close).
    // A wider param type is contravariantly assignable — no cast needed.
    tabPauseMap.onChanged((changedKey, value: TabPause | undefined) => {
      if (changedKey === key) {
        setPause(value ?? null);
      }
    }, controller.signal);
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [tabId]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setNow(Date.now());
    }, TICK_INTERVAL_MS);
    return () => {
      clearInterval(intervalId);
    };
  }, []);

  const active = isPauseActive(pause, now);
  const remainingMs =
    active && pause?.expiresAt != null
      ? Math.max(0, pause.expiresAt - now)
      : null;
  return { pause: active ? pause : null, active, remainingMs };
}
