// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Hide user-generated comment threads (Disqus, Reddit, YouTube, Hacker News,
// etc.) from agents to reduce the prompt-injection surface — commenters are
// untrusted and frequently the entry point for indirect prompt injection.
//
// Site-specific selectors live in extension/data/sites/*.yaml and are compiled
// into site-data.generated.ts by `bun run build-site-data`.

import { createSelectorHideRule } from "../lib/selector-hide-rule";
import { COMMENTS_HIDE_SITE_RULES } from "./site-data.generated";

const { rule, selectorsFor } = createSelectorHideRule({
  id: "comments-hide",
  label: "Hide Comments",
  description:
    "Hide user-generated comment threads (Disqus, Facebook, Reddit, YouTube, Hacker News).",
  hideLabel: "[comment section hidden — click to reveal]",
  // Selectors that ship on many sites (Disqus, Livefyre, Facebook comment
  // plugin embeds, generic WordPress/blog comment markup). Derived from
  // https://github.com/panicsteve/shutup-css/blob/master/shutup.css
  alwaysOnSelectors: [
    "#disqus_thread",
    ".disqus-thread",
    "#livefyre-comments",
    ".livefyre",
    "#fb-comments",
    ".fb-comments",
    "#facebook-comments",
    ".facebook-comments",
    "#comments",
    ".comments",
    ".comment-list",
    ".comments-area",
    "#commentsContainer",
    "#commentList",
    "#respond",
    "#commentBlock",
    "#commentsection",
    "#comment-section",
    ".comment-section",
    "#commentsBlock",
    "#commentsBox",
    "#commentbox",
    ".commentbox",
    "#commentArea",
    "#commentsList",
    "#user-comments",
    ".user-comments",
    "#reader-comments",
    ".reader-comments",
    ".comment-respond",
    "section.comments",
    "section#comments",
    'section[aria-label*="comment" i]',
  ],
  siteRules: COMMENTS_HIDE_SITE_RULES,
  // Comment threads are commonly lazy-loaded — Disqus/Livefyre inject their
  // container after their loader script runs, and Reddit/YouTube hydrate
  // comment trees client-side after the initial document is idle.
  watchSubtrees: true,
});

export { selectorsFor };
export const commentsHideRule = rule;
