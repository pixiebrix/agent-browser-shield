// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Strip prompt-injection content from page metadata: `<meta>` tags with a
// `content` attribute and the document `<title>`. Many browser-use agents
// pull these first as a compact summary of "what this page is" — name,
// description, social-card text — so a poisoned `<meta name="description">`
// or `<meta property="og:description">` reaches the agent without ever
// appearing in the rendered page body.
//
// On a match we remove the whole `<meta>` element (a meta tag with no
// content is useless and the agent should fall through to other signals)
// and blank the `<title>` text content (kept as an element so callers that
// read `document.title` get an empty string rather than the original
// payload). We do not gate on specific `name=` / `property=` values: any
// meta content that matches the prompt-injection pattern set is removed.
//
// Coverage extends to `document.head`, not just the engine's `apply` root
// (typically `document.body`), since meta and title elements normally live
// in `<head>` and SPA frameworks (React 19's native metadata hoisting,
// react-helmet, etc.) mutate `<head>` on route changes.

import { createSubtreeWatcher } from "../lib/subtree-watcher";
import { INJECTION_PATTERNS } from "./injection-patterns.generated";
import type { Rule } from "./types";

const RULE_ID = "meta-injection-strip" as const;
const META_SELECTOR = "meta[content]";
const TITLE_SELECTOR = "title";

function containsInjection(value: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(value));
}

function scrubMeta(element: Element): void {
  const content = element.getAttribute("content");
  if (content !== null && containsInjection(content)) {
    element.remove();
  }
}

function scrubTitle(element: Element): void {
  const text = element.textContent;
  if (text.length > 0 && containsInjection(text)) {
    element.textContent = "";
  }
}

function scrub(root: ParentNode): void {
  if (root.nodeType === Node.ELEMENT_NODE) {
    const element = root as Element;
    if (element.tagName === "META" && element.hasAttribute("content")) {
      scrubMeta(element);
    } else if (element.tagName === "TITLE") {
      scrubTitle(element);
    }
  }
  for (const element of root.querySelectorAll(META_SELECTOR)) {
    scrubMeta(element);
  }
  for (const element of root.querySelectorAll(TITLE_SELECTOR)) {
    scrubTitle(element);
  }
}

const bodyWatcher = createSubtreeWatcher({
  onSubtrees: (roots) => {
    for (const root of roots) {
      scrub(root);
    }
  },
});

const headWatcher = createSubtreeWatcher({
  onSubtrees: (roots) => {
    for (const root of roots) {
      scrub(root);
    }
  },
});

function apply(root: ParentNode): void {
  scrub(root);
  if (root !== document.head) {
    scrub(document.head);
  }
  bodyWatcher.start(root);
  headWatcher.start(document.head);
}

export const metaInjectionStripRule = {
  id: RULE_ID,
  label: "Strip Meta Injection",
  description:
    "Remove <meta> tags and clear <title> text whose content carries prompt-injection patterns.",
  apply,
  teardown: () => {
    bodyWatcher.stop();
    headWatcher.stop();
  },
} satisfies Rule;
