// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Surface sneak-into-basket dark patterns on cart/checkout pages: line
// items that get auto-added without explicit user opt-in (extended
// warranties, protection plans, package/shipping protection, charitable
// round-ups, gift wrap, carbon offsets, driver tips, AppleCare, SquareTrade,
// Asurion, Route, etc.).
//
// Strategy: detect by keyword inside small text elements on /cart and
// /checkout URLs and PREPEND an inline annotation chip into the matched
// element. We intentionally do NOT remove or hide the line — the line item
// represents real money already in the cart total, and silently removing
// it would desync the displayed total from what the user/agent sees and
// could disrupt fulfillment logic (some "service fee" line items are
// non-removable). Annotation preserves agency: the agent reads the chip
// text in its DOM snapshot and decides whether to click the line's
// remove control.
//
// Complementary to `checkout-checkbox-clear`, which prevents add-ons that
// are *about to be* added via a pre-checked checkbox. This rule handles
// the case where the add-on is *already in the cart* by the time the
// agent lands on /cart or /checkout.
//
// URL-gated: keywords like "warranty" and "insurance" appear in T&C,
// FAQs, product descriptions, and policy pages. Restricting to checkout
// URLs and capping element text length keep the false-positive rate low.

import { isCheckoutUrl } from "../lib/checkout-url";
import { findInnermostMatches } from "../lib/dom-utils";
import { log } from "../lib/log";
import { RULE_ATTR } from "../lib/placeholder";
import { createSubtreeWatcher } from "../lib/subtree-watcher";
import type { Rule } from "./types";

const RULE_ID = "cart-addon-flag" as const;

// Marks elements we've already annotated so subsequent scans skip them
// and the chip we prepended isn't itself counted as a fresh match on a
// containing element.
const FLAGGED_ATTR = "data-abs-cart-addon-flagged";
const FLAG_CLASS = "abs-cart-addon-flag";

// Cart line-item labels rarely exceed ~150 chars; capping prevents matching
// inside policy blurbs and disclosure paragraphs.
const MAX_CANDIDATE_LENGTH = 200;
// Cart line items rarely nest more than a few small children (image,
// title, qty, price, remove button). Capping avoids matching on the
// entire cart container.
const MAX_CANDIDATE_DESCENDANTS = 40;

interface AddonPattern {
  label: string;
  pattern: RegExp;
}

const ADDON_PATTERNS: AddonPattern[] = [
  { label: "protection plan", pattern: /\bprotection plan\b/i },
  { label: "warranty", pattern: /\b(?:extended\s+)?warranty\b/i },
  {
    label: "service / care plan",
    pattern: /\b(?:extended\s+)?(?:service|care)\s+(?:plan|contract)\b/i,
  },
  { label: "SquareTrade", pattern: /\bsquare\s?trade\b/i },
  { label: "AppleCare", pattern: /\bapple\s?care\b/i },
  { label: "Asurion", pattern: /\basurion\b/i },
  { label: "insurance", pattern: /\binsurance\b/i },
  { label: "donation", pattern: /\bdonat(?:e|ion|ions)\b/i },
  { label: "round-up", pattern: /\bround[\s-]?up\b/i },
  { label: "gift wrap", pattern: /\bgift\s?(?:wrap(?:ping)?|box)\b/i },
  { label: "gift message", pattern: /\bgift\s+message\b/i },
  { label: "carbon offset", pattern: /\bcarbon[\s-]+(?:offset|neutral)\b/i },
  // Branded protection products are checked before the generic
  // "package/shipping protection" pattern so the vendor name surfaces in
  // the annotation when present. "Route" gets its own match because the
  // brand name alone is ambiguous (could be a shipping route description).
  {
    label: "Route protection",
    pattern: /\broute\+|\broute\s+(?:package\s+)?protection\b/i,
  },
  { label: "Seel protection", pattern: /\bseel\s+(?:protection|assurance)\b/i },
  { label: "Navidium protection", pattern: /\bnavidium\b/i },
  {
    label: "shipping / package protection",
    pattern: /\b(?:package|shipping|order|delivery)\s+protection\b/i,
  },
  { label: "driver / courier tip", pattern: /\b(?:driver|courier)\s+tip\b/i },
];

