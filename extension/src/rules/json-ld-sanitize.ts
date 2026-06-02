// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Sanitize `<script type="application/ld+json">` blocks by stripping any
// string field whose value matches the prompt-injection pattern set.
//
// JSON-LD is invisible to a sighted human reviewing the page but is
// increasingly consumed by browser-use agents as a "trusted summary" of
// what the page is — schema.org/Product gives them name/brand/SKU/price,
// schema.org/Article gives them author/publisher/datePublished, etc. A
// site (or a third-party fragment writing into the page) can poison the
// description, articleBody, name, or author.name field without affecting
// what a human sees in the rendered DOM.
//
// We re-parse, walk every string value recursively, replace matches with
// the empty string, and re-serialize. Structural fields the agent
// actually needs — price, availability, ratingValue, identifier,
// position — are preserved exactly as written. Scripts whose body is
// malformed JSON are left alone (we have no safe transform to apply and
// the agent will not be able to use the data anyway).

import { createSubtreeWatcher } from "../lib/subtree-watcher";
import { INJECTION_PATTERNS } from "./injection-patterns.generated";
import type { Rule } from "./types";

const RULE_ID = "json-ld-sanitize" as const;
const SELECTOR = 'script[type="application/ld+json" i]';

function containsInjection(value: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(value));
}

// Recursively sanitize a parsed JSON-LD value. Returns true if any string
// was modified, so the caller can skip the re-serialize round-trip when
// nothing changed.
function sanitize(node: unknown, mutated: { value: boolean }): unknown {
  if (typeof node === "string") {
    if (containsInjection(node)) {
      mutated.value = true;
      return "";
    }
    return node;
  }
  if (Array.isArray(node)) {
    return node.map((item) => sanitize(item, mutated));
  }
  if (node !== null && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      out[key] = sanitize(value, mutated);
    }
    return out;
  }
  // numbers / booleans / null pass through untouched.
  return node;
}

function processScript(script: HTMLScriptElement): void {
  const raw = script.textContent;
  if (raw.trim() === "") {
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Malformed JSON-LD is unusable to schema.org consumers; leave it
    // alone rather than risk a transform that masks the original syntax.
    return;
  }
  const mutated = { value: false };
  const sanitized = sanitize(parsed, mutated);
  if (mutated.value) {
    script.textContent = JSON.stringify(sanitized);
  }
}

function processRoot(root: ParentNode): void {
  // querySelectorAll skips the root itself; handle the case where a
  // watcher hands us a script element directly.
  if (
    root.nodeType === Node.ELEMENT_NODE &&
    (root as Element).matches(SELECTOR)
  ) {
    processScript(root as HTMLScriptElement);
    return;
  }
  for (const script of root.querySelectorAll<HTMLScriptElement>(SELECTOR)) {
    processScript(script);
  }
}

const watcher = createSubtreeWatcher({
  onSubtrees: (roots) => {
    for (const root of roots) {
      processRoot(root);
    }
  },
});

function apply(root: ParentNode): void {
  processRoot(root);
  watcher.start(root);
}

export const jsonLdSanitizeRule = {
  id: RULE_ID,
  label: "Sanitize JSON-LD",
  description:
    "Strip prompt-injection text from JSON-LD structured data while preserving price, rating, and other useful fields.",
  apply,
  teardown: () => {
    watcher.stop();
  },
} satisfies Rule;
