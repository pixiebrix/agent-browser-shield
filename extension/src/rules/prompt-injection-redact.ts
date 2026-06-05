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

import { ReusableAbortController } from "abort-utils";
import { REVEALED_ATTR } from "../lib/dom-markers";
import { filterToOutermost, isInsidePlaceholder } from "../lib/dom-utils";
import { replaceWithBlockPlaceholder } from "../lib/placeholder";
import { subscribeRouteChange } from "../lib/route-change";
import { walkTextNodesChunked } from "../lib/yielding-text-walk";
import { INJECTION_PATTERNS } from "./injection-patterns.generated";
import type { Rule } from "./types";

const RULE_ID = "prompt-injection-redact" as const;
const REVEALED_SELECTOR = `[${REVEALED_ATTR}="${RULE_ID}"]`;
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
  if (!parent) {
    return null;
  }
  const block = parent.closest<HTMLElement>(BLOCK_CONTAINER_SELECTOR);
  if (block) {
    return block;
  }
  // No block-level ancestor — fall back to the text node's direct parent,
  // but never escalate to BODY/HTML (would hide the whole page).
  if (parent.tagName === "BODY" || parent.tagName === "HTML") {
    return null;
  }
  return parent;
}

// Lifecycle controller cancels in-flight scans when an SPA route swap
// arrives so the post-route apply doesn't compete with the pre-route
// walk on the new tree. Teardown aborts and unsubscribes.
const lifecycle = new ReusableAbortController();
let unsubscribeRouteChange: (() => void) | null = null;

function scanAndMask(root: ParentNode): void {
  const signal = lifecycle.signal;
  const containers = new Set<HTMLElement>();
  walkTextNodesChunked(root, {
    signal,
    minLength: MIN_TEXT_LENGTH,
    // SVG <title>/<desc>/<text> are the injection carriers inside
    // SVG, and `svg-text-strip` handles them by blanking the text in
    // place. Letting prompt-injection-redact also fire on those text
    // nodes is destructive: the SVG has no p/li/td ancestor, so
    // `findContainer` escalates all the way up to the surrounding
    // <article>/<section> and the entire product header gets
    // replaced with a single placeholder (#133).
    shouldSkipParent: (parent) => parent.closest("svg") !== null,
    process: (chunk) => {
      for (const node of chunk) {
        if (!containsInjection(node.nodeValue ?? "")) {
          continue;
        }
        const container = findContainer(node);
        if (container) {
          containers.add(container);
        }
      }
    },
    // Second-pass hide runs after every text node is collected, so
    // outermost dedupe sees the full container set. Synchronous when
    // the tree fit in one chunk (the common test case); microtask-
    // deferred when chunks fired. The helper guards against signal
    // abort before calling us.
    onComplete: () => {
      for (const element of filterToOutermost([...containers])) {
        if (!element.isConnected) {
          continue;
        }
        if (isInsidePlaceholder(element)) {
          continue;
        }
        // The container is an ancestor of the matched text node, so the reveal
        // stamp lands here — not on the text node we walked from. If a previous
        // run hid this container and the user revealed it, a re-apply (rule
        // disable→enable, or a future MutationObserver-driven re-scan) would
        // otherwise re-hide the same block. Same shape as the disguised-ad-flag
        // bug fixed in #160. (Originally landed via #161; preserved here after
        // the chunked-walk refactor moved the hide pass into onComplete.)
        if (element.closest(REVEALED_SELECTOR)) {
          continue;
        }
        replaceWithBlockPlaceholder(
          element,
          RULE_ID,
          "[possible prompt injection hidden — click to reveal]",
        );
      }
    },
  });
}

function apply(root: ParentNode): void {
  unsubscribeRouteChange ??= subscribeRouteChange(() => {
    lifecycle.abortAndReset();
  });
  scanAndMask(root);
}

export const promptInjectionRedactRule = {
  id: RULE_ID,
  label: "Hide Prompt Injection",
  description:
    "Hide page sections containing phrases common in prompt-injection attacks.",
  apply,
  teardown: () => {
    lifecycle.abortAndReset();
    unsubscribeRouteChange?.();
    unsubscribeRouteChange = null;
  },
} satisfies Rule;
