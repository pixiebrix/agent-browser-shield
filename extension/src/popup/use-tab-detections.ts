// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { useEffect, useState } from "react";
import type {
  DetectionPayload,
  GetTabRuleCountsRequest,
  GetTabRuleCountsResponse,
  RuleCountEntry,
} from "../lib/detection-messages";

export interface TabActivity {
  entries: RuleCountEntry[];
  detections: DetectionPayload[];
}

// One-shot fetch on popup mount. Returns `null` while the active-tab
// lookup + runtime message is in flight so each section can hold off on
// rendering its empty state until we actually know the page is quiet.
// Popups are short-lived — no subscription path needed; the next open
// re-runs this.
export function useTabActivity(): TabActivity | null {
  const [activity, setActivity] = useState<TabActivity | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetchActivity()
      .then((next) => {
        if (!cancelled) {
          setActivity(next);
        }
      })
      .catch(() => {
        // Service worker may be asleep / restarting — surface the empty
        // state rather than hanging on `null`.
        if (!cancelled) {
          setActivity({ entries: [], detections: [] });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return activity;
}

async function fetchActivity(): Promise<TabActivity> {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (typeof tab?.id !== "number") {
    return { entries: [], detections: [] };
  }
  const request: GetTabRuleCountsRequest = {
    type: "get-tab-rule-counts",
    tabId: tab.id,
  };
  const response = await chrome.runtime.sendMessage<
    GetTabRuleCountsRequest,
    GetTabRuleCountsResponse | undefined
  >(request);
  return {
    entries: response?.entries ?? [],
    detections: response?.detections ?? [],
  };
}
