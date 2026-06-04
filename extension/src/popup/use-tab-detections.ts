// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { useEffect, useState } from "react";
import type {
  DetectionPayload,
  GetTabDetectionsRequest,
  GetTabDetectionsResponse,
} from "../lib/detection-messages";

// One-shot fetch on popup mount. Returns `null` while the active-tab
// lookup + runtime message is in flight so the section can hold off on
// rendering its empty state until we actually know there are no
// detections. Popups are short-lived — no subscription path needed; the
// next open re-runs this.
export function useTabDetections(): DetectionPayload[] | null {
  const [detections, setDetections] = useState<DetectionPayload[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetchDetections()
      .then((next) => {
        if (!cancelled) {
          setDetections(next);
        }
      })
      .catch(() => {
        // Service worker may be asleep / restarting — surface the empty
        // state rather than hanging on `null`.
        if (!cancelled) {
          setDetections([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return detections;
}

async function fetchDetections(): Promise<DetectionPayload[]> {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (typeof tab?.id !== "number") {
    return [];
  }
  const request: GetTabDetectionsRequest = {
    type: "get-tab-detections",
    tabId: tab.id,
  };
  // @types/chrome infers the response type from `sendMessage`'s second
  // generic. Defend with optional chaining for the SW-restart edge where
  // the response could come back undefined.
  const response = await chrome.runtime.sendMessage<
    GetTabDetectionsRequest,
    GetTabDetectionsResponse | undefined
  >(request);
  return response?.detections ?? [];
}
