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

// Per-rule — set by exactly one rule's `apply` and read by its watcher /
// teardown. Add new entries here when a new rule needs an attribute marker.

// `checkout-checkbox-sanitize`: marks checkboxes the rule has unchecked so the
// next scan doesn't re-process them.
export const CHECKOUT_CHECKBOX_CLEARED_ATTR = "data-abs-cleared";

// `cart-addon-annotate`: marks the wrapper of a sneaky add-on item the rule has
// already badged, so the watcher doesn't double-badge on re-scan.
export const CART_ADDON_ANNOTATED_ATTR = "data-abs-cart-addon-annotated";

// `link-spoof-annotate`: marks an <a> the rule has badged so the watcher
// doesn't append a second chip on the next mutation pass.
export const LINK_SPOOF_ANNOTATED_ATTR = "data-abs-link-spoof-annotated";

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