export interface AddonMatch {
  label: string;
  matched: string;
}

export function matchAddon(text: string): AddonMatch | null {
  for (const { label, pattern } of ADDON_PATTERNS) {
    const match = pattern.exec(text);
    if (match) return { label, matched: match[0] };
  }
  return null;
}

interface Candidate {
  element: HTMLElement;
  label: string;
  matched: string;
}

function isSkipped(element: HTMLElement): boolean {
  if (element.hasAttribute(FLAGGED_ATTR)) return true;
  // Skip the chip itself and anything nested inside it so the chip's own
  // text doesn't drive a recursive re-annotation on the next scan.
  if (element.classList.contains(FLAG_CLASS)) return true;
  if (element.closest(`.${FLAG_CLASS}`)) return true;
  // If a descendant is already flagged, the matching text lives in that
  // descendant — annotating the enclosing container as well would be
  // redundant and noisy.
  if (element.querySelector(`[${FLAGGED_ATTR}]`)) return true;
  return false;
}

function findCandidates(root: ParentNode): Candidate[] {
  // Innermost-match only — when both <li.cart-line> and its
  // <span.cart-line__title> match, annotate the span, not the line.
  return findInnermostMatches(root, {
    isSkipped,
    maxTextLength: MAX_CANDIDATE_LENGTH,
    maxDescendants: MAX_CANDIDATE_DESCENDANTS,
    match: (text) => matchAddon(text),
  }).map(({ element, match }) => ({
    element,
    label: match.label,
    matched: match.matched,
  }));
}

function flag(candidate: Candidate): void {
  const { element, label, matched } = candidate;
  if (!element.isConnected) return;
  if (element.hasAttribute(FLAGGED_ATTR)) return;
  element.setAttribute(FLAGGED_ATTR, "");

  const chip = document.createElement("span");
  chip.className = FLAG_CLASS;
  chip.setAttribute(RULE_ATTR, RULE_ID);
  // Inline styling rather than an external stylesheet so the annotation
  // is self-contained and visible even on pages that strip extension CSS.
  // Block display puts the chip on its own visual line above the matched
  // text without interfering with the line-item's existing layout.
  chip.style.display = "block";
  chip.style.padding = "2px 6px";
  chip.style.margin = "0 0 4px 0";
  chip.style.border = "1px solid #b00";
  chip.style.background = "#fff5f5";
  chip.style.color = "#900";
  chip.style.font = "12px/1.4 system-ui, sans-serif";
  chip.style.fontStyle = "italic";
  chip.textContent = `[abs: likely cart add-on (${label}, matched "${matched}") — verify you intended this charge before completing purchase]`;
  element.prepend(chip);
}

function scanAndFlag(root: ParentNode): void {
  if (!isCheckoutUrl(globalThis.location.href)) return;
  const candidates = findCandidates(root);
  if (candidates.length === 0) return;
  for (const candidate of candidates) flag(candidate);
  log("cart add-ons flagged", {
    count: candidates.length,
    labels: candidates.map((c) => c.label),
    url: globalThis.location.href,
  });
}

const watcher = createSubtreeWatcher({
  onSubtrees: (roots) => {
    for (const root of roots) scanAndFlag(root);
  },
});

function apply(root: ParentNode): void {
  scanAndFlag(root);
  watcher.start(root);
}

export const cartAddonFlagRule = {
  id: RULE_ID,
  label: "Flag Cart Add-Ons (Sneak-Into-Basket)",
  description:
    "On checkout pages, flag likely sneak-into-basket line items (protection plans, warranties, insurance, donations, gift wrap, etc.) with a visible annotation. Items are not removed.",
  defaultEnabled: true,
  apply,
  teardown: () => watcher.stop(),
} satisfies Rule;
