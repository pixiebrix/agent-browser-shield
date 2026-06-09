// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { startCheckoutCheckboxDefenseRegistration } from "./lib/checkout-checkbox-defense-registration";
import { installCheckoutCheckboxDefense } from "./lib/checkout-checkbox-defense-source";
import { debugTraceStorage } from "./lib/debug-trace";
import {
  appendEvent as appendDebugTraceEvent,
  clearTab as clearDebugTraceTab,
} from "./lib/debug-trace-store";
import type {
  DebugTraceEntry,
  DebugTraceEventMessage,
  DetectionKind,
  DetectionPayload,
  GetTabDetectionsRequest,
  GetTabDetectionsResponse,
  GetTabRuleCountsRequest,
  GetTabRuleCountsResponse,
  RuleCountEntry,
  RuleDetectionMessage,
} from "./lib/detection-messages";
import { subscribeEnforcementEnabled } from "./lib/enforcement";
import { startClassifyPortListener } from "./lib/llm-background";
import { log } from "./lib/log";
import { startShadowRootProbeRegistration } from "./lib/shadow-root-probe-registration";
import { installShadowRootProbe } from "./lib/shadow-root-probe-source";
import { ruleStatesStorage } from "./lib/storage";
import { startWebdriverProbeRegistration } from "./lib/webdriver-probe-registration";
import { installProbe } from "./lib/webdriver-probe-source";
import type { RuleId } from "./rules/rule-metadata";
import { RULE_IDS } from "./rules/rule-metadata";

// Per-tab, per-frame, per-rule footprint counts. Each content script reports
// its own frame's tally grouped by rule id; the badge shows the cross-frame
// sum across all rules, and the popup renders per-rule entries derived from
// the same map.
type RuleCountMap = Partial<Record<RuleId, number>>;
const tabRuleCounts = new Map<number, Map<number, RuleCountMap>>();
const KNOWN_RULE_IDS = new Set<string>(RULE_IDS);

// Per-tab record of rule detections surfaced to the popup. One entry per
// kind per tab — both contributing rules are topFrameOnly and self-dedupe
// per document, so a single payload per kind is the natural shape. Held in
// memory, cleared on top-level navigation and tab close, same posture as
// `tabRuleCounts`. A service-worker restart drops it; the popup briefly
// shows "Nothing flagged" on a page that did have detections until the
// next re-apply. Promote to chrome.storage.session if that becomes a
// problem.
const tabDetections = new Map<number, Map<DetectionKind, DetectionPayload>>();

// Maps each detection kind to the rule id that produces it. Used to clear
// stale entries when a user toggles the rule off mid-session.
const DETECTION_KIND_TO_RULE_ID = {
  "roach-motel": "roach-motel-annotate",
  "webdriver-probe": "webdriver-probe-annotate",
  "closed-shadow-root": "closed-shadow-root-annotate",
} as const satisfies Record<DetectionKind, string>;

// Pleasant blue — clearly an extension affordance, not a warning/error.
const BADGE_COLOR_DEFAULT = "#2563eb";
// Amber — tab has a roach-motel / webdriver-probe detection worth seeing
// in the popup. Matches the .enforcement--off palette in popup.html so the
// "something to look at" signal is visually consistent across surfaces.
const BADGE_COLOR_DETECTION = "#f59e0b";

// Cross-frame sum per rule for a tab. Frames may overlap on rule ids when
// the same rule fires in multiple frames (subframes, shadow trees) — we
// add their contributions. Returned object only contains rules with a
// non-zero footprint.
function summedCountsForTab(tabId: number): RuleCountMap {
  const frames = tabRuleCounts.get(tabId);
  const summed: RuleCountMap = {};
  if (!frames) {
    return summed;
  }
  for (const frameCounts of frames.values()) {
    for (const [ruleId, count] of Object.entries(frameCounts) as [
      RuleId,
      number,
    ][]) {
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
    if (entry.delete(kind)) {
      if (entry.size === 0) {
        tabDetections.delete(tabId);
      }
      refreshBadge(tabId);
    }
  }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  tabRuleCounts.delete(tabId);
  tabDetections.delete(tabId);
  // Fire-and-forget — IDB write may outlive the listener context.
  void clearDebugTraceTab(tabId).catch(() => {
    // noop
  });
});

