// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import {
  ACTION_ICON_OFF,
  ACTION_ICON_ON,
  actionTitle,
  computeProtectionState,
  PROTECTION_OFF_BADGE_COLOR,
  PROTECTION_OFF_BADGE_TEXT,
  protectionAppearanceKey,
} from "../toolbar-protection";

const DENYLIST = ["https://denied.test/*"];

describe("computeProtectionState", () => {
  it("is off (global) when enforcement is disabled, regardless of URL", () => {
    expect(
      computeProtectionState({
        enforcementEnabled: false,
        tabUrl: "https://allowed.test/page",
        denylist: DENYLIST,
      }),
    ).toEqual({ off: true, reason: "global" });
  });

  it("global off wins even on a denylisted URL", () => {
    expect(
      computeProtectionState({
        enforcementEnabled: false,
        tabUrl: "https://denied.test/page",
        denylist: DENYLIST,
      }),
    ).toEqual({ off: true, reason: "global" });
  });

  it("is off (site) when enforcement is on but the URL is denylisted", () => {
    expect(
      computeProtectionState({
        enforcementEnabled: true,
        tabUrl: "https://denied.test/checkout",
        denylist: DENYLIST,
      }),
    ).toEqual({ off: true, reason: "site" });
  });

  it("is on when enforcement is on and the URL is not denylisted", () => {
    expect(
      computeProtectionState({
        enforcementEnabled: true,
        tabUrl: "https://allowed.test/page",
        denylist: DENYLIST,
      }),
    ).toEqual({ off: false });
  });

  it("fails open (on) when the tab URL is unknown", () => {
    expect(
      computeProtectionState({
        enforcementEnabled: true,
        tabUrl: null,
        denylist: DENYLIST,
      }),
    ).toEqual({ off: false });
  });

  it("is on when the denylist is empty", () => {
    expect(
      computeProtectionState({
        enforcementEnabled: true,
        tabUrl: "https://anything.test/",
        denylist: [],
      }),
    ).toEqual({ off: false });
  });

  it("is off (paused) when the tab-scoped recovery pause is active", () => {
    expect(
      computeProtectionState({
        enforcementEnabled: true,
        tabUrl: "https://allowed.test/page",
        denylist: DENYLIST,
        paused: true,
      }),
    ).toEqual({ off: true, reason: "paused" });
  });

  it("reports the durable site reason when both denylisted and paused", () => {
    expect(
      computeProtectionState({
        enforcementEnabled: true,
        tabUrl: "https://denied.test/checkout",
        denylist: DENYLIST,
        paused: true,
      }),
    ).toEqual({ off: true, reason: "site" });
  });

  it("treats a missing paused flag as not paused", () => {
    expect(
      computeProtectionState({
        enforcementEnabled: true,
        tabUrl: "https://allowed.test/page",
        denylist: [],
      }),
    ).toEqual({ off: false });
  });
});

describe("actionTitle", () => {
  it("is the plain product name when protected", () => {
    expect(actionTitle({ off: false })).toBe("Agent Browser Shield");
  });

  it("names the global kill-switch when off for all tabs", () => {
    expect(actionTitle({ off: true, reason: "global" })).toContain("all tabs");
  });

  it("names the per-site scope when off on one site", () => {
    expect(actionTitle({ off: true, reason: "site" })).toContain(
      "on this site",
    );
  });

  it("names the tab-scoped pause when protection is paused", () => {
    expect(actionTitle({ off: true, reason: "paused" })).toContain(
      "paused on this tab",
    );
  });
});

describe("protectionAppearanceKey", () => {
  it("collapses the protected state to a single key", () => {
    expect(protectionAppearanceKey({ off: false })).toBe("on");
  });

  it("distinguishes the off reasons so a global→site→paused flip repaints", () => {
    const keys = new Set([
      protectionAppearanceKey({ off: true, reason: "global" }),
      protectionAppearanceKey({ off: true, reason: "site" }),
      protectionAppearanceKey({ off: true, reason: "paused" }),
    ]);
    expect(keys.size).toBe(3);
  });
});

describe("appearance constants", () => {
  it("exposes the toolbar sizes for both icon variants", () => {
    for (const size of [16, 24, 32]) {
      expect(ACTION_ICON_ON[size]).toMatch(/icon-\d+\.png$/);
      expect(ACTION_ICON_OFF[size]).toMatch(/icon-off-\d+\.png$/);
    }
  });

  it("uses a neutral (non-amber) off-badge color", () => {
    expect(PROTECTION_OFF_BADGE_TEXT).toBe("off");
    // Distinct from the amber detection color so the badge meanings don't
    // collide.
    expect(PROTECTION_OFF_BADGE_COLOR).not.toBe("#f59e0b");
  });
});
