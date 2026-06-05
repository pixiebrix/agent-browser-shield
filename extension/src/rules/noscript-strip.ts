// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Blank the contents of `<noscript>` elements on the page.
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
// We clear the `<noscript>`'s children rather than detaching the element
// itself. Frameworks that rendered the noscript (React, Vue, Svelte) hold
// a live reference to it and reach for it during unmount or partial swap;
// removing the node out from under them throws inside their commit phase
// and strands the route. An emptied noscript is just as opaque to an agent
// walking textContent / the a11y tree as a missing one.
//
// `html-comment-strip` deliberately preserves Comment nodes *inside*
// noscript because those may carry functional markup (SSR hydration
// markers, conditional-CSS fragments). Blanking the noscript here clears
// those comments alongside everything else — intended, since their
// preservation only mattered while the noscript still had readable
// fallback content for an agent to misread.
//
// The scrub is not reversible within the current page load; toggling the
// rule off requires a reload to recover the original fallback markup.

import { createSubtreeWatcher } from "../lib/subtree-watcher";
import type { Rule } from "./types";

const RULE_ID = "noscript-strip" as const;

function blankNoscript(element: Element): void {
  // Already cleared — skip to keep `apply` idempotent.
  if (element.firstChild === null) {
    return;
  }
  element.textContent = "";
}

function stripNoscript(root: ParentNode): void {
  // A watcher subtree may BE a `<noscript>`, CONTAIN one, or be a
  // descendant of one we already blanked (e.g., a framework re-rendered
  // children into a kept noscript). `closest()` handles self/ancestor;
  // `querySelectorAll` handles descendants.
  if (root.nodeType === Node.ELEMENT_NODE) {
    const ancestorOrSelf = (root as Element).closest("noscript");
    if (ancestorOrSelf) {
      blankNoscript(ancestorOrSelf);
      return;
    }
  }
  for (const element of root.querySelectorAll("noscript")) {
    blankNoscript(element);
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
    "Blank <noscript> fallback markup. Never rendered when JS is on, but still readable by agents.",
  apply,
  teardown: () => {
    watcher.stop();
  },
} satisfies Rule;
