// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Strip prompt-injection text from accessibility and rendered content inside
// in-page SVG: `<title>` (accessible name), `<desc>` (long description), and
// `<text>` (rendered glyphs). SVG appears in logos, infographics, charts, and
// inline icons — surfaces agents read for "what is this image?" and that
// operators can author without touching surrounding HTML. `svg-sprite-strip`
// covers only unused sprite-shaped containers; SVGs that render visually
// remain a carrier for instruction-shaped text otherwise.
//
// On a match we blank the element's text content rather than remove the
// element: `<text>` is part of the visible drawing and dropping it can shift
// other geometry, and `<title>` / `<desc>` are anchored to specific shapes for
// accessibility-tree consumers — keeping the element shell preserves the
// structural mapping while the payload is gone.

import { createSubtreeWatcher } from "../lib/subtree-watcher";
import { traceMutation } from "../lib/trace-mutation";
import { INJECTION_PATTERNS } from "./injection-patterns.generated";
import type { Rule } from "./types";

const RULE_ID = "svg-text-strip" as const;
const SVG_TEXT_SELECTOR = "svg title, svg desc, svg text";

function containsInjection(value: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(value));
}

function scrub(element: Element): void {
  const text = element.textContent;
  if (text.length > 0 && containsInjection(text)) {
    traceMutation({ ruleId: RULE_ID, kind: "strip", target: element }, () => {
      element.textContent = "";
    });
  }
}

function scan(root: ParentNode): void {
  for (const element of root.querySelectorAll(SVG_TEXT_SELECTOR)) {
    scrub(element);
  }
}

const watcher = createSubtreeWatcher({
  onSubtrees: (roots) => {
    for (const root of roots) {
      scan(root);
    }
  },
});

function apply(root: ParentNode): void {
  scan(root);
  watcher.start(root);
}

export const svgTextStripRule = {
  id: RULE_ID,
  label: "Strip SVG Injection",
  description:
    "Clear injection-shaped text inside <svg> <title>, <desc>, and <text> elements.",
  apply,
  teardown: () => {
    watcher.stop();
  },
} satisfies Rule;
