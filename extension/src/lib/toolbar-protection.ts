// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Pure inputs → toolbar-appearance logic for the "am I protected here?"
// signal (spec 0010 FR-2a). The background worker owns the chrome.action
// side effects; everything decision-shaped lives here so it's unit-testable
// without a chrome mock.
//
// A tab is "off" when the global enforcement kill-switch is off (every tab)
// or when the active tab's top-frame URL matches the per-site denylist
// (ADR-0018) — the same `globalEnforcement && !matchesDenylist(url)` rule
// the content-side `effective-enforcement.ts` computes, recomputed here so
// the toolbar can reflect it without a round-trip to the page.

import { matchesDenylist } from "./site-denylist";

export type ProtectionState =
  | { readonly off: false }
  | { readonly off: true; readonly reason: "global" | "site" };

// `tabUrl` is null when the background hasn't yet learned the tab's URL
// (e.g. a tab open before the service worker started, before the first
// tabs.get / onUpdated). Treat unknown as protected — fail open, matching
// the rule engine, rather than flashing an "off" badge on a tab whose state
// we can't actually determine.
export function computeProtectionState(input: {
  enforcementEnabled: boolean;
  tabUrl: string | null;
  denylist: readonly string[];
}): ProtectionState {
  if (!input.enforcementEnabled) {
    return { off: true, reason: "global" };
  }
  if (input.tabUrl !== null && matchesDenylist(input.tabUrl, input.denylist)) {
    return { off: true, reason: "site" };
  }
  return { off: false };
}

// Toolbar action icon variants, as chrome.action.setIcon expects them
// (paths relative to the extension root). The "on" set is the manifest
// default_icon (blue shield); the "off" set is the desaturated grey shield
// rendered from icons/icon-off.svg by scripts/build-icons.ts.
export const ACTION_ICON_ON: Record<number, string> = {
  16: "icons/icon-16.png",
  24: "icons/icon-24.png",
  32: "icons/icon-32.png",
};

export const ACTION_ICON_OFF: Record<number, string> = {
  16: "icons/icon-off-16.png",
  24: "icons/icon-off-24.png",
  32: "icons/icon-off-32.png",
};

// Neutral slate for the "off" badge — deliberately NOT the amber detection
// color (`#f59e0b`) so the three badge meanings stay distinct: blue = an
// activity count, amber = a detection worth opening the popup for, grey =
// the shield is inactive on this tab. Grey also pairs with the greyed-out
// icon variant; "disabled" reads as desaturated, not as a warning.
export const PROTECTION_OFF_BADGE_TEXT = "off";
export const PROTECTION_OFF_BADGE_COLOR = "#6b7280";

// Toolbar tooltip. Differentiates global vs per-site so hovering the action
// answers *why* the shield is off without opening the popup.
export function actionTitle(state: ProtectionState): string {
  if (!state.off) {
    return "Agent Browser Shield";
  }
  return state.reason === "global"
    ? "Agent Browser Shield — enforcement off (all tabs)"
    : "Agent Browser Shield — enforcement off on this site";
}

// Stable key for the icon/title appearance so the background only issues
// setIcon/setTitle when the on/off state actually flips — the numeric count
// badge still refreshes on every rule-count message.
export function protectionAppearanceKey(state: ProtectionState): string {
  return state.off ? `off:${state.reason}` : "on";
}
