// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Per-tab in-memory state for the toolbar/popup model, plus the badge refresh
// that reads across it. The background worker's `chrome.tabs` listeners
// (`lifecycle.ts`) and message handlers (`message-handlers.ts`) are thin shells
// over the operations exposed here; keeping the state in one factory leaves
// `background.ts` to wiring and makes this layer unit-testable with a chrome
// mock. All maps are dropped on a service-worker restart — the same fail-open
// posture every cache below assumes.

import type { Entries } from "type-fest";
import type { RuleId } from "../../rules/rule-metadata";
import type {
  DetectionKind,
  DetectionPayload,
  GetTabRuleCountsResponse,
  RuleCountEntry,
} from "../detection-messages";
import type { RuleCountMap } from "../message-schemas";
import type { TabPause } from "../tab-pause";
import { isPauseActive } from "../tab-pause";
import {
  computeProtectionState,
  protectionAppearanceKey,
} from "../toolbar-protection";
import {
  formatBadge,
  paintCountBadge,
  paintProtectionAppearance,
  paintProtectionOffBadge,
} from "./badge";

export interface TabTracker {
  // ── state mutations driven by content messages ──
  recordDetection(tabId: number, payload: DetectionPayload): void;
  recordFrameRuleCounts(
    tabId: number,
    frameId: number,
    counts: RuleCountMap,
  ): void;
  clearTab(tabId: number): void;
  clearDetectionsOfKind(kind: DetectionKind): void;
  buildRuleCountsResponse(tabId: number): GetTabRuleCountsResponse;

  // ── protection-signal inputs (lifecycle owns the storage side) ──
  setTabUrl(tabId: number, url: string): void;
  setEnforcementEnabled(enabled: boolean): void;
  setDenylist(next: readonly string[]): void;
  /**
   * Update the cached recovery-pause liveness for a tab (`undefined` clears
   * it). Pure cache write — the session store and the content broadcast are
   * the lifecycle layer's responsibility, since content scripts can't observe
   * the session area.
   */
  setTabPause(tabId: number, pause: TabPause | undefined): void;
  getTabPause(tabId: number): TabPause | null;

  // ── lifecycle ──
  /**
   * Drop every in-memory trace of a closed tab. Returns whether the tab had a
   * cached recovery pause, so the caller can mirror the removal to the session
   * store. Does not repaint — the tab is gone.
   */
  removeTab(tabId: number): boolean;
  refreshBadge(tabId: number): void;
  refreshAllTabs(): void;
}

