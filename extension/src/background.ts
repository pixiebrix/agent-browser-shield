// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import type {
  DetectionKind,
  DetectionPayload,
  GetTabDetectionsRequest,
  GetTabDetectionsResponse,
  RuleDetectionMessage,
} from "./lib/detection-messages";
import { subscribeEnforcementEnabled } from "./lib/enforcement";
import { startClassifyPortListener } from "./lib/llm-background";
import { log } from "./lib/log";
import { ruleStatesStorage } from "./lib/storage";
import { startWebdriverProbeRegistration } from "./lib/webdriver-probe-registration";
import { installProbe } from "./lib/webdriver-probe-source";

// Per-tab, per-frame placeholder counts. Each content script reports its own
// frame's tally; the badge shows the sum across frames for that tab.
const tabCounts = new Map<number, Map<number, number>>();

// Per-tab record of rule detections surfaced to the popup. One entry per
// kind per tab — both contributing rules are topFrameOnly and self-dedupe
// per document, so a single payload per kind is the natural shape. Held in
// memory, cleared on top-level navigation and tab close, same posture as
// `tabCounts`. A service-worker restart drops it; the popup briefly shows
// "Nothing flagged" on a page that did have detections until the next
// re-apply. Promote to chrome.storage.session if that becomes a problem.
const tabDetections = new Map<number, Map<DetectionKind, DetectionPayload>>();

// Maps each detection kind to the rule id that produces it. Used to clear
// stale entries when a user toggles the rule off mid-session.
const DETECTION_KIND_TO_RULE_ID = {
  "roach-motel": "roach-motel-annotate",
  "webdriver-probe": "webdriver-probe-annotate",
} as const satisfies Record<DetectionKind, string>;

// Pleasant blue — clearly an extension affordance, not a warning/error.
const BADGE_COLOR_DEFAULT = "#2563eb";
// Amber — tab has a roach-motel / webdriver-probe detection worth seeing
// in the popup. Matches the .enforcement--off palette in popup.html so the
// "something to look at" signal is visually consistent across surfaces.
const BADGE_COLOR_DETECTION = "#f59e0b";

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

function hasDetections(tabId: number): boolean {
  return (tabDetections.get(tabId)?.size ?? 0) > 0;
}

function refreshBadge(tabId: number): void {
  const placeholderText = formatBadge(totalForTab(tabId));
  const detection = hasDetections(tabId);
  // Detection without a placeholder count gets a single "!" so the badge
  // still shows up. Otherwise keep the existing count text — the color
  // change alone signals "open the popup."
  const text = placeholderText || (detection ? "!" : "");
  chrome.action.setBadgeText({ tabId, text }).catch(() => {
    // noop
  });
  if (text) {
    const color = detection ? BADGE_COLOR_DETECTION : BADGE_COLOR_DEFAULT;
    chrome.action.setBadgeBackgroundColor({ tabId, color }).catch(() => {
      // noop
    });
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
  tabCounts.delete(tabId);
  tabDetections.delete(tabId);
  refreshBadge(tabId);
}

function clearDetectionsOfKind(kind: DetectionKind): void {
  for (const [tabId, entry] of tabDetections) {
    if (entry.delete(kind)) {
      if (entry.size === 0) {
        tabDetections.delete(tabId);
      }
      refreshBadge(tabId);
    }
  }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  tabCounts.delete(tabId);
  tabDetections.delete(tabId);
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
  // Snapshot the union of tabs we're tracking before clearing — the badge
  // for each needs to refresh, and we don't want to iterate a map we're
  // mutating.
  const affected = new Set<number>([
    ...tabCounts.keys(),
    ...tabDetections.keys(),
  ]);
  tabCounts.clear();
  tabDetections.clear();
  for (const tabId of affected) {
    refreshBadge(tabId);
  }
});

// When a user disables one of the detection-producing rules mid-session,
// drop the now-stale entries from every tab so the popup matches the
// current rule selection. Detections for the other (still-enabled) rule
// stay put. Seed `previousRuleStates` from storage before subscribing —
// `subscribe` only fires on changes, never with the current value, so
// without a seed the first off-transition would compare against `null`
// and skip the clear. We can't use top-level await here (the bundler
// emits IIFE for the service worker), so chain `.get().then(...)`.
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
      clearDetectionsOfKind(kind);
    }
  }
});
// eslint-disable-next-line unicorn/prefer-top-level-await -- IIFE bundle, no TLA
void ruleStatesStorage.get().then((initial) => {
  previousRuleStates ??= { ...initial };
});

chrome.runtime.onMessage.addListener(
  (rawMessage: unknown, sender, sendResponse) => {
    if (!rawMessage || typeof rawMessage !== "object") {
      return undefined;
    }
    const message = rawMessage as { type?: unknown; count?: unknown };

    if (message.type === "open-options") {
      chrome.runtime.openOptionsPage(() => {
        sendResponse({ ok: true });
      });
      return true;
    }

    if (message.type === "inject-webdriver-probe") {
      const tabId = sender.tab?.id;
      if (typeof tabId !== "number") {
        return undefined;
      }
      const frameId = sender.frameId;
      // executeScript with world: "MAIN" is exempt from page CSP the same
      // way the registered content script is, so this lands on strict
      // `script-src` origins where the rule's previous inline-<script>
      // fallback was blocked. Targeting the sender's specific frameId
      // keeps subframes that already received the registered probe from
      // being re-invoked. installProbe's `__abs_webdriver_probe_installed`
      // guard makes a redundant call a no-op in the page world.
      chrome.scripting
        .executeScript({
          target: {
            tabId,
            frameIds: typeof frameId === "number" ? [frameId] : undefined,
          },
          world: "MAIN",
          func: installProbe,
        })
        .catch((error: unknown) => {
          // Restricted URLs (chrome://, Web Store, view-source:, file: when
          // disallowed) reject here. The primary registration silently
          // skips these origins via match-pattern filtering; the fallback
          // has to swallow the rejection explicitly.
          log("inject-webdriver-probe executeScript failed", { error });
        });
      return undefined;
    }

    if (message.type === "placeholder-count") {
      const tabId = sender.tab?.id;
      const frameId = sender.frameId;
      const raw = message.count;
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

    if (message.type === "rule-detection") {
      const tabId = sender.tab?.id;
      if (typeof tabId === "number") {
        recordDetection(tabId, (message as RuleDetectionMessage).payload);
      }
      return undefined;
    }

    if (message.type === "get-tab-detections") {
      const request = message as unknown as GetTabDetectionsRequest;
      const entry =
        typeof request.tabId === "number"
          ? tabDetections.get(request.tabId)
          : undefined;
      const response: GetTabDetectionsResponse = {
        detections: entry ? [...entry.values()] : [],
      };
      sendResponse(response);
      return undefined;
    }

    return undefined;
  },
);

// Classify requests use a long-lived port instead of sendMessage so the
// content-side abort can propagate to the background's fetch. See
// `lib/llm-background.ts` for the per-port AbortController wiring.
startClassifyPortListener();

// Register/unregister the page-world `navigator.webdriver` probe as a
// `world: "MAIN"`, `runAt: "document_start"` content script whenever the
// `webdriver-probe-annotate` rule's effective state changes. Lets the
// probe catch reads during the page's initial parse, which the rule's
// content-script-side inline fallback can't reach. See
// `lib/webdriver-probe-registration.ts`.
startWebdriverProbeRegistration();
