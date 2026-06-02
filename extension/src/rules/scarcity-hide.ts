// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Hide scarcity-based urgency dark patterns ("Only 3 left in stock!",
// "Selling fast", "12 people are viewing this") so agents aren't pressured
// into rushing a purchase. Complements `countdown-timer-hide`, which covers
// time-based urgency.
//
// Real purchaseability signals are preserved by pattern precision rather
// than a negative-match list: the regexes require a number, "only N", "low",
// "limited", "almost", "selling", etc., so bare "Out of stock" / "Sold out" /
// "Unavailable" / "Bestseller" never match.
//
// Like countdown-timer-hide, we re-scan added subtrees via a throttled
// MutationObserver because product detail pages on Amazon/Walmart/Target
// frequently lazy-load. Unlike countdown-timer-hide, we don't need a
// snapshot/decrement check — the pattern itself is the signal.

import { REVEALED_ATTR } from "../lib/dom-markers";
import { findInnermostMatches, isInsidePlaceholder } from "../lib/dom-utils";
import { replaceWithBlockPlaceholder } from "../lib/placeholder";
import { createSubtreeWatcher } from "../lib/subtree-watcher";
import type { Rule } from "./types";

const RULE_ID = "scarcity-hide" as const;

const MAX_CANDIDATE_LENGTH = 80;
const MAX_CANDIDATE_DESCENDANTS = 20;

const SCARCITY_PATTERNS: RegExp[] = [
  /\bonly\s+\d+\s+(?:left|remaining|in\s+stock|available)\b/i,
  /\b\d+\s+(?:left|remaining)\s+in\s+stock\b/i,
  /\b(?:low|limited)\s+(?:stock|inventory|availability|quantit(?:y|ies)|supply)\b/i,
  /\bstock(?:\s+is)?\s+running\s+low\b/i,
  /\b\d+\s+(?:in\s+stock|available)\b/i,
];

const DEMAND_PATTERNS: RegExp[] = [
  /\b(?:almost|nearly)\s+(?:gone|out|sold(?:\s+out)?)\b/i,
  /\bselling\s+(?:fast|out)\b/i,
  /\bgoing\s+fast\b/i,
  /\bhigh\s+demand\b/i,
];

const ACTIVITY_PATTERNS: RegExp[] = [
  /\b\d+\s+(?:people|users|shoppers|customers|others?)\s+(?:are\s+)?(?:viewing|looking|watching)\b/i,
  /\b\d+\s+(?:sold|bought|purchased)\s+(?:in\s+the\s+)?(?:last|past)\s+\w+/i,
  /\b\d+\s+(?:in|have\s+(?:this\s+|it\s+)?in)\s+(?:their\s+)?carts?\b/i,
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

const watcher = createSubtreeWatcher({
  skipPlaceholderSubtrees: true,
  onSubtrees: (roots) => {
    for (const root of roots) {
      scanAndHide(root);
    }
  },
});

function apply(root: ParentNode): void {
  scanAndHide(root);
  watcher.start(root);
}

export const scarcityHideRule = {
  id: RULE_ID,
  label: "Hide Scarcity Warnings",
  description:
    'Hide scarcity messages like "Only 3 left" or "12 viewing now". Out-of-stock indicators and bestseller badges stay visible.',
  apply,
  teardown: () => {
    watcher.stop();
  },
} satisfies Rule;
