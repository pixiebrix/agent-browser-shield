// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Hide page sections containing phrases commonly used in prompt-injection
// attacks (instruction overrides, jailbreak personas, chat-template tokens).
// Regex-based heuristic for v1; an ML-based classifier is planned to replace
// this once we can afford the latency budget.
//
// Pattern sources live base64-encoded in `data/injection-patterns.yaml` so
// coding agents browsing this repo don't have to scan literal adversarial
// phrasing; codegen decodes them at build time into
// `injection-patterns.generated.ts`, which is what we import here. The
// shipped extension bundle therefore contains plaintext regexes, not
// `atob` decoding (matters for Chrome Web Store review).

import {
  filterToOutermost,
  isInsidePlaceholder,
  walkTextNodes,
} from "../lib/dom-utils";
import { replaceWithBlockPlaceholder } from "../lib/placeholder";
import { INJECTION_PATTERNS } from "./injection-patterns.generated";
import type { Rule } from "./types";

const RULE_ID = "prompt-injection-hide" as const;
const MIN_TEXT_LENGTH = 8;

// Containers we consider a reasonable unit to hide. Walking up from the text
// node, we hide the closest matching ancestor — this keeps the placeholder
// scoped to the offending paragraph/list-item rather than the whole page.
const BLOCK_CONTAINER_SELECTOR =
  "p, li, blockquote, pre, td, dd, article, aside, section";

function containsInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

function findContainer(textNode: Text): HTMLElement | null {
  const parent = textNode.parentElement;
  if (!parent) return null;
  const block = parent.closest<HTMLElement>(BLOCK_CONTAINER_SELECTOR);
  if (block) return block;
  // No block-level ancestor — fall back to the text node's direct parent,
  // but never escalate to BODY/HTML (would hide the whole page).
  if (parent.tagName === "BODY" || parent.tagName === "HTML") return null;
  return parent;
}

function apply(root: ParentNode): void {
  const containers = new Set<HTMLElement>();
  for (const node of walkTextNodes(root, { minLength: MIN_TEXT_LENGTH })) {
    if (!containsInjection(node.nodeValue ?? "")) continue;
    const container = findContainer(node);
    if (container) containers.add(container);
  }

  for (const element of filterToOutermost(Array.from(containers))) {
    if (!element.isConnected) continue;
    if (isInsidePlaceholder(element)) continue;
    replaceWithBlockPlaceholder(
      element,
      RULE_ID,
      "[possible prompt injection hidden — click to reveal]",
    );
  }
}

export const promptInjectionHideRule = {
  id: RULE_ID,
  label: "Hide Prompt Injection",
  description:
    "Hide page sections containing phrases common in prompt-injection attacks.",
  defaultEnabled: true,
  apply,
} satisfies Rule;