export function createTabTracker(): TabTracker {
  // Per-tab, per-frame, per-rule footprint counts. Each content script reports
  // its own frame's tally grouped by rule id; the badge shows the cross-frame
  // sum across all rules, and the popup renders per-rule entries derived from
  // the same map. The reported counts are sanitized against the known rule ids
  // by `ruleCountsSchema` before they reach `recordFrameRuleCounts`.
  const tabRuleCounts = new Map<number, Map<number, RuleCountMap>>();

  // Per-tab record of rule detections surfaced to the popup. One entry per
  // kind per tab — both contributing rules are topFrameOnly and self-dedupe
  // per document, so a single payload per kind is the natural shape. Cleared
  // on top-level navigation and tab close, same posture as `tabRuleCounts`. A
  // service-worker restart drops it; the popup briefly shows "Nothing flagged"
  // on a page that did have detections until the next re-apply. Promote to
  // chrome.storage.session if that becomes a problem.
  const tabDetections = new Map<number, Map<DetectionKind, DetectionPayload>>();

  // Inputs to the per-tab "am I protected here?" signal (spec 0010 FR-2a): the
  // global enforcement kill-switch and the per-site denylist. Seeded from
  // storage at startup by `lifecycle.ts` and kept current by its subscriptions.
  // Defaults match the fail-open posture — assume protection is on until
  // storage resolves so we never flash an "off" badge on a tab that's actually
  // protected.
  let enforcementEnabled = true;
  let denylist: readonly string[] = [];

  // Last top-frame URL seen per tab, so the background can evaluate the
  // denylist for any tab without round-tripping the page. Captured from
  // tabs.onUpdated / onActivated / a startup tabs.query; dropped on tab close.
  const tabUrls = new Map<number, string>();

  // In-memory mirror of the tab-scoped recovery pause map (ADR-0019), so
  // `refreshBadge` stays sync and the content bridge can resolve liveness
  // without an async read. Hydrated from `tabPauseMap` at startup and kept
  // current by its `onChanged` (both in `lifecycle.ts`). The authoritative
  // store is `chrome.storage.session`; same cache posture as the two above.
  const tabPauses = new Map<number, TabPause>();

  // Memo of the icon/title appearance last applied per tab, keyed by
  // `protectionAppearanceKey`, so we only call setIcon/setTitle when the
  // on/off state actually flips. The numeric count badge still refreshes on
  // every rule-count message.
  const tabAppearanceKey = new Map<number, string>();

  // Cross-frame sum per rule for a tab. Frames may overlap on rule ids when
  // the same rule fires in multiple frames (subframes, shadow trees) — we add
  // their contributions. Returned object only contains rules with a non-zero
  // footprint.
  function summedCountsForTab(tabId: number): RuleCountMap {
    const frames = tabRuleCounts.get(tabId);
    const summed: RuleCountMap = {};
    if (!frames) {
      return summed;
    }
    for (const frameCounts of frames.values()) {
      for (const [ruleId, count] of Object.entries(frameCounts) as Entries<
        Required<RuleCountMap>
      >) {
        summed[ruleId] = (summed[ruleId] ?? 0) + count;
      }
    }
    return summed;
  }

  function totalForTab(tabId: number): number {
    let total = 0;
    for (const count of Object.values(summedCountsForTab(tabId))) {
      total += count;
    }
    return total;
  }

  function hasDetections(tabId: number): boolean {
    return (tabDetections.get(tabId)?.size ?? 0) > 0;
  }

  // Swap the toolbar icon + tooltip to match the tab's protection state, but
  // only when it changed — the memo here is what lets `paintProtectionAppearance`
  // stay a pure side effect. Per-tab action settings persist for the tab's
  // lifetime, so each tab the user might look at must be painted at least once
  // (see refreshAllTabs and the tab listeners in `lifecycle.ts`).
  function applyProtectionAppearance(
    tabId: number,
    state: ReturnType<typeof computeProtectionState>,
  ): void {
    const key = protectionAppearanceKey(state);
    if (tabAppearanceKey.get(tabId) === key) {
      return;
    }
    tabAppearanceKey.set(tabId, key);
    paintProtectionAppearance(tabId, state);
  }

  function refreshBadge(tabId: number): void {
    const state = computeProtectionState({
      enforcementEnabled,
      tabUrl: tabUrls.get(tabId) ?? null,
      denylist,
      paused: isPauseActive(tabPauses.get(tabId) ?? null, Date.now()),
    });
    applyProtectionAppearance(tabId, state);
    if (state.off) {
      paintProtectionOffBadge(tabId);
      return;
    }
    const placeholderText = formatBadge(totalForTab(tabId));
    const detection = hasDetections(tabId);
    // Detection without a placeholder count gets a single "!" so the badge
    // still shows up. Otherwise keep the existing count text.
    const text = placeholderText || (detection ? "!" : "");
    paintCountBadge(tabId, text, detection);
  }

  // Re-evaluate every open tab's toolbar appearance. Used when a *global*
  // input to the protection signal changes (enforcement toggle, denylist
  // edit): per-tab icons persist, so every tab the user might switch to has to
  // be repainted, not just the ones we're tracking counts for.
  function refreshAllTabs(): void {
    chrome.tabs
      .query({})
      .then((tabs) => {
        for (const tab of tabs) {
          if (typeof tab.id !== "number") {
            continue;
          }
          if (typeof tab.url === "string") {
            tabUrls.set(tab.id, tab.url);
          }
          refreshBadge(tab.id);
        }
      })
      .catch(() => {
        // noop — tabs.query rejection shouldn't surface.
      });
  }

  function recordFrameRuleCounts(
    tabId: number,
    frameId: number,
    counts: RuleCountMap,
  ): void {
    let frames = tabRuleCounts.get(tabId);
    const hasAnyCount = Object.values(counts).some((value) => value > 0);
    if (!hasAnyCount) {
      if (!frames) {
        refreshBadge(tabId);
        return;
      }
      frames.delete(frameId);
      if (frames.size === 0) {
        tabRuleCounts.delete(tabId);
      }
      refreshBadge(tabId);
      return;
    }
    if (!frames) {
      frames = new Map();
      tabRuleCounts.set(tabId, frames);
    }
    frames.set(frameId, counts);
    refreshBadge(tabId);
  }

  function recordDetection(tabId: number, payload: DetectionPayload): void {
    let entry = tabDetections.get(tabId);
    if (!entry) {
      entry = new Map();
      tabDetections.set(tabId, entry);
    }
    entry.set(payload.kind, payload);
    refreshBadge(tabId);
  }

  function clearTab(tabId: number): void {
    tabRuleCounts.delete(tabId);
    tabDetections.delete(tabId);
    refreshBadge(tabId);
  }

  function clearDetectionsOfKind(kind: DetectionKind): void {
    for (const [tabId, entry] of tabDetections) {
      if (!entry.delete(kind)) {
        continue;
      }

      if (entry.size === 0) {
        tabDetections.delete(tabId);
      }
      refreshBadge(tabId);
    }
  }

  // Build the combined per-rule + detection snapshot the popup renders. Entries
  // are sorted by count desc, breaking ties by rule id for a stable render
  // across reopens. Detection-producing rules contribute the rich payload to
  // `detections` and (when their landmark-stamped node carries a
  // RULE_ATTR/HIDDEN_ATTR) also surface in `entries` via the per-frame reporter
  // — the popup is free to render them in both surfaces, since the "Heads up"
  // cards convey site-level context the bare count can't.
  function buildRuleCountsResponse(tabId: number): GetTabRuleCountsResponse {
    const summed = summedCountsForTab(tabId);
    const entries: RuleCountEntry[] = [];
    for (const [ruleId, count] of Object.entries(summed) as [
      RuleId,
      number,
    ][]) {
      if (count > 0) {
        entries.push({ ruleId, count });
      }
    }
    entries.sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.ruleId.localeCompare(b.ruleId);
    });
    const detectionEntries = tabDetections.get(tabId);
    const detections = detectionEntries
      ? detectionEntries.values().toArray()
      : [];
    return { entries, detections };
  }

  function setTabUrl(tabId: number, url: string): void {
    tabUrls.set(tabId, url);
  }

  // Re-render every tab's toolbar state when global enforcement is toggled.
  // When disabled, the rule engine reveals everything and the cached per-tab
  // counts/detections are immediately stale, so drop them — neither the badge
  // nor the popup should show a number for paused rules. refreshAllTabs then
  // repaints every open tab so the greyed "off" icon reaches tabs we weren't
  // counting. Also used for the startup seed, where the maps are empty and the
  // clear is a harmless no-op.
  function setEnforcementEnabled(enabled: boolean): void {
    enforcementEnabled = enabled;
    if (!enabled) {
      tabRuleCounts.clear();
      tabDetections.clear();
    }
    refreshAllTabs();
  }

  // The per-site denylist is the other input to the protection signal. A
  // denylist edit can flip any open tab between protected and off, so repaint
  // them all. (The content-side rule engine reacts to the same storage change
  // independently; this is purely the toolbar's view of it.)
  function setDenylist(next: readonly string[]): void {
    denylist = next;
    refreshAllTabs();
  }

  function setTabPause(tabId: number, pause: TabPause | undefined): void {
    if (pause === undefined) {
      tabPauses.delete(tabId);
    } else {
      tabPauses.set(tabId, pause);
    }
  }

  function getTabPause(tabId: number): TabPause | null {
    return tabPauses.get(tabId) ?? null;
  }

  function removeTab(tabId: number): boolean {
    tabRuleCounts.delete(tabId);
    tabDetections.delete(tabId);
    tabUrls.delete(tabId);
    tabAppearanceKey.delete(tabId);
    return tabPauses.delete(tabId);
  }

  return {
    recordDetection,
    recordFrameRuleCounts,
    clearTab,
    clearDetectionsOfKind,
    buildRuleCountsResponse,
    setTabUrl,
    setEnforcementEnabled,
    setDenylist,
    setTabPause,
    getTabPause,
    removeTab,
    refreshBadge,
    refreshAllTabs,
  };
}