// On a top-level navigation, drop stale per-frame counts so the new document
// starts from zero. The content script will report fresh numbers as rules run.
// The debug trace is *not* cleared — instead a `navigation` entry is appended
// so a single export can span multiple page loads in the same tab. Gated on
// the same toggle that gates content-script emission so the trace stays empty
// when the toggle is off.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "loading") {
    return;
  }
  clearTab(tabId);
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
    ...tabRuleCounts.keys(),
    ...tabDetections.keys(),
  ]);
  tabRuleCounts.clear();
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
    const message = rawMessage as {
      type?: unknown;
      counts?: unknown;
    };

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
          log.error("inject-webdriver-probe executeScript failed", { error });
        });
      return undefined;
    }

    if (message.type === "inject-checkout-checkbox-defense") {
      const tabId = sender.tab?.id;
      if (typeof tabId !== "number") {
        return undefined;
      }
      const frameId = sender.frameId;
      // Same shape as inject-webdriver-probe: the registered content
      // script covers future navigations; this fallback runs the defense
      // on the tab the user was already viewing when they toggled the
      // rule on. installCheckoutCheckboxDefense's
      // `__abs_checkout_checkbox_defense_installed` guard makes a
      // redundant call a no-op in the page world.
      chrome.scripting
        .executeScript({
          target: {
            tabId,
            frameIds: typeof frameId === "number" ? [frameId] : undefined,
          },
          world: "MAIN",
          func: installCheckoutCheckboxDefense,
        })
        .catch((error: unknown) => {
          log.error("inject-checkout-checkbox-defense executeScript failed", {
            error,
          });
        });
      return undefined;
    }

    if (message.type === "inject-shadow-root-probe") {
      const tabId = sender.tab?.id;
      if (typeof tabId !== "number") {
        return undefined;
      }
      const frameId = sender.frameId;
      // Same shape as the other main-world fallbacks: the registered
      // content script covers future navigations; this round-trip wraps
      // attachShadow / setHTMLUnsafe on the tab the user was already
      // viewing when they toggled `closed-shadow-root-annotate` on.
      // installShadowRootProbe's `__abs_shadow_root_probe_installed`
      // guard makes a redundant call a no-op in the page world.
      chrome.scripting
        .executeScript({
          target: {
            tabId,
            frameIds: typeof frameId === "number" ? [frameId] : undefined,
          },
          world: "MAIN",
          func: installShadowRootProbe,
        })
        .catch((error: unknown) => {
          log.error("inject-shadow-root-probe executeScript failed", { error });
        });
      return undefined;
    }

    if (message.type === "rule-count") {
      const tabId = sender.tab?.id;
      const frameId = sender.frameId;
      const raw = message.counts;
      if (
        typeof tabId === "number" &&
        typeof frameId === "number" &&
        typeof raw === "object" &&
        raw !== null
      ) {
        // Sanitize: drop unknown rule ids and non-positive counts so a
        // misbehaving content script can't poison the popup or badge.
        const sanitized: RuleCountMap = {};
        for (const [key, value] of Object.entries(
          raw as Record<string, unknown>,
        )) {
          if (
            KNOWN_RULE_IDS.has(key) &&
            typeof value === "number" &&
            Number.isFinite(value) &&
            value > 0
          ) {
            sanitized[key as RuleId] = Math.floor(value);
          }
        }
        recordFrameRuleCounts(tabId, frameId, sanitized);
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

    if (message.type === "get-tab-rule-counts") {
      const request = message as unknown as GetTabRuleCountsRequest;
      const response: GetTabRuleCountsResponse =
        typeof request.tabId === "number"
          ? buildRuleCountsResponse(request.tabId)
          : { entries: [], detections: [] };
      sendResponse(response);
      return undefined;
    }

    if (message.type === "debug-trace-event") {
      const tabId = sender.tab?.id;
      const frameId = sender.frameId;
      // `entry` is typed as `unknown` rather than `DebugTraceEntry` so the
      // runtime guards below are actually type-meaningful — a malformed
      // sendMessage payload could carry `entry: null` (typeof null is
      // "object") or omit it entirely, and the cast on the message
      // envelope wouldn't catch either.
      const entry: unknown = (message as unknown as DebugTraceEventMessage)
        .entry;
      if (
        typeof tabId === "number" &&
        typeof frameId === "number" &&
        typeof entry === "object" &&
        entry !== null
      ) {
        // Fire-and-forget — IDB writes are async, but the message handler
        // shouldn't block on disk. Pruning happens inside `appendEvent`.
        void appendDebugTraceEvent(
          tabId,
          frameId,
          entry as DebugTraceEntry,
        ).catch((error: unknown) => {
          log.error("debug-trace IDB write failed", { error });
        });
      }
      return undefined;
    }

    return undefined;
  },
);

// Build the combined per-rule + detection snapshot the popup renders.
// Entries are sorted by count desc, breaking ties by rule id for a stable
// render across reopens. Detection-producing rules contribute the rich
// payload to `detections` and (when their landmark-stamped node carries a
// RULE_ATTR/HIDDEN_ATTR) also surface in `entries` via the per-frame
// reporter — the popup is free to render them in both surfaces, since the
// "Heads up" cards convey site-level context the bare count can't.
function buildRuleCountsResponse(tabId: number): GetTabRuleCountsResponse {
  const summed = summedCountsForTab(tabId);
  const entries: RuleCountEntry[] = [];
  for (const [ruleId, count] of Object.entries(summed) as [RuleId, number][]) {
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
  const detections = detectionEntries ? [...detectionEntries.values()] : [];
  return { entries, detections };
}

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

// Same lifecycle for `checkout-checkbox-sanitize`'s page-world
// `HTMLInputElement.prototype.checked` defense. The patch must live in
// the page world to intercept React/Vue reconciles that drive
// `node.checked = true` through the page's own prototype copy. See
// `lib/checkout-checkbox-defense-registration.ts`.
startCheckoutCheckboxDefenseRegistration();

// Same lifecycle for `closed-shadow-root-annotate`'s page-world
// shadow-root probe. Wraps `Element.prototype.attachShadow` and
// `setHTMLUnsafe` in the page world so attachments issued by page
// scripts (which hit the page's own prototype copies, not the
// isolated-world ones the rule engine sees) emit the events the
// isolated-world consumers in `lib/shadow-roots.ts` and
// `rules/closed-shadow-root-annotate.ts` rely on. See
// `lib/shadow-root-probe-registration.ts`.
startShadowRootProbeRegistration();
