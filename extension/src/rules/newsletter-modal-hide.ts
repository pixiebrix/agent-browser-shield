// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Hide interstitial newsletter signup modals that cover the page after a
// timer or scroll-depth trigger. Token waste + dark-pattern friction in one.
//
// Both vendor-specific selectors (Sumo, OptinMonster, Privy, Mailchimp,
// Klaviyo) and generic dialog selectors are gated by a candidateFilter that
// requires:
//   1. fixed/sticky positioning (real overlays, not in-flow forms)
//   2. covers ≥25% of the viewport (filters out small toasts)
//   3. contains signup-language ("subscribe", "newsletter", etc.)
//   4. contains an <input type="email"> or a <form> descendant
// The combination keeps login modals, paywalls, and age-gates visible.
//
// Newsletter modals commonly inject after a 5–30s timer or scroll-depth
// trigger, so the rule subscribes to the subtree watcher to re-scan added
// content.

import { createSelectorHideRule } from "../lib/selector-hide-rule";

const NEWSLETTER_TEXT =
  /\b(?:subscribe|sign[\s-]?up|signup|join our|newsletter|don'?t miss|stay (?:in the loop|updated))\b/i;
const MIN_VIEWPORT_AREA_RATIO = 0.25;

function looksLikeNewsletterModal(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  if (style.position !== "fixed" && style.position !== "sticky") return false;

  // In real browsers, getBoundingClientRect returns layout dimensions; in
  // jsdom it returns 0. Skip the area gate when the rect is zero so unit
  // tests don't have to mock layout.
  const rect = element.getBoundingClientRect();
  const rectArea = rect.width * rect.height;
  const viewportArea = window.innerWidth * window.innerHeight;
  if (
    rectArea > 0 &&
    viewportArea > 0 &&
    rectArea < viewportArea * MIN_VIEWPORT_AREA_RATIO
  ) {
    return false;
  }

  const text = element.textContent ?? "";
  if (!NEWSLETTER_TEXT.test(text)) return false;

  if (
    !element.querySelector('input[type="email"]') &&
    !element.querySelector("form")
  ) {
    return false;
  }
  return true;
}

const { rule, selectorsFor } = createSelectorHideRule({
  id: "newsletter-modal-hide",
  label: "Remove Newsletter Modals",
  description:
    "Remove interstitial newsletter signup modals that cover the page. Detects fixed-position dialogs containing signup language and an email input. These modals float above the page, so they're removed entirely rather than replaced with an in-flow placeholder. Standard login modals, paywalls, and small toasts are kept visible.",
  defaultEnabled: true,
  removeEntirely: true,
  alwaysOnSelectors: [
    // Sumo
    ".sumome-react-wysiwyg-popup-wrapper",
    '[id^="sumo-"]',
    // OptinMonster
    '[id^="om-"][class*="campaign"]',
    ".om-element-overlay",
    // Privy
    "#privy-container",
    '[class*="privy-"]',
    // Mailchimp Popup
    "#mc_embed_signup_scroll",
    ".mc-modal",
    // Klaviyo
    '[class*="klaviyo-form-"]',
    // Generic modal containers — candidateFilter narrows by content
    '[role="dialog"]',
    '[role="alertdialog"]',
    ".modal.show",
    ".popup",
    '[id*="newsletter" i][class*="popup" i]',
  ],
  candidateFilter: looksLikeNewsletterModal,
  // Newsletter modals commonly inject after a 5–30s timer or scroll-depth
  // trigger, well after document_idle.
  watchSubtrees: true,
  // Modals are full-page overlays mounted on the top document; vendor
  // scripts never inject them into a nested iframe's body.
  topFrameOnly: true,
});

export { selectorsFor };
export const newsletterModalHideRule = rule;
