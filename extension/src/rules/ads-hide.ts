// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Hide display ads and paid/sponsored result blocks. Ads are token bloat,
// distract agents from the actual page content, and (in the case of
// sponsored search results) risk being treated as organic recommendations.
// We remove matches outright — there's no plausible task in which an agent
// should click through to reveal an ad, so a placeholder would just waste
// tokens.
//
// Two layers:
//
// 1. A hand-curated list of well-known ad surfaces (AdSense, GAM, Outbrain,
//    Taboola, Google/Bing/Amazon sponsored results, etc.) is removed from
//    the DOM on apply and on subsequent mutations.
//
// 2. The EasyList generic element-hiding list (~13k selectors, snapshotted
//    at build time by `scripts/fetch_easylist.py`) is injected as a
//    `display:none !important` stylesheet. Running querySelectorAll over
//    13k selectors on every mutation would be expensive, so the stylesheet
//    path is used for these — CSS-engine fast and handles lazy-injected ads
//    automatically.
//
// Selectors in the curated list are intentionally specific (vendor
// ids/classes, schema-style `data-text-ad`, `[aria-label*="advertisement"]`).
// Generic `[class*="ad-"]` patterns are deliberately NOT used — they
// false-match on "add-to-cart", "address", "header-ad-min-height" utility
// classes, etc. EasyList provides broader coverage where those FP-prone
// patterns would have been needed.

import { createSelectorHideRule } from "../lib/selector-hide-rule";
import { EASYLIST_GENERIC_SELECTORS } from "./easylist-generic.generated";
import type { Rule } from "./types";

const EASYLIST_STYLE_ID = "abs-ads-hide-easylist";

// Build the stylesheet text once at module load. 13k selectors → ~600KB of
// CSS text, but the CSSOM parses it in milliseconds and the work amortizes
// across every page where the rule is enabled.
const EASYLIST_STYLESHEET_TEXT = EASYLIST_GENERIC_SELECTORS.map(
  (selector) => `${selector}{display:none!important}`,
).join("\n");

let injectedStyle: HTMLStyleElement | null = null;

function injectEasyListStylesheet(): void {
  if (injectedStyle?.isConnected) {
    return;
  }
  const style = document.createElement("style");
  style.id = EASYLIST_STYLE_ID;
  style.textContent = EASYLIST_STYLESHEET_TEXT;
  // documentElement, not head — `head` doesn't exist yet on document_start
  // injection and may be missing on partial DOMs.
  (document.head ?? document.documentElement).append(style);
  injectedStyle = style;
}

function removeEasyListStylesheet(): void {
  injectedStyle?.remove();
  injectedStyle = null;
  // Defensive: also drop any orphaned stylesheet from a prior apply that
  // wasn't cleaned up (e.g., page navigated without teardown firing).
  for (const element of document.querySelectorAll(`#${EASYLIST_STYLE_ID}`)) {
    element.remove();
  }
}

const { rule: baseRule, selectorsFor } = createSelectorHideRule({
  id: "ads-hide",
  label: "Hide Ads & Sponsored Results",
  description:
    "Remove display ads and paid/sponsored search results. Uses EasyList for broad coverage.",
  defaultEnabled: true,
  removeEntirely: true,
  alwaysOnSelectors: [
    // Google AdSense
    "ins.adsbygoogle",
    'iframe[id^="google_ads_iframe"]',
    'iframe[id^="aswift_"]',
    'iframe[name^="google_ads_iframe"]',
    'iframe[src*="googlesyndication.com"]',
    'iframe[src*="googleadservices.com"]',
    // Google Ad Manager / DFP
    'div[id^="div-gpt-ad"]',
    'div[id^="google_ads_iframe_"]',
    // Generic IAB ad-slot conventions
    "div[data-ad-slot]",
    "div[data-ad-client]",
    "div[data-google-query-id]",
    // Outbrain
    'div[id^="outbrain_widget"]',
    "div.OUTBRAIN",
    "div.ob-widget",
    'div[data-widget-id^="AR_"]',
    // Taboola
    'div[id^="taboola-"]',
    "div.trc_related_container",
    'div[data-mode="thumbnails-rr"]',
    // Sharethrough / Nativo / other native ad SDKs
    "div[data-str-native-key]",
    "div[data-nativo-tag-id]",
    // Amazon display ads (not search-result sponsored — covered by SERP block)
    "div[data-ad-feedback]",
    'div[id^="DAds"]',
    // Generic vendor-neutral markers
    'iframe[title*="advertisement" i]',
    'iframe[title*="3rd party ad" i]',
    'iframe[aria-label*="advertisement" i]',
    'div[aria-label="Advertisement"]',
    'aside[aria-label="Advertisement"]',
    // Google Search SERP sponsored blocks. Google rotates inner class names
    // frequently; these container ids are the stable surface.
    "#tads",
    "#bottomads",
    "#tadsb",
    "div[data-text-ad]",
    // Bing SERP
    "li.b_ad",
    "ol.b_results > li.b_ad",
    // DuckDuckGo
    'div[id^="r1-0"][data-testid="ad"]',
    'article[data-testid="ad"]',
    // Amazon search "Sponsored" results
    'div[data-component-type="sp-sponsored-result"]',
    "div.AdHolder",
    'span[data-component-type="s-sponsored-label-info-icon"]',
  ],
  // Ad iframes and SERP blocks hydrate after document_idle (especially GPT
  // and lazily-loaded mid-article ad slots).
  watchSubtrees: true,
});

const baseApply = baseRule.apply;
const baseTeardown = baseRule.teardown;

export const adsHideRule: Rule = {
  ...baseRule,
  apply(root) {
    injectEasyListStylesheet();
    baseApply(root);
  },
  teardown() {
    baseTeardown?.();
    removeEasyListStylesheet();
  },
};

export { selectorsFor };
