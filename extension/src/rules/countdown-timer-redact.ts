// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Hide active countdown timers ("Sale ends in 12:34:56", "Only 5m 30s left")
// so agents aren't pressured by the artificial time-sensitivity dark pattern.
// We can't reliably distinguish a countdown from a static clock from text
// alone, so we snapshot likely candidates, wait 1.5 seconds, then only hide
// elements whose parsed value decreased between snapshots.
//
// Many sites (Target, Amazon, retailers in general) lazy-load product detail
// sections after first paint, so we also watch for subtree mutations and
// re-scan added subtrees. The mutation handler is throttled to coalesce
// React-style render bursts.
//
// Caveat: replacing the live element detaches it from any setInterval that
// drives the timer. When the user clicks to reveal, the original element is
// reattached but its displayed value is whatever it had at hide time — the
// underlying JS clock may have stopped, jumped, or thrown by then.

import { findInnermostMatches, isInsidePlaceholder } from "../lib/dom-utils";
import { replaceWithBlockPlaceholder } from "../lib/placeholder";
import { createSubtreeWatcher } from "../lib/subtree-watcher";
import type { Rule } from "./types";

const RULE_ID = "countdown-timer-redact" as const;

const SNAPSHOT_DELAY_MS = 1500;

// Restrict candidates to elements whose own text content is short and
// leaf-ish — real timers are usually a single short value, not a paragraph
// of prose that happens to mention a time.
const MAX_CANDIDATE_LENGTH = 64;
const MAX_CANDIDATE_DESCENDANTS = 20;

const COLON_PATTERN = /(?<!\d)\d{1,3}:[0-5]\d(?::[0-5]\d)?(?!\d)/;
const MULTI_UNIT_PATTERN =
  /\b\d+\s*(?:d(?:ays?)?|h(?:ours?|rs?)?|m(?:in(?:utes?)?)?|s(?:ec(?:onds?)?)?)\b[\s,:]*\b\d+\s*(?:d(?:ays?)?|h(?:ours?|rs?)?|m(?:in(?:utes?)?)?|s(?:ec(?:onds?)?)?)\b/i;
const URGENCY_UNIT_PATTERN =
  /\b\d+\s*(?:hours?|hrs?|minutes?|mins?|seconds?|secs?)\s+(?:left|remaining|to\s+go|to\s+claim|to\s+save|until)\b/i;
// "Sale ends in 3h", "Offer expires in 45 minutes", "Closes in 2d" — common
// countdown lead-ins where the urgency word precedes the value. Candidate
// only; redaction still requires the decrement check in reconcileCandidates,
// so a static "Expires in 30 days" badge is never replaced.
const EXPIRY_LEAD_PATTERN =
  /\b(?:ends?|expires?|closes?)\s+in\s+\d+\s*(?:d(?:ays?)?|h(?:ours?|rs?)?|m(?:in(?:utes?)?)?|s(?:ec(?:onds?)?)?)\b/i;

export function matchesTimerPattern(text: string): boolean {
  return (
    COLON_PATTERN.test(text) ||
    MULTI_UNIT_PATTERN.test(text) ||
    URGENCY_UNIT_PATTERN.test(text) ||
    EXPIRY_LEAD_PATTERN.test(text)
  );
}

const UNIT_MULTIPLIERS: ReadonlyArray<readonly [RegExp, number]> = [
  [/(\d+)\s*(?:days?|d)\b/i, 86_400],
  [/(\d+)\s*(?:hours?|hrs?|h)\b/i, 3600],
  [/(\d+)\s*(?:minutes?|mins?|m)\b/i, 60],
  [/(\d+)\s*(?:seconds?|secs?|s)\b/i, 1],
];

