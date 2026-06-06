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
// When a non-allowlisted match is found, we blank every text node inside
// the element rather than detaching the element itself. Frameworks
// (React 19, Vue, Svelte, Astro) keep live references to the elements
// they rendered and reach for them on route unmount or partial swap —
// detaching the element makes `removeChild` throw inside their commit
// phase and strands the route. Blanking the descendant text nodes
// preserves the DOM shape (so the framework can clean up cleanly) while
// removing what an agent walking textContent / the a11y tree can read.
// The contents are by construction invisible to sighted users — an empty
// hidden box looks the same as the original — and a placeholder would
// only re-leak the data to DOM-scraping agents.

import {
  filterToOutermost,
  isInsidePlaceholder,
  isNonContentTag,
  NON_CONTENT_TAGS,
  visibleTextContent,
} from "../lib/dom-utils";
import { log } from "../lib/log";
import { SR_ONLY_CLASS_NAMES, SR_ONLY_MAX_SIZE_PX } from "../lib/sr-only";
import { createSubtreeWatcher } from "../lib/subtree-watcher";
import type { Rule } from "./types";

const RULE_ID = "hidden-text-strip" as const;

const OFFSCREEN_THRESHOLD_PX = -9999;

function hasSrOnlyClass(element: Element): boolean {
  for (const cls of element.classList) {
    if (SR_ONLY_CLASS_NAMES.has(cls)) {
      return true;
    }
    if (/visuallyhidden/i.test(cls)) {
      return true;
    }
  }
  return false;
}

