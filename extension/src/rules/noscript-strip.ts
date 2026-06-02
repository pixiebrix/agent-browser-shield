// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Remove <noscript> elements from the page.
//
// `<noscript>` content is, by definition, the fallback rendered only when
// JavaScript is disabled. A browser-use agent is in a browser at all
// precisely because JS is required to use the site (otherwise the operator
// would scrape the server directly). The page the agent actually sees is
// the JS-rendered one; the `<noscript>` block is markup nobody renders to
// the human reviewing the run — but it is still in the DOM, still walked
// by accessibility-tree and `innerText` consumers, and still a clean
// carrier for prompt-injection payloads, fake authority claims, or
// markdown-style chrome the agent may treat as load-bearing.
//
// `html-comment-strip` deliberately preserves Comment nodes *inside*
// noscript because those may carry functional markup (SSR hydration
// markers, conditional-CSS fragments). With this rule on, the surrounding
// noscript element is removed outright, which removes any such comments
// alongside it — intended, since their preservation only mattered while
// the noscript itself remained.
//
// Removal is not reversible within the current page load; toggling the
// rule off requires a reload.

import { createSubtreeWatcher } from "../lib/subtree-watcher";
import type { Rule } from "./types";

const RULE_ID = "noscript-strip" as const;

function stripNoscript(root: ParentNode): void {
  // querySelectorAll returns a static NodeList, so removing each element
  // during iteration is safe. We grab from the root rather than rely on
  // root.querySelectorAll('noscript') alone because a watcher subtree may
  // *be* a noscript element rather than contain one.
  if (
    root.nodeType === Node.ELEMENT_NODE &&
    (root as Element).tagName === "NOSCRIPT"
  ) {
    (root as Element).remove();
    return;
  }
  for (const element of root.querySelectorAll("noscript")) {
    element.remove();
  }
}

const watcher = createSubtreeWatcher({
  onSubtrees: (roots) => {
    for (const root of roots) {
      stripNoscript(root);
    }
  },
});

function apply(root: ParentNode): void {
  stripNoscript(root);
  watcher.start(root);
}

export const noscriptStripRule = {
  id: RULE_ID,
  label: "Strip Noscript",
  description:
    "Remove <noscript> fallback markup. Never rendered when JS is on, but still readable by agents.",
  apply,
  teardown: () => {
    watcher.stop();
  },
} satisfies Rule;
