// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Hide GDPR/CCPA cookie consent banners. These overlays sit on the majority
// of major web pages, consuming 300–800 tokens each, and rarely matter to a
// browser-use agent (which can be configured to accept the default cookie
// policy or operate without persisting consent state across sessions).
//
// Selectors target the known CMP vendor surfaces by stable id/class — these
// are deliberate and low-FP. Generic class-name patterns are guarded by a
// position/role check so we don't accidentally hide the in-flow body of a
// /cookie-policy article where similar class names may appear.

import { createSelectorHideRule } from "../lib/selector-hide-rule";

const OVERLAY_POSITIONS = new Set(["fixed", "sticky", "absolute"]);
const OVERLAY_ROLES = new Set(["dialog", "alertdialog"]);

function isOverlay(element: HTMLElement): boolean {
  const role = element.getAttribute("role");
  if (role && OVERLAY_ROLES.has(role)) {
    return true;
  }
  const position = globalThis.getComputedStyle(element).position;
  return OVERLAY_POSITIONS.has(position);
}

const { rule } = createSelectorHideRule({
  id: "cookie-banner-hide",
  label: "Remove Cookie Banners",
  description: "Remove GDPR/CCPA cookie consent banners.",
  defaultEnabled: true,
  removeEntirely: true,
  alwaysOnSelectors: [
    // OneTrust
    "#onetrust-banner-sdk",
    "#onetrust-consent-sdk",
    "#onetrust-pc-sdk",
    // Cookiebot
    "#CybotCookiebotDialog",
    "#CybotCookiebotDialogBodyUnderlay",
    // TrustArc / TRUSTe
    "#truste-consent-track",
    ".truste_box_overlay",
    ".truste_overlay",
    // Sourcepoint
    '[id^="sp_message_container_"]',
    ".sp_choice_type_11",
    // Quantcast
    '[class^="qc-cmp2-"]',
    ".qc-cmp2-container",
    // Osano
    ".osano-cm-window",
    ".osano-cm-dialog",
    // Didomi
    "#didomi-host",
    "#didomi-popup",
    ".didomi-popup-container",
    // Generic semantic
    '[aria-label*="cookie" i][role="dialog"]',
    '[aria-label*="consent" i][role="dialog"]',
    '[aria-describedby*="cookie" i]',
    // Generic class/id patterns
    '[class*="cookie-banner" i]',
    '[class*="cookie-consent" i]',
    '[id*="cookie-notice" i]',
    '[id*="gdpr-banner" i]',
  ],
  candidateFilter: isOverlay,
  // CMP scripts (OneTrust, Cookiebot, Sourcepoint, etc.) typically inject the
  // banner after document_idle once the consent state has been resolved.
  watchSubtrees: true,
  // Cookie banners are full-page overlays mounted on the top document; CMPs
  // never inject one into a content iframe.
  topFrameOnly: true,
});

export const cookieBannerHideRule = rule;
