// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Startup wiring for the background worker: the `chrome.tabs` lifecycle
// listeners, the storage subscriptions that feed the protection signal, and the
// session-store bridge for the tab-scoped recovery pause (ADR-0019). All per-tab
// state lives in the `TabTracker`; this module translates browser and storage
// events into tracker operations plus the side effects the tracker deliberately
// doesn't own — session-store writes and the content broadcast (content scripts
// can't observe the session area, so the background bridges every change).

import { debugTraceStorage } from "../debug-trace";
import {
  appendEvent as appendDebugTraceEvent,
  clearTab as clearDebugTraceTab,
} from "../debug-trace-store";
import type { DebugTraceEntry, DetectionKind } from "../detection-messages";
import {
  getEnforcementEnabled,
  subscribeEnforcementEnabled,
} from "../enforcement";
import { notifyTabPause } from "../messenger";
import { siteDenylistStorage } from "../site-denylist";
import { ruleStatesStorage } from "../storage";
import type { TabPause } from "../tab-pause";
import { isPauseActive, tabPauseMap } from "../tab-pause";
import type { TabTracker } from "./tab-tracker";

// Maps each detection kind to the rule id that produces it. Used to clear stale
// entries when a user toggles the rule off mid-session.
const DETECTION_KIND_TO_RULE_ID = {
  "roach-motel": "roach-motel-annotate",
  "webdriver-probe": "webdriver-probe-annotate",
  "closed-shadow-root": "closed-shadow-root-annotate",
} as const satisfies Record<DetectionKind, string>;

