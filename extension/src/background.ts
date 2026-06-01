// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { subscribeEnforcementEnabled } from "./lib/enforcement";
import { startClassifyPortListener } from "./lib/llm-background";

// Per-tab, per-frame placeholder counts. Each content script reports its own
// frame's tally; the badge shows the sum across frames for that tab.
const tabCounts = new Map<number, Map<number, number>>();

// Pleasant blue — clearly an extension affordance, not a warning/error.
const BADGE_COLOR = "#2563eb";

function totalForTab(tabId: number): number {
  const frames = tabCounts.get(tabId);
  if (!frames) {
    return 0;
  }
  let sum = 0;
  for (const value of frames.values()) {
    sum += value;
  }
  return sum;
}

function formatBadge(total: number): string {
  if (total <= 0) {
    return "";
  }
  if (total > 999) {
    return "999+";
  }
  return String(total);
}

function setBadge(tabId: number, total: number): void {
  const text = formatBadge(total);
  chrome.action.setBadgeText({ tabId, text }).catch(() => {});
  if (text) {
    chrome.action
      .setBadgeBackgroundColor({ tabId, color: BADGE_COLOR })
      .catch(() => {});
  }
}

function recordFrameCount(tabId: number, frameId: number, count: number): void {
  let frames = tabCounts.get(tabId);
  if (!frames) {
    frames = new Map();
    tabCounts.set(tabId, frames);
  }
  if (count <= 0) {
    frames.delete(frameId);
    if (frames.size === 0) {
      tabCounts.delete(tabId);
    }
  } else {
    frames.set(frameId, count);
  }
  setBadge(tabId, totalForTab(tabId));
}

function clearTab(tabId: number): void {
  tabCounts.delete(tabId);
  setBadge(tabId, 0);
}

chrome.tabs.onRemoved.addListener((tabId) => {
  tabCounts.delete(tabId);
});

// On a top-level navigation, drop stale per-frame counts so the new document
// starts from zero. The content script will report fresh numbers as rules run.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    clearTab(tabId);
  }
});

// Re-render every tab's badge when enforcement is toggled. When disabled, the
// rule engine reveals everything in each frame, which will eventually push
// zero counts back — but doing this synchronously keeps the badge from
// looking stale for the duration of those mutation observer cycles.
subscribeEnforcementEnabled((enabled) => {
  if (enabled) {
    return;
  }
  for (const tabId of tabCounts.keys()) {
    clearTab(tabId);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") {
    return undefined;
  }

  if (message.type === "open-options") {
    chrome.runtime.openOptionsPage(() => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === "placeholder-count") {
    const tabId = sender.tab?.id;
    const frameId = sender.frameId;
    const raw = (message as { count?: unknown }).count;
    if (
      typeof tabId === "number" &&
      typeof frameId === "number" &&
      typeof raw === "number" &&
      Number.isFinite(raw)
    ) {
      recordFrameCount(tabId, frameId, Math.max(0, Math.floor(raw)));
    }
    return undefined;
  }

  return undefined;
});

// Classify requests use a long-lived port instead of sendMessage so the
// content-side abort can propagate to the background's fetch. See
// `lib/llm-background.ts` for the per-port AbortController wiring.
startClassifyPortListener();