export function parseTotalSeconds(text: string): number | null {
  const colon = /(?<!\d)(\d{1,3}):([0-5]\d)(?::([0-5]\d))?(?!\d)/.exec(text);
  if (colon) {
    const a = Number(colon[1] ?? "0");
    const b = Number(colon[2] ?? "0");
    if (colon[3] !== undefined) {
      const c = Number(colon[3]);
      return a * 3600 + b * 60 + c;
    }
    return a * 60 + b;
  }

  let total = 0;
  let found = false;
  for (const [pattern, multiplier] of UNIT_MULTIPLIERS) {
    const match = text.match(pattern);
    if (match?.[1] !== undefined) {
      total += Number(match[1]) * multiplier;
      found = true;
    }
  }
  return found ? total : null;
}

interface Candidate {
  element: HTMLElement;
  initialText: string;
  initialSeconds: number;
}

// Innermost-match preference is built into findInnermostMatches — keeps us
// from blacking out a whole wrapper when only an inner timer is decrementing.
function findCandidates(root: ParentNode): Candidate[] {
  const matches = findInnermostMatches(root, {
    isSkipped: isInsidePlaceholder,
    maxTextLength: MAX_CANDIDATE_LENGTH,
    maxDescendants: MAX_CANDIDATE_DESCENDANTS,
    match: (text) => {
      if (!matchesTimerPattern(text)) {
        return null;
      }
      const seconds = parseTotalSeconds(text);
      if (seconds == null) {
        return null;
      }
      return { initialText: text, initialSeconds: seconds };
    },
  });
  return matches.map(({ element, match }) => ({
    element,
    initialText: match.initialText,
    initialSeconds: match.initialSeconds,
  }));
}

function reconcileCandidates(candidates: Candidate[]): void {
  for (const { element, initialText, initialSeconds } of candidates) {
    if (!element.isConnected) {
      continue;
    }
    if (isInsidePlaceholder(element)) {
      continue;
    }
    const currentText = element.textContent.trim();
    if (currentText === initialText) {
      continue;
    }
    const currentSeconds = parseTotalSeconds(currentText);
    if (currentSeconds == null) {
      continue;
    }
    if (currentSeconds >= initialSeconds) {
      continue;
    }
    replaceWithBlockPlaceholder(
      element,
      RULE_ID,
      "[countdown timer hidden — click to reveal]",
    );
  }
}

// Rule-specific lifecycle. The subtree watcher handles the MutationObserver +
// throttle; we additionally track pending snapshot timeouts and already-
// submitted elements so the 1.5s decrement check isn't started twice for the
// same node.
const pendingTimeouts = new Set<ReturnType<typeof setTimeout>>();
const trackedElements = new WeakSet<Element>();

function scheduleReconcile(candidates: Candidate[]): void {
  if (candidates.length === 0) {
    return;
  }
  for (const { element } of candidates) {
    trackedElements.add(element);
  }
  const timeoutId = setTimeout(() => {
    pendingTimeouts.delete(timeoutId);
    reconcileCandidates(candidates);
  }, SNAPSHOT_DELAY_MS);
  pendingTimeouts.add(timeoutId);
}

const watcher = createSubtreeWatcher({
  skipPlaceholderSubtrees: true,
  onSubtrees: (roots) => {
    const candidates: Candidate[] = [];
    for (const root of roots) {
      for (const candidate of findCandidates(root)) {
        if (!trackedElements.has(candidate.element)) {
          candidates.push(candidate);
        }
      }
    }
    scheduleReconcile(candidates);
  },
});

function apply(root: ParentNode): void {
  scheduleReconcile(findCandidates(root));
  watcher.start(root);
}

function teardown(): void {
  watcher.stop();
  for (const id of pendingTimeouts) {
    clearTimeout(id);
  }
  pendingTimeouts.clear();
}

export const countdownTimerRedactRule = {
  id: RULE_ID,
  label: "Hide Countdown Timers",
  description:
    "Hide running countdown timers (artificial-urgency dark pattern).",
  apply,
  teardown,
} satisfies Rule;
