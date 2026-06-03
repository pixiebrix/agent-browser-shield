// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Apply the prompt-injection pattern set to a small allowlist of
// agent-readable element attributes. Sighted users typically don't see
// these strings — `aria-label`, `aria-description`, `title`,
// `placeholder`, `alt`, and `data-tooltip` surface in screen readers,
// hover popups, or empty-state hints, not as the main visible label.
// Browser-use agents, in contrast, read the accessibility tree where
// these values are first-class names and descriptions for every
// element. That asymmetry makes attributes a clean carrier for
// instruction-shaped text the page operator never has to render.
//
// We also scrub `value` on disabled `<input>` elements: those values
// are rendered to humans (and so generally honest), but a disabled
// input cannot be edited, which is the exact shape an adversarial page
// would use to plant a "pre-confirmed" instruction that the agent
// treats as load-bearing while the user has no chance to clear it.
//
// On a match we remove the whole attribute rather than blanking its
// value. An empty `aria-label` actively hides an element from
// accessibility-tree consumers (which is worse than no aria-label,
// where fallback name computation kicks in); removing the attribute
// lets the normal name calculation proceed. Same logic applies to
// `title` and `alt`.

import { createSubtreeWatcher } from "../lib/subtree-watcher";
import { INJECTION_PATTERNS } from "./injection-patterns.generated";
import type { Rule } from "./types";

const RULE_ID = "attribute-injection-sanitize" as const;

const CANDIDATE_ATTRIBUTES = [
  "aria-label",
  "aria-description",
  "alt",
  "title",
  "placeholder",
  "data-tooltip",
] as const;

// Built once so the per-element loop is a single querySelectorAll call;
// keeps the rule cheap on lazy-injected subtrees.
const ATTRIBUTE_SELECTOR = [
  ...CANDIDATE_ATTRIBUTES.map((name) => `[${name}]`),
  "input[disabled][value]",
].join(",");

function containsInjection(value: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(value));
}

function scrubElement(element: Element): void {
  for (const name of CANDIDATE_ATTRIBUTES) {
    const value = element.getAttribute(name);
    if (value !== null && containsInjection(value)) {
      element.removeAttribute(name);
    }
  }
  if (
    element.tagName === "INPUT" &&
    element.hasAttribute("disabled") &&
    element.hasAttribute("value")
  ) {
    const value = element.getAttribute("value");
    if (value !== null && containsInjection(value)) {
      element.removeAttribute("value");
    }
  }
}

function scrub(root: ParentNode): void {
  if (root.nodeType === Node.ELEMENT_NODE) {
    scrubElement(root as Element);
  }
  for (const element of root.querySelectorAll(ATTRIBUTE_SELECTOR)) {
    scrubElement(element);
  }
}

const watcher = createSubtreeWatcher({
  onSubtrees: (roots) => {
    for (const root of roots) {
      scrub(root);
    }
  },
});

function apply(root: ParentNode): void {
  scrub(root);
  watcher.start(root);
}

export const attributeInjectionSanitizeRule = {
  id: RULE_ID,
  label: "Scrub Attribute Injection",
  description:
    "Remove aria-label, alt, title, placeholder, and similar attributes carrying prompt-injection text.",
  apply,
  teardown: () => {
    watcher.stop();
  },
} satisfies Rule;
