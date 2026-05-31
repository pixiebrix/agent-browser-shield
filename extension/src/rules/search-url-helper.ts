// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Embed a short URL-recipe note into the accessibility tree on covered
// hosts so browser-use agents can navigate by URL (search, filter, sort,
// direct lookup) instead of typing into search boxes and clicking facet
// chips. The note is screen-reader-only — no visible affordance — and is
// preserved by `hidden-text-strip` via both the `sr-only` class allowlist
// and the 1×1 + overflow:hidden + position:absolute envelope.
//
// Recipes are authored from the pixiebrix/url-specs corpus
// (https://github.com/pixiebrix/url-specs/tree/main/src/specs) for sites
// that have a spec, and from direct observation for sites that don't
// (MDN, npm, weather.gov, arXiv, python-docs, BBC, REI). They live in
// extension/data/sites/*.yaml and are compiled into site-data.generated.ts
// by `bun run build-site-data`.

import { log } from "../lib/log";
import { RULE_ATTR } from "../lib/placeholder";
import { SR_ONLY_INLINE_STYLE } from "../lib/sr-only";
import { SEARCH_URL_HELPER_RECIPES } from "./site-data.generated";
import type { Rule } from "./types";

const RULE_ID = "search-url-helper" as const;

const LANDMARK_SELECTOR = `section[${RULE_ATTR}="${RULE_ID}"]`;

function findRecipe(url: string): string | null {
  for (const { patterns, recipe } of SEARCH_URL_HELPER_RECIPES) {
    if (patterns.some((pattern) => pattern.test(url))) return recipe;
  }
  return null;
}

function buildLandmark(recipe: string): HTMLElement {
  const note = document.createElement("section");
  note.setAttribute("role", "note");
  note.setAttribute("aria-label", "abs URL helper");
  note.setAttribute(RULE_ATTR, RULE_ID);
  // Class-based preservation signal for hidden-text-strip; the inline
  // envelope below is the structural fallback. Either signal alone is
  // enough; both together survive future tightening of the allowlist.
  note.className = "sr-only";
  Object.assign(note.style, SR_ONLY_INLINE_STYLE);
  note.textContent = recipe;
  return note;
}

function apply(_root: ParentNode): void {
  const recipe = findRecipe(globalThis.location.href);
  if (recipe === null) return;
  // Idempotent: a previous apply (initial pass, re-enable from the
  // options page, or rule-engine re-fire on history navigation) may
  // already have inserted the landmark.
  if (document.querySelector(LANDMARK_SELECTOR)) return;
  // The engine passes document.body, but we always inject at body level
  // (regardless of which subtree root was handed in) so the landmark is
  // the first element of <body> at the top of the a11y tree.
  document.body.prepend(buildLandmark(recipe));
  log("search-url-helper applied", {
    host: globalThis.location.hostname,
    recipeLength: recipe.length,
  });
}

function teardown(): void {
  for (const node of document.querySelectorAll(LANDMARK_SELECTOR)) {
    node.remove();
  }
}

export const searchUrlHelperRule = {
  id: RULE_ID,
  label: "Embed Search URL Recipes",
  description:
    "On covered hosts, embed a screen-reader-only landmark describing how to run searches and filters by URL, so agents can navigate by URL instead of clicking through search UI.",
  defaultEnabled: true,
  // Recipes are URL navigation hints for the page the agent is viewing —
  // the top-level URL — not for whatever third-party content happens to be
  // iframed in. Injecting a landmark into every same-origin iframe would
  // pollute their a11y trees with off-topic instructions.
  topFrameOnly: true,
  apply,
  teardown,
} satisfies Rule;

export { findRecipe };
