// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Tab-scoped, non-persistent enforcement pause — the "this page looks broken"
// recovery path (ADR-0019, spec 0010 §"Recovery controls"). Two flavors, both
// distinct from the per-site denylist (ADR-0018), which is permanent and the
// thing a daily driver never gets around to cleaning up:
//
//   - "Reveal everything on this page" (scope "page") — the zero-decision
//     panic button. Reveals every hidden element now and stops re-hiding for
//     the current page load. Cleared on the tab's next top-frame navigation.
//   - Time-boxed snooze (scope "tab") — "Pause for this tab" / "15 min" /
//     "1 hour". Survives navigation within the tab so a multi-page flow (a
//     checkout) stays unblocked, until `expiresAt` or tab close.
//
// Stored in `chrome.storage.session` keyed by tabId via webext-storage's
// `StorageItemMap`: durable across MV3 service-worker restarts and auto-cleared
// on browser restart — exactly the ephemerality we want, with none of the
// denylist's persistent cleanup debt. The popup and background read/write this
// directly; content scripts can't read the `session` area (and don't know their
// own tabId), so the background bridges changes to them by message.

import { StorageItemMap } from "webext-storage";

export const TAB_PAUSE_STORAGE_KEY = "agent-browser-shield.tab-pause";

export interface TabPause {
  // "page" clears on the next top-frame navigation; "tab" survives navigation
  // within the tab until `expiresAt` or the tab closes.
  scope: "page" | "tab";
  // Epoch ms after which the pause is no longer active. `null` = no time limit
  // (a "page" reveal that lasts the page load, or a "tab" pause that lasts
  // until the tab closes).
  expiresAt: number | null;
}

// The two timed-snooze presets, in ms.
export const SNOOZE_15_MIN_MS = 15 * 60 * 1000;
export const SNOOZE_1_HOUR_MS = 60 * 60 * 1000;

// Secondary key is the tabId as a string. The raw storage key webext-storage
// writes is `${TAB_PAUSE_STORAGE_KEY}:::${tabId}`.
export const tabPauseMap = new StorageItemMap<TabPause>(TAB_PAUSE_STORAGE_KEY, {
  area: "session",
});

// True iff the pause exists and hasn't timed out. `now` is injected rather than
// read internally so the content script, the popup countdown, and the
// background all evaluate against one clock and the function stays trivially
// unit-testable. A malformed record (missing/!number `expiresAt`) resolves to
// not-active — fail-open to "protected", the safe default.
export function isPauseActive(
  pause: TabPause | null | undefined,
  now: number,
): boolean {
  if (!pause) {
    return false;
  }
  if (pause.expiresAt === null) {
    return true;
  }
  return typeof pause.expiresAt === "number" && pause.expiresAt > now;
}
