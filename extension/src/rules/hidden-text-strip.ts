// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Strip text that's invisible to a sighted human but still readable by
// agents walking the DOM or accessibility tree — the "unseeable injection"
// pattern attackers use to smuggle instructions to LLM-driven browsers.
//
// Two trigger families:
//   A. Foreground/background color match. Same hue + near-zero contrast
//      means the text is unreadable to sighted users but plain text to the
//      DOM. This is the dominant injection technique in the wild.
//   B. CSS hidden via visibility:hidden, opacity:0, font-size:0, or
//      offscreen/clipped containment that's also large enough to carry a
//      payload. Tiny SR-only structures are explicitly preserved (see below).
//
// Screen-reader-only text is preserved because it's load-bearing for a11y
// and for agents navigating via the a11y tree (e.g., Amazon's `a-offscreen`
// holds the dollar value of every search-result price — stripping it wipes
// every price out of the SERP). Preservation signals, in order:
//   1. Class-name hints — `.sr-only`, `.visually-hidden`,
//      `.screen-reader-text`, `.u-visuallyHidden`, MUI's `visuallyHidden`,
//      Amazon's `a-offscreen` / `aok-offscreen`. The explicit idiom most
//      frameworks ship.
//   2. The 1×1 + overflow:hidden + out-of-flow envelope. Every SR-only
//      recipe in the wild collapses to this shape (W3C clip-to-zero,
//      WebAIM off-left, Bootstrap-5 clip:rect(1px) + clip-path:inset(50%),
//      Amazon `a-offscreen`, MUI `visuallyHidden`). We don't try to
//      enumerate every framework's specific clip/positioning trick — new
//      ones ship faster than we can catalog them, and stripping a single
//      SR-only label can blow up a whole a11y tree. The envelope itself is
//      the signature: a 1×1 absolutely-positioned overflow:hidden box has
//      no visible affordance for sighted users regardless of what's inside,
//      so it's only ever used to expose text to assistive tech.
//
// The injection threat model still holds: real prompt-injection payloads
// run to many tokens and ship as full-size hidden blocks (white-on-white,
// visibility:hidden, off-left LARGE blocks). The 1×1 envelope can carry
// arbitrary text in `textContent` too, but historically attackers don't
// bother — they want their payload visible to other tools they target, and
// preserving SR-only labels avoids breaking honest sites at the price of
// not catching a hypothetical adversary who specifically targets agents
// via 1×1 boxes. That tradeoff is intentional.
//
// display:none is intentionally NOT a trigger: collapsed menus, tab panels,
// and dropdowns commonly toggle display, and stripping their text content
// would corrupt the underlying app state once the user/agent expands them.
//
// When a non-allowlisted match is found, the element is removed from the
// DOM entirely (no placeholder). The contents are by construction invisible
// to sighted users, and a placeholder would only re-leak the data to
// DOM-scraping agents.

import {
  filterToOutermost,
  isInsidePlaceholder,
  isNonContentTag,
  NON_CONTENT_TAGS,
} from "../lib/dom-utils";
import { log } from "../lib/log";
import { SR_ONLY_CLASS_NAMES, SR_ONLY_MAX_SIZE_PX } from "../lib/sr-only";
import { createSubtreeWatcher } from "../lib/subtree-watcher";
import type { Rule } from "./types";

const RULE_ID = "hidden-text-strip" as const;

const OFFSCREEN_THRESHOLD_PX = -9999;

function hasSrOnlyClass(element: Element): boolean {
  for (const cls of element.classList) {
    if (SR_ONLY_CLASS_NAMES.has(cls)) return true;
    if (/visuallyhidden/i.test(cls)) return true;
  }
  return false;
}

function isExcludedAncestor(element: Element): boolean {
  let current: Element | null = element;
  while (current) {
    if (NON_CONTENT_TAGS.has(current.tagName)) return true;
    current = current.parentElement;
  }
  return false;
}

function parsePixelLength(value: string): number | null {
  const match = /^(-?\d+(?:\.\d+)?)px$/.exec(value);
  if (!match?.[1]) return null;
  return Number.parseFloat(match[1]);
}

function isClippedToZero(style: CSSStyleDeclaration): boolean {
  const clipPath = style.clipPath;
  if (clipPath === "inset(100%)") return true;
  const clip = style.clip;
  if (clip === "rect(0px, 0px, 0px, 0px)") return true;
  if (clip === "rect(0px 0px 0px 0px)") return true;
  if (clip === "rect(0, 0, 0, 0)") return true;
  return false;
}

// Detect a screen-reader-only pattern by computed style. Frameworks that
// emit auto-generated class names (MUI's `visuallyHidden`, emotion-styled
// sr-only equivalents, Amazon's `a-offscreen` when stylesheets compute
// differently than expected) bypass `hasSrOnlyClass`, but the fingerprint
// is shared across all of them: out-of-flow + ~1×1 + overflow:hidden.
//
// The 1×1 envelope is the load-bearing check — every SR-only recipe in
// the wild collapses to this shape because anything larger would be
// visible to sighted users. We deliberately don't gate on the specific
// containment trick (clip-to-zero vs off-left vs clip-path:inset(50%) vs
// margin:-1px) because frameworks ship new variants faster than we can
// enumerate, and false-stripping a single SR-only label can wipe out
// whole a11y trees (e.g., every Amazon SERP price disappears at once).
function hasStructuralSrOnlyPattern(style: CSSStyleDeclaration): boolean {
  if (style.position !== "absolute" && style.position !== "fixed") return false;
  if (style.overflow !== "hidden") return false;
  const width = parsePixelLength(style.width);
  const height = parsePixelLength(style.height);
  if (width === null || width > SR_ONLY_MAX_SIZE_PX) return false;
  if (height === null || height > SR_ONLY_MAX_SIZE_PX) return false;
  return true;
}

