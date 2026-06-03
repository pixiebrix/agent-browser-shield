// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Hide user-generated review content from agents to reduce the prompt-injection
// surface. Aggregate ratings (e.g. "4.1 out of 5, 8 ratings") are kept visible
// where they can be cleanly separated from review text.
//
// Site-specific selectors live in extension/data/sites/*.yaml and are compiled
// into site-data.generated.ts by `bun run build-site-data`.

import { createSelectorHideRule } from "../lib/selector-hide-rule";
import { REVIEWS_REDACT_SITE_RULES } from "./site-data.generated";

const { rule, selectorsFor } = createSelectorHideRule({
  id: "reviews-redact",
  label: "Hide Reviews",
  description:
    "Hide user-generated review text. Aggregate star ratings stay visible.",
  hideLabel: "[review section hidden — click to reveal]",
  // schema.org/Review marks UGC. schema.org/AggregateRating is the summary
  // node (count + average) and is left visible — sites like Costco render the
  // inline near-title star widget as a standalone AggregateRating with no
  // sibling Review nodes, and hiding it would strip a non-UGC rating summary.
  alwaysOnSelectors: ['[itemtype*="schema.org/Review"]'],
  siteRules: REVIEWS_REDACT_SITE_RULES,
  // Reviews sections on PDPs are routinely lazy-loaded — fetched on tab click,
  // scrolled into view, or rendered through a Suspense boundary that hydrates
  // after document_idle. Subtree watching picks up the late mount.
  watchSubtrees: true,
});

export { selectorsFor };
export const reviewsRedactRule = rule;
