// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Single source of truth for every `data-abs-*` DOM attribute the extension
// writes onto pages. Every marker the engine or any rule stamps on a node
// must be declared here and imported — the ESLint rule
// `no-restricted-syntax/data-abs-literal` (scoped in `eslint.config.js`)
// blocks raw `"data-abs-…"` string literals outside this file so new rules
// can't accidentally collide on a name or drift from the convention.
//
// Naming: engine-level markers are `<PURPOSE>_ATTR`; per-rule markers are
// `<RULE>_<PURPOSE>_ATTR`. Keep the literal prefix `data-abs-` consistent.

// Engine-level — set by the placeholder/runtime machinery, read by rules.

// Names the rule responsible for a placeholder element. Set on every
// placeholder the engine emits; rules read it via `attachReveal` to thread
// the original target back through user reveal clicks.
export const RULE_ATTR = "data-abs-rule";

// Stamped onto the original element after the user clicks to reveal a
// placeholder, so a rule's subtree watcher doesn't immediately re-hide it
// on the next scan.
export const REVEALED_ATTR = "data-abs-revealed";

// Stamped onto elements hidden in-place via display:none (removeEntirely
// rules). We don't detach the node because doing so breaks React's fiber
// when it tries to reconcile siblings — the original stays in the DOM,
// just non-rendering. The attribute lets the rule skip re-processing it.
export const HIDDEN_ATTR = "data-abs-hidden";

// Set by the engine on placeholder containers to record which display mode
// (`inline` / `block`) they were emitted in, so post-render adjustments can
// re-render against the right shape.
export const PLACEHOLDER_MODE_ATTR = "data-abs-placeholder-mode";

// Stamped by `placeholder.ts` on each placeholder when the experimental
// adaptive-palette toggle is on and the surrounding background sampled as
// dark. The placeholder stylesheet reads it as `[data-abs-placeholder-
// palette="dark"]` to swap the stripe / chip palette. Absent when the toggle
// is off or the background sampled light.
export const PLACEHOLDER_PALETTE_ATTR = "data-abs-placeholder-palette";

// Per-rule — set by exactly one rule's `apply` and read by its watcher /
// teardown. Add new entries here when a new rule needs an attribute marker.

// `checkout-checkbox-sanitize`: marks checkboxes the rule has unchecked so the
// next scan doesn't re-process them.
export const CHECKOUT_CHECKBOX_CLEARED_ATTR = "data-abs-cleared";

// `cart-addon-annotate`: marks the wrapper of a sneaky add-on item the rule has
// already badged, so the watcher doesn't double-badge on re-scan.
export const CART_ADDON_ANNOTATED_ATTR = "data-abs-cart-addon-annotated";

// `hidden-fee-annotate`: marks a drip-pricing fee row the rule has already
// badged so the watcher doesn't append a second chip on the next mutation
// pass. Also stamped on labels that were rejected by the shape gates so
// re-scans don't re-evaluate the same negative case on every burst.
export const HIDDEN_FEE_ANNOTATED_ATTR = "data-abs-hidden-fee-annotated";

// `link-spoof-annotate`: marks an <a> the rule has badged so the watcher
// doesn't append a second chip on the next mutation pass.
export const LINK_SPOOF_ANNOTATED_ATTR = "data-abs-link-spoof-annotated";

// `trust-badge-annotate`: marks an image-shaped trust badge the rule has
// already annotated so the watcher doesn't append a second chip on
// re-scan.
export const TRUST_BADGE_ANNOTATED_ATTR = "data-abs-trust-badge-annotated";

// `disguised-ad-flag`: marks a label element that the rule has already
// considered and rejected (no article-shaped ancestor, in a filter chip,
// inside an existing ad-hide region, etc.), so subtree-watcher re-scans
// don't re-evaluate the same negative case on every mutation burst.
export const DISGUISED_AD_FLAG_CONSIDERED_ATTR =
  "data-abs-disguised-ad-considered";

// `confirmshame-sanitize`: stores the original copy of attributes the
// rule rewrites so reveal-on-click can restore the user-visible
// confirmshame language.
export const CONFIRMSHAME_ORIGINAL_TEXT_ATTR =
  "data-abs-confirmshame-orig-text";
export const CONFIRMSHAME_ORIGINAL_VALUE_ATTR =
  "data-abs-confirmshame-orig-value";
export const CONFIRMSHAME_ORIGINAL_ARIA_ATTR =
  "data-abs-confirmshame-orig-aria";
export const CONFIRMSHAME_ORIGINAL_TITLE_ATTR =
  "data-abs-confirmshame-orig-title";

// `form-prefill-annotate`: marks a form control (or its annotation target —
// wrapper, label, fieldset, submit row) that the rule has already badged so
// the watcher doesn't append a second chip on the next mutation pass. Also
// stamped on controls that were considered and rejected by the FP-control
// gates so re-scans skip them on every burst.
export const FORM_PREFILL_ANNOTATED_ATTR = "data-abs-form-prefill-annotated";

// `hidden-affiliate-sanitize`: marks a hidden input whose value the rule has
// already cleared (or considered and rejected via denylist / per-host kill-
// switch). Stamped on both outcomes so re-scans don't re-evaluate the same
// node every mutation burst, and so a later page-script value-write doesn't
// drive an infinite re-clear loop.
export const HIDDEN_AFFILIATE_CLEARED_ATTR =
  "data-abs-hidden-affiliate-cleared";

// `schema-trust-sanitize`: stamped on a microdata Person scope (and added as
// the JSON-LD key `abs:unverified-authority` on the corresponding object) when
// the Person carries borrowed organizational authority — i.e. it is the value
// of an `author` / `editor` / `publisher` / similar property — and its `url`
// resolves to a different registrable domain than the page. We annotate
// rather than blank because legitimate guest-author and academic bylines
// routinely link off-domain; sanitizing those would erase real metadata. The
// marker is the same domain-binding warning the Organization-typed path
// communicates by blanking, surfaced through structured data only (these
// nodes have no visible carrier, so a chip wouldn't reach an agent reading
// JSON-LD).
export const SCHEMA_TRUST_UNVERIFIED_ATTR = "data-abs-schema-trust-unverified";