function isHiddenByCss(style: CSSStyleDeclaration): boolean {
  if (style.visibility === "hidden" || style.visibility === "collapse") {
    return true;
  }
  if (Number.parseFloat(style.opacity) === 0) return true;
  if (style.fontSize === "0px") return true;
  if (style.position === "absolute" || style.position === "fixed") {
    const left = parsePixelLength(style.left);
    const top = parsePixelLength(style.top);
    if (
      (left !== null && left <= OFFSCREEN_THRESHOLD_PX) ||
      (top !== null && top <= OFFSCREEN_THRESHOLD_PX)
    ) {
      return true;
    }
  }
  const textIndent = parsePixelLength(style.textIndent);
  if (textIndent !== null && textIndent <= OFFSCREEN_THRESHOLD_PX) return true;
  if (isClippedToZero(style)) return true;
  return false;
}

function hasNonemptyText(element: Element): boolean {
  return (element.textContent ?? "").trim().length > 0;
}

// sRGB Euclidean distance under which two colors are perceptually
// indistinguishable for normal-weight body text. Calibrated loosely against
// WCAG 2.1's 4.5:1 contrast floor — anything below this is well under the
// "Fail" threshold for AA.
const COLOR_MATCH_DISTANCE = 24;

type RGB = readonly [number, number, number];
type RGBA = readonly [number, number, number, number];

function parseColor(value: string): RGBA | null {
  const match =
    /^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i.exec(
      value,
    );
  if (!match?.[1] || !match[2] || !match[3]) return null;
  const r = Number.parseFloat(match[1]);
  const g = Number.parseFloat(match[2]);
  const b = Number.parseFloat(match[3]);
  const a = match[4] === undefined ? 1 : Number.parseFloat(match[4]);
  if ([r, g, b, a].some((n) => Number.isNaN(n))) return null;
  return [r, g, b, a];
}

// Effective background color: walk up ancestors and composite the first
// opaque background we find. `transparent` and `rgba(_, _, _, 0)` mean
// "ask my parent." Falls back to white because every browser paints the
// canvas white when nothing intervenes.
function effectiveBackgroundColor(element: Element): RGB {
  let current: Element | null = element;
  while (current) {
    const style = globalThis.getComputedStyle(current);
    const bg = parseColor(style.backgroundColor);
    if (bg && bg[3] >= 0.999) {
      return [bg[0], bg[1], bg[2]];
    }
    current = current.parentElement;
  }
  return [255, 255, 255];
}

function colorDistance(a: RGB, b: RGB): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.hypot(dr, dg, db);
}

// Foreground is the same color as the effective background, modulo a
// perceptual tolerance — the classic "white text on white background"
// LLM-trick. Element's own alpha is folded in so `opacity:0`-style cases
// don't double-count (those are already caught by isHiddenByCss).
function hasMatchingForeground(
  element: Element,
  style: CSSStyleDeclaration,
): boolean {
  const fg = parseColor(style.color);
  if (!fg) return false;
  if (fg[3] === 0) return false;
  const bg = effectiveBackgroundColor(element);
  return colorDistance([fg[0], fg[1], fg[2]], bg) <= COLOR_MATCH_DISTANCE;
}

function findCandidates(root: ParentNode): HTMLElement[] {
  const matches: HTMLElement[] = [];
  for (const element of root.querySelectorAll<HTMLElement>("*")) {
    if (isNonContentTag(element.tagName)) continue;
    if (isInsidePlaceholder(element)) continue;
    if (element.closest('[aria-hidden="true"]')) continue;
    if (hasSrOnlyClass(element)) continue;
    if (isExcludedAncestor(element)) continue;
    if (!hasNonemptyText(element)) continue;
    const style = globalThis.getComputedStyle(element);
    if (hasStructuralSrOnlyPattern(style)) continue;
    if (!isHiddenByCss(style) && !hasMatchingForeground(element, style))
      continue;
    matches.push(element);
  }
  return filterToOutermost(matches);
}

function scanAndStrip(root: ParentNode): void {
  for (const element of findCandidates(root)) {
    if (!element.isConnected) continue;
    log("hidden text removed", {
      ruleId: RULE_ID,
      tag: element.tagName,
      id: element.id || undefined,
      classes: element.className || undefined,
      textLength: (element.textContent ?? "").length,
    });
    element.remove();
  }
}

const watcher = createSubtreeWatcher({
  skipPlaceholderSubtrees: true,
  onSubtrees: (roots) => {
    for (const root of roots) scanAndStrip(root);
  },
});

function apply(root: ParentNode): void {
  scanAndStrip(root);
  watcher.start(root);
}

export const hiddenTextStripRule = {
  id: RULE_ID,
  label: "Strip Hidden Text",
  description:
    'Remove text invisible to humans but readable by agents. Defends against "unseeable" prompt injection; screen-reader-only text is preserved.',
  defaultEnabled: true,
  apply,
  teardown: () => watcher.stop(),
} satisfies Rule;