function isExcludedAncestor(element: Element): boolean {
  let current: Element | null = element;
  while (current) {
    if (NON_CONTENT_TAGS.has(current.tagName)) {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

// HTML5 landmarks + ARIA landmark roles. Sites routinely position these
// off-screen as "skip to content" affordances or keyboard-shortcut help
// menus (e.g., Amazon's `<nav id="shortcut-menu">` at `left: -10000px`),
// so the off-screen-positioning idiom inside a landmark gets preserved
// regardless of size. This is a narrower allowlist than it used to be:
// landmarks no longer protect against `visibility: hidden`, `opacity: 0`,
// or color-matched text inside the landmark element — those shapes
// aren't load-bearing for a11y and an attacker setting them on a `<nav>`
// is still injection-shaped. The allowlist is per-element: an
// injection-shaped descendant inside a landmark is still strippable
// (a 600px-wide off-left DIV inside a NAV is not "the landmark"
// itself).
const LANDMARK_TAGS: ReadonlySet<string> = new Set([
  "NAV",
  "MAIN",
  "HEADER",
  "FOOTER",
  "ASIDE",
]);
const LANDMARK_ROLES: ReadonlySet<string> = new Set([
  "navigation",
  "main",
  "banner",
  "contentinfo",
  "complementary",
]);

function isLandmark(element: Element): boolean {
  if (LANDMARK_TAGS.has(element.tagName)) {
    return true;
  }
  const role = element.getAttribute("role");
  return role !== null && LANDMARK_ROLES.has(role);
}

// Match reasons whose only signal is "the element is positioned out of
// the visible viewport / clipped to zero area". These are the shapes a
// landmark or aria-hidden subtree legitimately uses to keep content
// available to assistive tech without painting it; we allowlist
// landmarks and aria-hidden subtrees against these reasons only.
//
// Conversely, `visibility-hidden`, `opacity-0`, `font-size-0`, and
// `color-match` are paint-mode hides — text remains in DOM textContent
// and in the a11y tree (visibility:hidden does suppress the a11y tree
// for assistive tech, but it doesn't suppress text agents reading
// `textContent`, which is the threat model). A landmark or aria-hidden
// subtree using one of those is bypassing the rule by exploiting its
// own allowlist, so we strip.
const POSITIONAL_HIDE_REASONS: ReadonlySet<string> = new Set([
  "offscreen-left",
  "offscreen-top",
  "text-indent",
  "clip-to-zero",
]);

function parsePixelLength(value: string): number | null {
  const match = /^(-?\d+(?:\.\d+)?)px$/.exec(value);
  if (!match?.[1]) {
    return null;
  }
  return Number.parseFloat(match[1]);
}

function isClippedToZero(style: CSSStyleDeclaration): boolean {
  const clipPath = style.clipPath;
  if (clipPath === "inset(100%)") {
    return true;
  }
  // `clip` is deprecated in favor of `clip-path`, but legacy
  // visually-hidden CSS in the wild still uses it — keep detecting it.
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const clip = style.clip;
  if (clip === "rect(0px, 0px, 0px, 0px)") {
    return true;
  }
  if (clip === "rect(0px 0px 0px 0px)") {
    return true;
  }
  if (clip === "rect(0, 0, 0, 0)") {
    return true;
  }
  return false;
}

interface MatchDetail {
  readonly reason: string;
  readonly details: Readonly<Record<string, string>>;
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
  if (style.position !== "absolute" && style.position !== "fixed") {
    return false;
  }
  if (style.overflow !== "hidden") {
    return false;
  }
  const width = parsePixelLength(style.width);
  const height = parsePixelLength(style.height);
  if (width === null || width > SR_ONLY_MAX_SIZE_PX) {
    return false;
  }
  if (height === null || height > SR_ONLY_MAX_SIZE_PX) {
    return false;
  }
  return true;
}

// True if the element's opacity is currently being animated — either via a
// CSS transition whose property list includes `opacity` (or `all`), or via
// a keyframe animation. Dialogs, popovers, and toasts routinely render at
// opacity:0 for a single frame before transitioning to 1; the subtree
// watcher catches them mid-animation and previously stripped the whole
// subtree before the user ever saw it (#126). Animating opacity is also a
// poor injection carrier: by definition the text will become visible to
// sighted users when the animation completes, so the asymmetry the rule
// defends against doesn't hold.
// Match a single CSS time literal (`0`, `0.5`, `150` …) followed by `s` or
// `ms`. Used to walk a shorthand string and pick out the numeric magnitude;
// the caller decides whether the magnitude is non-zero.
const DURATION_TOKEN_PATTERN = /\b(\d*\.?\d+)(ms|s)\b/g;

function hasNonzeroDuration(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) && numeric > 0;
}

// True if any time literal in the shorthand string has a non-zero magnitude.
// Reject the `transition: opacity 0s` bypass — a zero-duration transition is
// instantaneous, so the text would remain permanently invisible to sighted
// users and is still injection-shaped.
function shorthandHasNonzeroDuration(shorthand: string): boolean {
  DURATION_TOKEN_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null = DURATION_TOKEN_PATTERN.exec(shorthand);
  while (match !== null) {
    if (Number.parseFloat(match[1] ?? "") > 0) {
      return true;
    }
    match = DURATION_TOKEN_PATTERN.exec(shorthand);
  }
  return false;
}

function hasOpacityAnimationInFlight(style: CSSStyleDeclaration): boolean {
  // Production path: real browsers expand the `transition`/`animation`
  // shorthand into the longhand getters, so `transitionProperty` is always
  // populated (default `"all"`) and `transitionDuration` is always `"0s"` for
  // unset transitions. The longhand check is canonical there.
  //
  // The shorthand check is a jsdom-only fallback: jsdom keeps the shorthand
  // verbatim and leaves the longhand getters empty, so `!transitionProperty`
  // distinguishes the test environment from production. Gating the fallback
  // this way means the shorthand parser can never weaken the longhand
  // check — `transition: opacity 0s` in a real browser fails the longhand
  // duration check and the shorthand block is never reached.
  if (style.transitionProperty) {
    if (
      /\b(?:opacity|all)\b/.test(style.transitionProperty) &&
      hasNonzeroDuration(style.transitionDuration)
    ) {
      return true;
    }
  } else if (
    style.transition &&
    /\b(?:opacity|all)\b/.test(style.transition) &&
    shorthandHasNonzeroDuration(style.transition)
  ) {
    return true;
  }

  if (style.animationName && style.animationName !== "none") {
    if (hasNonzeroDuration(style.animationDuration)) {
      return true;
    }
  } else if (
    style.animation &&
    style.animation !== "none" &&
    shorthandHasNonzeroDuration(style.animation)
  ) {
    return true;
  }

  return false;
}

function detectHiddenByCss(
  element: Element,
  style: CSSStyleDeclaration,
): MatchDetail | null {
  if (style.visibility === "hidden" || style.visibility === "collapse") {
    return {
      reason: `visibility-${style.visibility}`,
      details: { visibility: style.visibility },
    };
  }
  if (
    Number.parseFloat(style.opacity) === 0 &&
    !hasOpacityAnimationInFlight(style)
  ) {
    return { reason: "opacity-0", details: { opacity: style.opacity } };
  }
  // `font-size: 0` on a wrapper is the legacy layout trick to collapse
  // whitespace between inline-block children — children override with their
  // own font-size and render normally (Amazon's #nav-belt, #nav-search, and
  // similar use this idiom; matching the wrapper would wipe out the whole
  // top nav). Only treat font-size:0 as hiding text when the element itself
  // owns direct text nodes that would actually be invisible.
  if (style.fontSize === "0px" && hasOwnDirectText(element)) {
    return { reason: "font-size-0", details: { fontSize: style.fontSize } };
  }
  if (style.position === "absolute" || style.position === "fixed") {
    const left = parsePixelLength(style.left);
    if (left !== null && left <= OFFSCREEN_THRESHOLD_PX) {
      return {
        reason: "offscreen-left",
        details: { position: style.position, left: style.left },
      };
    }
    const top = parsePixelLength(style.top);
    if (top !== null && top <= OFFSCREEN_THRESHOLD_PX) {
      return {
        reason: "offscreen-top",
        details: { position: style.position, top: style.top },
      };
    }
  }
  const textIndent = parsePixelLength(style.textIndent);
  if (textIndent !== null && textIndent <= OFFSCREEN_THRESHOLD_PX) {
    return { reason: "text-indent", details: { textIndent: style.textIndent } };
  }
  if (isClippedToZero(style)) {
    return {
      reason: "clip-to-zero",
      details: {
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        clip: style.clip,
        clipPath: style.clipPath,
      },
    };
  }
  return null;
}

function hasNonemptyText(element: Element): boolean {
  return visibleTextContent(element).trim().length > 0;
}

// True if the element itself owns nonempty text node children (not just text
// inside descendants). Used to distinguish a leaf that hides its own text
// from a wrapper whose descendants override the hiding property.
function hasOwnDirectText(element: Element): boolean {
  for (const node of element.childNodes) {
    if (
      node.nodeType === Node.TEXT_NODE &&
      node.textContent !== null &&
      node.textContent.trim().length > 0
    ) {
      return true;
    }
  }
  return false;
}

// sRGB Euclidean distance under which two colors are perceptually
// indistinguishable for normal-weight body text. Calibrated loosely against
// WCAG 2.1's 4.5:1 contrast floor — anything below this is well under the
// "Fail" threshold for AA.
const COLOR_MATCH_DISTANCE = 24;

type RGB = readonly [number, number, number];
type RGBA = readonly [number, number, number, number];

function parseColorViaRegex(value: string): RGBA | null {
  const match =
    /^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i.exec(
      value,
    );
  if (!match?.[1] || !match[2] || !match[3]) {
    return null;
  }
  const r = Number.parseFloat(match[1]);
  const g = Number.parseFloat(match[2]);
  const b = Number.parseFloat(match[3]);
  const a = match[4] === undefined ? 1 : Number.parseFloat(match[4]);
  if ([r, g, b, a].some((n) => Number.isNaN(n))) {
    return null;
  }
  return [r, g, b, a];
}

// One-time-allocated 1×1 canvas for resolving CSS Color Level 4 syntaxes
// (`oklch()`, `lab()`, `color()`, `color-mix()`) that browsers emit
// verbatim in computed style. `getContext` returns null in environments
// without canvas (jsdom by default); callers fall back to the regex
// parser. `undefined` distinguishes "not yet probed" from "probed, no
// context".
let colorProbeContext: CanvasRenderingContext2D | null | undefined;

function getColorProbeContext(): CanvasRenderingContext2D | null {
  if (colorProbeContext !== undefined) {
    return colorProbeContext;
  }
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    colorProbeContext = canvas.getContext("2d", { willReadFrequently: true });
  } catch {
    colorProbeContext = null;
  }
  return colorProbeContext;
}

// Resolve any CSS color syntax through the canvas 2D parser. Two distinct
// sentinels guard against the silent-ignore behavior the spec mandates
// for unparseable values: if `value` is rejected, fillStyle retains the
// most recently-set sentinel under each probe, so the two reads disagree.
// A valid color converges to the same resolved string under either
// sentinel. Once the value is known to parse, we paint a single pixel
// and read it back to recover the alpha channel (which the read-back
// fillStyle string normalizes to opaque for the `#rrggbb` form).
function parseColorViaCanvas(value: string): RGBA | null {
  const context = getColorProbeContext();
  if (!context) {
    return null;
  }
  context.fillStyle = "#1a2b3c";
  context.fillStyle = value;
  const probe1 = context.fillStyle;
  context.fillStyle = "#fedcba";
  context.fillStyle = value;
  const probe2 = context.fillStyle;
  if (probe1 !== probe2) {
    return null;
  }
  try {
    context.clearRect(0, 0, 1, 1);
    context.fillRect(0, 0, 1, 1);
    const pixel = context.getImageData(0, 0, 1, 1).data;
    return [pixel[0] ?? 0, pixel[1] ?? 0, pixel[2] ?? 0, (pixel[3] ?? 0) / 255];
  } catch {
    return null;
  }
}

function parseColor(value: string): RGBA | null {
  return parseColorViaRegex(value) ?? parseColorViaCanvas(value);
}

// Test-only: clear the cached canvas probe so a test that installs a
// mock canvas after the module has already been imported can force a
// fresh probe. Production code never calls this; the canvas is created
// lazily at first parseColor() call and persists for the lifetime of
// the realm.
export function __resetColorProbeForTesting(): void {
  colorProbeContext = undefined;
}

// Effective background color: walk up ancestors and composite the first
// opaque background we find. `transparent` and `rgba(_, _, _, 0)` mean
// "ask my parent." Falls back to white because every browser paints the
// canvas white when nothing intervenes. Returns null when we hit a
// background whose computed value neither the regex parser nor the
// canvas can resolve — walking past an unknown background to a distant
// white ancestor would strip legitimate UI like a colored button with
// white text sitting inside an otherwise-white card.
function effectiveBackgroundColor(element: Element): RGB | null {
  let current: Element | null = element;
  while (current) {
    const style = globalThis.getComputedStyle(current);
    const bg = parseColor(style.backgroundColor);
    if (!bg) {
      return null;
    }
    if (bg[3] >= 0.999) {
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
// don't double-count (those are already caught by detectHiddenByCss).
//
// Gated on direct text nodes for the same reason font-size:0 is: `color`
// inherits and descendants routinely override. A wrapper whose only text
// comes from descendants doesn't render any pixel in the wrapper's own
// color (Amazon's #navbar has color near-black against a dark bg, but the
// visible nav text lives in `<a>` descendants with their own white color
// — matching the wrapper would wipe out the whole top nav).
function detectColorMatch(
  element: Element,
  style: CSSStyleDeclaration,
): MatchDetail | null {
  if (!hasOwnDirectText(element)) {
    return null;
  }
  const fg = parseColor(style.color);
  if (!fg) {
    return null;
  }
  if (fg[3] === 0) {
    return null;
  }
  const bg = effectiveBackgroundColor(element);
  if (!bg) {
    return null;
  }
  const distance = colorDistance([fg[0], fg[1], fg[2]], bg);
  if (distance > COLOR_MATCH_DISTANCE) {
    return null;
  }
  return {
    reason: "color-match",
    details: {
      color: style.color,
      effectiveBg: `rgb(${bg[0]}, ${bg[1]}, ${bg[2]})`,
      distance: distance.toFixed(1),
    },
  };
}

interface Candidate extends MatchDetail {
  readonly element: HTMLElement;
}

function findCandidates(root: ParentNode): Candidate[] {
  const matches: Candidate[] = [];
  for (const element of root.querySelectorAll<HTMLElement>("*")) {
    if (isNonContentTag(element.tagName)) {
      continue;
    }
    if (isInsidePlaceholder(element)) {
      continue;
    }
    if (hasSrOnlyClass(element)) {
      continue;
    }
    if (isExcludedAncestor(element)) {
      continue;
    }
    if (!hasNonemptyText(element)) {
      continue;
    }
    const style = globalThis.getComputedStyle(element);
    if (hasStructuralSrOnlyPattern(style)) {
      continue;
    }
    const match =
      detectHiddenByCss(element, style) ?? detectColorMatch(element, style);
    if (!match) {
      continue;
    }
    // Landmark + aria-hidden subtree allowlists apply only to positional
    // hide reasons (off-screen position, text-indent, clip-to-zero) —
    // the shapes a11y patterns legitimately use to keep content
    // available to assistive tech. visibility:hidden / opacity:0 /
    // color-match inside a landmark or aria-hidden subtree is
    // injection-shaped and gets stripped.
    if (POSITIONAL_HIDE_REASONS.has(match.reason)) {
      if (isLandmark(element)) {
        continue;
      }
      if (element.closest('[aria-hidden="true"]')) {
        continue;
      }
    }
    matches.push({ element, ...match });
  }
  return filterToOutermost(matches, (c) => c.element);
}

const TEXT_PREVIEW_MAX = 80;

function textPreview(text: string): string {
  const normalized = text.trim().replaceAll(/\s+/g, " ");
  return normalized.length > TEXT_PREVIEW_MAX
    ? `${normalized.slice(0, TEXT_PREVIEW_MAX)}…`
    : normalized;
}

function blankDescendantText(element: Element): void {
  // SHOW_TEXT visits Text nodes only, leaving element / comment / processing
  // instruction nodes in place. After this walk every readable character
  // (textContent, innerText, a11y name) under `element` is empty, but the
  // DOM tree structure that the page framework rendered is untouched.
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    const text = current as Text;
    current = walker.nextNode();
    if (text.data.length > 0) {
      text.data = "";
    }
  }
}

function scanAndStrip(root: ParentNode): void {
  for (const candidate of findCandidates(root)) {
    const { element, reason, details } = candidate;
    if (!element.isConnected) {
      continue;
    }
    const visible = visibleTextContent(element);
    log("hidden text scrubbed", {
      ruleId: RULE_ID,
      reason,
      details,
      tag: element.tagName,
      id: element.id || undefined,
      classes: element.className || undefined,
      textLength: visible.length,
      textPreview: textPreview(visible),
    });
    blankDescendantText(element);
  }
}

const watcher = createSubtreeWatcher({
  skipPlaceholderSubtrees: true,
  onSubtrees: (roots) => {
    for (const root of roots) {
      scanAndStrip(root);
    }
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
    'Blank text invisible to humans but readable by agents. Defends against "unseeable" prompt injection; screen-reader-only text is preserved.',
  apply,
  teardown: () => {
    watcher.stop();
  },
} satisfies Rule;