export function startBackgroundLifecycle(tracker: TabTracker): void {
  chrome.tabs.onRemoved.addListener((tabId) => {
    // The cache delete is immediate; the session-storage remove is
    // fire-and-forget (the value is auto-cleared on browser restart regardless,
    // this just keeps it tidy within the session).
    if (tracker.removeTab(tabId)) {
      void tabPauseMap.remove(String(tabId)).catch(() => {
        // noop
      });
    }
    // Fire-and-forget — IDB write may outlive the listener context.
    void clearDebugTraceTab(tabId).catch(() => {
      // noop
    });
  });

  // On a top-level navigation, drop stale per-frame counts so the new document
  // starts from zero. The content script will report fresh numbers as rules
  // run. The debug trace is *not* cleared — instead a `navigation` entry is
  // appended so a single export can span multiple page loads in the same tab.
  // Gated on the same toggle that gates content-script emission so the trace
  // stays empty when the toggle is off.
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Keep the cached top-frame URL current so the denylist evaluation in
    // refreshBadge sees the right URL — including the new document during a
    // "loading" event, before clearTab repaints below.
    if (typeof tab.url === "string") {
      tracker.setTabUrl(tabId, tab.url);
    }
    if (changeInfo.status !== "loading") {
      // A client-side URL change (SPA pushState / hash) arrives without a fresh
      // "loading" status. The denylist is host-scoped so this rarely flips
      // protection, but re-evaluate so the toolbar stays correct on cross-host
      // in-page navigations.
      if (typeof changeInfo.url === "string") {
        tracker.refreshBadge(tabId);
      }
      return;
    }
    // A top-frame navigation ends a "page"-scoped reveal (the panic button is
    // current-page-only) and reaps any timed "tab" pause that has since
    // expired. Active timed pauses survive so a multi-page flow stays unblocked.
    const pause = tracker.getTabPause(tabId);
    if (
      pause &&
      (pause.scope === "page" || !isPauseActive(pause, Date.now()))
    ) {
      tracker.setTabPause(tabId, undefined);
      void tabPauseMap.remove(String(tabId)).catch(() => {
        // noop
      });
    }
    tracker.clearTab(tabId);
    void (async () => {
      try {
        if (!(await debugTraceStorage.get())) {
          return;
        }
        const entry: DebugTraceEntry = {
          type: "navigation",
          url: tab.url ?? null,
          timestamp: Date.now(),
        };
        // Frame id 0 — top-level navigation is always the main frame.
        await appendDebugTraceEvent(tabId, 0, entry);
      } catch {
        // noop — storage read or IDB write rejection shouldn't surface.
      }
    })();
  });

  // A newly-activated tab may be one we opened before the service worker
  // started (no onUpdated seen) — learn its URL and paint its toolbar state so
  // the icon/badge is right the moment the user looks at it.
  chrome.tabs.onActivated.addListener(({ tabId }) => {
    chrome.tabs
      .get(tabId)
      .then((tab) => {
        if (typeof tab.url === "string") {
          tracker.setTabUrl(tabId, tab.url);
        }
        tracker.refreshBadge(tabId);
      })
      .catch(() => {
        // Tab may have closed between the event and the get — ignore.
      });
  });

  // Re-render every tab's toolbar state when global enforcement is toggled, and
  // when the per-site denylist changes — both are global inputs to the
  // protection signal. The tracker drops now-stale counts on a global-off and
  // repaints every open tab.
  subscribeEnforcementEnabled((enabled) => {
    tracker.setEnforcementEnabled(enabled);
  });
  siteDenylistStorage.subscribe((next) => {
    tracker.setDenylist(next);
  });

  // Seed the protection-signal caches from storage, then paint every open tab.
  // Service-worker IIFE — no top-level await, so chain `.get().then(...)`.
  void getEnforcementEnabled().then((enabled) => {
    tracker.setEnforcementEnabled(enabled);
  });
  void siteDenylistStorage.get().then((next) => {
    tracker.setDenylist(next);
  });

  // The tab-scoped recovery pause (ADR-0019) is the third input to the
  // protection signal — but only the popup and background write it, and content
  // scripts can't observe the session area, so the background bridges every
  // change to the tab's frames. On a popup edit (reveal/pause/snooze, or
  // "Resume now") push the new liveness so a still-open page reveals or
  // re-enforces without a reload; a *timed* expiry produces no write and hence
  // no push, which is what leaves the open page revealed until its next
  // navigation.
  // webext-storage types the change value as non-undefined, but it IS undefined
  // when the entry was removed (resume / nav-clear / tab close). A wider param
  // type is contravariantly assignable — no cast needed.
  tabPauseMap.onChanged((key, value: TabPause | undefined) => {
    const tabId = Number(key);
    if (!Number.isInteger(tabId)) {
      return;
    }
    tracker.setTabPause(tabId, value);
    const paused = isPauseActive(tracker.getTabPause(tabId), Date.now());
    // Broadcast to every frame in the tab. The notifier is fire-and-forget: a
    // tab with no content script (restricted URL) or one that has closed just
    // drops the message.
    notifyTabPause(tabId, paused);
    tracker.refreshBadge(tabId);
  });
  // Hydrate the cache from the session store so a service-worker restart
  // doesn't drop a still-active pause from the toolbar signal. Async generator
  // over the map's entries; tabIds are the secondary keys.
  void (async () => {
    try {
      for await (const [key, value] of tabPauseMap.entries()) {
        const tabId = Number(key);
        if (Number.isInteger(tabId)) {
          tracker.setTabPause(tabId, value);
        }
      }
      tracker.refreshAllTabs();
    } catch {
      // Session storage unreadable at startup — the caches stay empty and the
      // signal fails open to "protected", same posture as the other seeds.
    }
  })();

  // When a user disables one of the detection-producing rules mid-session, drop
  // the now-stale entries from every tab so the popup matches the current rule
  // selection. Detections for the other (still-enabled) rule stay put. Seed
  // `previousRuleStates` from storage before subscribing — `subscribe` only
  // fires on changes, never with the current value, so without a seed the first
  // off-transition would compare against `null` and skip the clear.
  let previousRuleStates: Record<string, boolean> | null = null;
  ruleStatesStorage.subscribe((next) => {
    const previous = previousRuleStates;
    previousRuleStates = { ...next };
    if (previous === null) {
      return;
    }
    for (const [kind, ruleId] of Object.entries(DETECTION_KIND_TO_RULE_ID) as [
      DetectionKind,
      string,
    ][]) {
      if (previous[ruleId] === true && next[ruleId] === false) {
        tracker.clearDetectionsOfKind(kind);
      }
    }
  });
  void ruleStatesStorage.get().then((initial) => {
    previousRuleStates ??= { ...initial };
  });
}
