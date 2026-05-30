// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Screen-reader-only presentation primitives shared between rules.
//
// Two pieces have to agree:
//
//   1. `search-url-helper` stamps its URL-recipe landmark with these styles
//      so the landmark is invisible to sighted users but readable to
//      assistive tech and DOM-walking agents.
//   2. `hidden-text-strip` PRESERVES anything matching this envelope so it
//      doesn't accidentally strip the helper landmark (or every Amazon SERP
//      price, which uses the same shape via `a-offscreen`).
//
// They're load-bearing for each other: if either definition drifts, the
// helper rule's landmark gets ripped out by the strip rule. Define the
// envelope shape (position:absolute + 1×1 + overflow:hidden) in one place.

// Max width/height in px for an element to count as the structural SR-only
// envelope. The W3C/MDN idiom collapses bodies to ≤1px; we allow a sliver
// of slack for sub-pixel rounding.
export const SR_ONLY_MAX_SIZE_PX = 2;

// Inline CSS that produces the canonical SR-only envelope. Applied to the
// `search-url-helper` landmark so it stays hidden even on sites that don't
// ship a `.sr-only` stylesheet rule. Anything matching the same shape is
// preserved by `hidden-text-strip`.
export const SR_ONLY_INLINE_STYLE: Partial<CSSStyleDeclaration> = {
  position: "absolute",
  width: "1px",
  height: "1px",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
  border: "0",
  padding: "0",
  margin: "-1px",
};

// Conventional class-name hints. Frameworks that emit auto-generated names
// fall through to the structural-envelope check.
export const SR_ONLY_CLASS_NAMES: ReadonlySet<string> = new Set([
  "sr-only",
  "visually-hidden",
  "screen-reader-text",
  "u-visuallyHidden",
  // Amazon's SR-only spans. `a-offscreen` carries every visible price on
  // every SERP and PDP; `aok-offscreen` carries accessible labels like
  // "Price, product page". Both ship with envelopes whose exact computed
  // style varies between A/B variants, so the class-name allowlist is the
  // load-bearing preservation signal.
  "a-offscreen",
  "aok-offscreen",
]);
