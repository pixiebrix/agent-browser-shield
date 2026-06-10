// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Toolbar badge + icon painting for the background worker. The decision logic
// — whether a tab is protected and why — lives in `toolbar-protection.ts`;
// this module is purely the `chrome.action` side effects, isolated here so
// `tab-tracker.ts` reads as state management rather than a wall of
// fire-and-forget chrome calls. Every call swallows rejection: restricted tabs
// (chrome://, Web Store) and tabs that close mid-flight reject, and none of it
// should surface.

import type { ProtectionState } from "../toolbar-protection";
import {
  ACTION_ICON_OFF,
  ACTION_ICON_ON,
  actionTitle,
  PROTECTION_OFF_BADGE_COLOR,
  PROTECTION_OFF_BADGE_TEXT,
} from "../toolbar-protection";

// Pleasant blue — clearly an extension affordance, not a warning/error.
export const BADGE_COLOR_DEFAULT = "#2563eb";
// Amber — tab has a roach-motel / webdriver-probe detection worth seeing in
// the popup. Matches the .enforcement--off palette in popup.html so the
// "something to look at" signal is visually consistent across surfaces.
export const BADGE_COLOR_DETECTION = "#f59e0b";

// Badge text for a cross-frame rule-count total. Empty string clears the
// badge; counts past 999 collapse to "999+" so the text stays legible.
export function formatBadge(total: number): string {
  if (total <= 0) {
    return "";
  }
  if (total > 999) {
    return "999+";
  }
  return String(total);
}

// Paint the explicit "off" badge. Rules don't run (denylisted) or were
// revealed (global off) on this tab, so a count would be misleading — the
// "off" badge keeps a clean protected page and an unprotected page from ever
// looking identical, which is the whole reason this signal exists.
export function paintProtectionOffBadge(tabId: number): void {
  chrome.action
    .setBadgeText({ tabId, text: PROTECTION_OFF_BADGE_TEXT })
    .catch(() => {
      // noop
    });
  chrome.action
    .setBadgeBackgroundColor({ tabId, color: PROTECTION_OFF_BADGE_COLOR })
    .catch(() => {
      // noop
    });
}

// Paint the activity/detection badge. Empty `text` clears it; a non-empty text
// picks the amber detection color when `detection` is set, else blue — the
// color change alone signals "open the popup."
export function paintCountBadge(
  tabId: number,
  text: string,
  detection: boolean,
): void {
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

// Swap the toolbar icon + tooltip to match the tab's protection state. The
// greyed icon is the primary "you're unprotected here" signal; the badge
// reinforces it. The caller (`tab-tracker`) memoizes by
// `protectionAppearanceKey` so this only fires when the on/off state flips —
// reissuing setIcon on every rule-count message would be needless churn.
export function paintProtectionAppearance(
  tabId: number,
  state: ProtectionState,
): void {
  chrome.action
    .setIcon({ tabId, path: state.off ? ACTION_ICON_OFF : ACTION_ICON_ON })
    .catch(() => {
      // Restricted tabs (chrome://, Web Store) reject setIcon — swallow it.
    });
  chrome.action.setTitle({ tabId, title: actionTitle(state) }).catch(() => {
    // noop
  });
}
