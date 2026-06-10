// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Hide scarcity-based urgency dark patterns ("Only 3 left in stock!",
// "Selling fast", "12 people are viewing this") so agents aren't pressured
// into rushing a purchase. Complements `countdown-timer-redact`, which covers
// time-based urgency.
//
// Real purchaseability signals are preserved by pattern precision rather
// than a negative-match list: the regexes require a number, "only N", "low",
// "limited", "almost", "selling", etc., so bare "Out of stock" / "Sold out" /
// "Unavailable" / "Bestseller" never match.
//
// Like countdown-timer-redact, we re-scan added subtrees via a throttled
// MutationObserver because product detail pages on Amazon/Walmart/Target
// frequently lazy-load. Unlike countdown-timer-redact, we don't need a
// snapshot/decrement check — the pattern itself is the signal.

import { REVEALED_ATTR } from "../lib/dom-markers";
import { findInnermostMatches, isInsidePlaceholder } from "../lib/dom-utils";
import { replaceWithBlockPlaceholder } from "../lib/placeholder";
import { createScanRule } from "../lib/scan-rule";

const RULE_ID = "scarcity-redact" as const;

const MAX_CANDIDATE_LENGTH = 80;
const MAX_CANDIDATE_DESCENDANTS = 20;

const SCARCITY_PATTERNS: RegExp[] = [
  /\b(?:only|just)\s+\d+\s+(?:left|remaining|in\s+stock|available)\b/i,
  /\b\d+\s+(?:left|remaining)\s+in\s+stock\b/i,
  /\b\d+\s+(?:items?|units?|pieces?)\s+(?:left|remaining)\b/i,
  /\b(?:low|limited)\s+(?:stock|inventory|availability|quantit(?:y|ies)|supply)\b/i,
  /\bstock(?:\s+is)?\s+running\s+low\b/i,
  /\b\d+\s+(?:in\s+stock|available)\b/i,
  // "While supplies last" / "while stocks last" — fixed phrase, no FP risk.
  /\bwhile\s+(?:supplies|stocks?)\s+last\b/i,
];

const DEMAND_PATTERNS: RegExp[] = [
  /\b(?:almost|nearly)\s+(?:gone|out|sold(?:\s+out)?)\b/i,
  /\bselling\s+(?:fast|out|quickly)\b/i,
  /\bgoing\s+(?:fast|quickly)\b/i,
  /\bhigh\s+demand\b/i,
  // "Flying off the shelves" / "going off shelves" — retail-only idiom; 80-char
  // leaf-candidate gate makes prose mentions (e.g. news copy) unreachable.
  /\b(?:flying|going)\s+off\s+(?:the\s+)?shelves\b/i,
];

const ACTIVITY_PATTERNS: RegExp[] = [
  /\b\d+\s+(?:people|users|shoppers|customers|others?)\s+(?:are\s+)?(?:viewing|looking|watching)\b/i,
  /\b\d+\s+(?:sold|bought|purchased)\s+(?:in\s+the\s+)?(?:last|past)\s+\w+/i,
  /\b\d+\s+(?:in|have\s+(?:this\s+|it\s+)?in)\s+(?:their\s+)?carts?\b/i,
  // "12 added to cart in the last hour" / "8 added to bag" — covers the
  // verb-swap from "viewing/watching" to "added".
  /\b\d+\s+(?:people\s+|shoppers\s+|others\s+)?added\s+(?:this\s+)?to\s+(?:their\s+)?(?:carts?|baskets?|bags?|wishlists?)\b/i,
];

const ALL_PATTERNS: RegExp[] = [
  ...SCARCITY_PATTERNS,
  ...DEMAND_PATTERNS,
  ...ACTIVITY_PATTERNS,
];

export function matchesScarcityPattern(text: string): boolean {
  return ALL_PATTERNS.some((pattern) => pattern.test(text));
}

function isSkipped(element: HTMLElement): boolean {
  if (isInsidePlaceholder(element)) {
    return true;
  }
  if (element.getAttribute(REVEALED_ATTR) === RULE_ID) {
    return true;
  }
  if (element.closest(`[${REVEALED_ATTR}="${RULE_ID}"]`)) {
    return true;
  }
  return false;
}

function scanAndHide(root: ParentNode): void {
  const matches = findInnermostMatches(root, {
    isSkipped,
    maxTextLength: MAX_CANDIDATE_LENGTH,
    maxDescendants: MAX_CANDIDATE_DESCENDANTS,
    // Innermost-match preference is built into findInnermostMatches — keeps
    // us from blacking out a whole product card when only a badge inside
    // carries the urgency message.
    match: (text) => (matchesScarcityPattern(text) ? true : null),
  });
  for (const { element } of matches) {
    if (!element.isConnected) {
      continue;
    }
    if (isInsidePlaceholder(element)) {
      continue;
    }
    replaceWithBlockPlaceholder(
      element,
      RULE_ID,
      "[scarcity warning hidden — click to reveal]",
    );
  }
}

export const scarcityRedactRule = createScanRule({
  id: RULE_ID,
  scan: scanAndHide,
  skipPlaceholderSubtrees: true,
  label: "Hide Scarcity Warnings",
  description:
    'Hide scarcity messages like "Only 3 left" or "12 viewing now". Out-of-stock indicators and bestseller badges stay visible.',
});
