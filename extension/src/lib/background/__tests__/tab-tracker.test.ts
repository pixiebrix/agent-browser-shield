// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Focused tests for the per-tab tracker that `background.ts` constructs. These
// cover the cross-frame badge math, the detection badge, and the popup snapshot
// — the behaviors that previously lived inline in the (untestable) service-worker
// entry bundle and that the split into `lib/background/*` had to preserve.

import { BADGE_COLOR_DEFAULT, BADGE_COLOR_DETECTION } from "../badge";
import { createTabTracker } from "../tab-tracker";

const TAB = 1;

// `jest-webextension-mock` stubs chrome.action.* / chrome.tabs.query as
// jest.fn() returning undefined, but production code chains `.then`/`.catch` on
// them (real chrome returns promises). Resolve them so the paint side effects
// don't throw; `refreshAllTabs` queries an empty tab list.
beforeEach(() => {
  (chrome.tabs.query as jest.Mock).mockResolvedValue([]);
  for (const setter of [
    chrome.action.setBadgeText,
    chrome.action.setBadgeBackgroundColor,
    chrome.action.setIcon,
    chrome.action.setTitle,
  ]) {
    (setter as jest.Mock).mockResolvedValue(undefined);
  }
});

// Most-recent value passed for `tabId` to a single-object-arg chrome.action
// setter, reading the typed field off the recorded call.
function lastValueForTab(
  setter: jest.Mock,
  tabId: number,
  field: "text" | "color",
): string | undefined {
  const calls = setter.mock.calls as Array<
    [{ tabId?: number; text?: string; color?: string }]
  >;
  for (let i = calls.length - 1; i >= 0; i--) {
    const details = calls[i]?.[0];
    if (details?.tabId === tabId) {
      return details[field];
    }
  }
  return undefined;
}

function lastBadgeText(tabId: number): string | undefined {
  return lastValueForTab(
    chrome.action.setBadgeText as jest.Mock,
    tabId,
    "text",
  );
}

function lastBadgeColor(tabId: number): string | undefined {
  return lastValueForTab(
    chrome.action.setBadgeBackgroundColor as jest.Mock,
    tabId,
    "color",
  );
}

describe("createTabTracker — badge math", () => {
  it("sums a rule's footprint across frames into the badge total", () => {
    const tracker = createTabTracker();
    tracker.recordFrameRuleCounts(TAB, 0, { "pii-redact": 2 });
    tracker.recordFrameRuleCounts(TAB, 7, {
      "pii-redact": 3,
      "secrets-redact": 1,
    });

    // 2 + 3 + 1 = 6 across both frames and both rules.
    expect(lastBadgeText(TAB)).toBe("6");
    expect(lastBadgeColor(TAB)).toBe(BADGE_COLOR_DEFAULT);
  });

  it("collapses totals past 999 to '999+'", () => {
    const tracker = createTabTracker();
    tracker.recordFrameRuleCounts(TAB, 0, { "pii-redact": 1500 });
    expect(lastBadgeText(TAB)).toBe("999+");
  });

  it("decrements a frame's contribution when it re-reports zero", () => {
    const tracker = createTabTracker();
    tracker.recordFrameRuleCounts(TAB, 0, { "pii-redact": 4 });
    tracker.recordFrameRuleCounts(TAB, 1, { "pii-redact": 5 });
    expect(lastBadgeText(TAB)).toBe("9");

    // Frame 1's document went away (pagehide → empty report).
    tracker.recordFrameRuleCounts(TAB, 1, {});
    expect(lastBadgeText(TAB)).toBe("4");
  });
});

describe("createTabTracker — detections", () => {
  it("shows a '!' detection badge in the detection color when there is no count", () => {
    const tracker = createTabTracker();
    tracker.recordDetection(TAB, {
      kind: "webdriver-probe",
      host: "example.com",
      url: "https://example.com/",
    });

    expect(lastBadgeText(TAB)).toBe("!");
    expect(lastBadgeColor(TAB)).toBe(BADGE_COLOR_DETECTION);
  });

  it("keeps the count text but switches to the detection color when both are present", () => {
    const tracker = createTabTracker();
    tracker.recordFrameRuleCounts(TAB, 0, { "pii-redact": 3 });
    tracker.recordDetection(TAB, {
      kind: "webdriver-probe",
      host: "example.com",
      url: "https://example.com/",
    });

    expect(lastBadgeText(TAB)).toBe("3");
    expect(lastBadgeColor(TAB)).toBe(BADGE_COLOR_DETECTION);
  });

  it("clears only the detections of the toggled-off kind", () => {
    const tracker = createTabTracker();
    tracker.recordDetection(TAB, {
      kind: "webdriver-probe",
      host: "example.com",
      url: "https://example.com/",
    });
    tracker.recordDetection(TAB, {
      kind: "closed-shadow-root",
      host: "example.com",
      url: "https://example.com/",
    });

    tracker.clearDetectionsOfKind("webdriver-probe");

    const { detections } = tracker.buildRuleCountsResponse(TAB);
    expect(detections.map((d) => d.kind)).toEqual(["closed-shadow-root"]);
  });
});

describe("createTabTracker — popup snapshot", () => {
  it("sorts entries by count desc, breaking ties by rule id, and folds in detections", () => {
    const tracker = createTabTracker();
    tracker.recordFrameRuleCounts(TAB, 0, {
      "secrets-redact": 2,
      "pii-redact": 2,
      "comments-redact": 9,
    });
    tracker.recordDetection(TAB, {
      kind: "webdriver-probe",
      host: "example.com",
      url: "https://example.com/",
    });

    const { entries, detections } = tracker.buildRuleCountsResponse(TAB);
    expect(entries).toEqual([
      { ruleId: "comments-redact", count: 9 },
      // tie at 2 → lexicographic by rule id
      { ruleId: "pii-redact", count: 2 },
      { ruleId: "secrets-redact", count: 2 },
    ]);
    expect(detections).toHaveLength(1);
  });

  it("returns an empty snapshot for an untracked tab", () => {
    const tracker = createTabTracker();
    expect(tracker.buildRuleCountsResponse(999)).toEqual({
      entries: [],
      detections: [],
    });
  });
});

describe("createTabTracker — lifecycle", () => {
  it("reports whether a removed tab had a cached recovery pause", () => {
    const tracker = createTabTracker();
    expect(tracker.removeTab(TAB)).toBe(false);

    tracker.setTabPause(TAB, {
      scope: "tab",
      expiresAt: null,
    });
    expect(tracker.removeTab(TAB)).toBe(true);
    // Second removal — cache already cleared.
    expect(tracker.removeTab(TAB)).toBe(false);
  });

  it("drops cached counts and paints the 'off' badge when enforcement goes global-off", () => {
    const tracker = createTabTracker();
    tracker.recordFrameRuleCounts(TAB, 0, { "pii-redact": 5 });
    expect(lastBadgeText(TAB)).toBe("5");

    tracker.setEnforcementEnabled(false);
    // The tracker repaints this tab directly via refreshBadge; the global
    // refreshAllTabs (chrome.tabs.query → []) covers tabs we aren't counting.
    tracker.refreshBadge(TAB);
    expect(lastBadgeText(TAB)).toBe("off");

    // Re-enabling should start from a clean count (the stale 5 was dropped).
    tracker.setEnforcementEnabled(true);
    tracker.refreshBadge(TAB);
    expect(lastBadgeText(TAB)).toBe("");
  });
});
