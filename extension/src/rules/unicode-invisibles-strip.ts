// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Strip Unicode characters that are invisible (or visually inert) to a
// sighted human but are still read by browser-use agents walking the DOM /
// accessibility tree. These code points are abused to smuggle instructions
// past humans who review the page: characters from the Unicode Tags block
// encode arbitrary ASCII steganographically, bidi override/isolate marks
// reorder displayed text away from its logical (agent-read) order, and the
// zero-width family ferries text that has no glyph at all.
//
// We strip rather than annotate because there is no legitimate reason for
// these code points to appear in user-facing page text on the modern web.
// Code points with real script-shaping use are preserved:
//
//   - U+200C ZWNJ — Persian/Hindi ligature control
//   - U+200D ZWJ — emoji ZWJ sequences (families, flags, professions) and
//     Indic script joining
//   - U+200E LRM / U+200F RLM — directional marks routinely embedded in
//     bidirectional text; do not reorder evident characters
//
// Removal applies to text nodes everywhere except SCRIPT/STYLE/NOSCRIPT/
// TEMPLATE (handled by `walkTextNodes`) and to every attribute value on
// every element — the a11y tree pulls from `aria-label`, `alt`, `title`,
// `placeholder`, etc., so attributes are an equally unguarded surface. A
// MutationObserver re-runs on lazily injected subtrees.

import { walkTextNodes } from "../lib/dom-utils";
import { createSubtreeWatcher } from "../lib/subtree-watcher";
import type { Rule } from "./types";

const RULE_ID = "unicode-invisibles-strip" as const;

// Code points stripped (regex written with explicit \u{} escapes so the
// source file itself contains no invisible characters):
//   U+180E              MONGOLIAN VOWEL SEPARATOR (deprecated, zero-width)
//   U+200B              ZERO WIDTH SPACE
//   U+202A–U+202E       bidi embedding/override (LRE, RLE, PDF, LRO, RLO)
//   U+2060              WORD JOINER
//   U+2061–U+2064       invisible math operators
//   U+2066–U+2069       bidi isolates (LRI, RLI, FSI, PDI)
//   U+FEFF              ZERO WIDTH NO-BREAK SPACE / BOM
//   U+E0000–U+E007F     Tags block (steganographic ASCII carrier)
const INVISIBLES_RE =
  /[\u{180E}\u{200B}\u{202A}-\u{202E}\u{2060}-\u{2064}\u{2066}-\u{2069}\u{FEFF}\u{E0000}-\u{E007F}]/gu;

function strip(value: string): string {
  return value.replaceAll(INVISIBLES_RE, "");
}

function scrubTextNodes(root: ParentNode): void {
  for (const node of walkTextNodes(root)) {
    const original = node.nodeValue;
    if (original === null) {
      continue;
    }
    const cleaned = strip(original);
    if (cleaned !== original) {
      node.nodeValue = cleaned;
    }
  }
}

function scrubAttributes(root: ParentNode): void {
  // querySelectorAll on a non-Element root (Document) still walks its
  // descendants; `*` skips Comment/Text nodes which have no attributes.
  for (const element of root.querySelectorAll("*")) {
    // Element.attributes is a live NamedNodeMap; snapshot before mutating.
    const attributes = [...element.attributes];
    for (const attribute of attributes) {
      const cleaned = strip(attribute.value);
      if (cleaned !== attribute.value) {
        element.setAttribute(attribute.name, cleaned);
      }
    }
  }
}

function scrub(root: ParentNode): void {
  scrubTextNodes(root);
  scrubAttributes(root);
}

const watcher = createSubtreeWatcher({
  skipPlaceholderSubtrees: true,
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

export const unicodeInvisiblesStripRule = {
  id: RULE_ID,
  label: "Strip Unicode Invisibles",
  description:
    "Remove Unicode tag, bidi-override, and zero-width characters that are invisible to humans but readable by agents.",
  apply,
  teardown: () => {
    watcher.stop();
  },
} satisfies Rule;
