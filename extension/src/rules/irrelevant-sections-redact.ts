// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Use a small LLM to identify page elements that are engagement / exploration
// rails ("related products", "you might also like", "more from this site",
// etc.) and replace them with click-to-reveal placeholders. Static selectors
// can't enumerate these patterns reliably across the long tail of sites.
//
// Strategy: build a compressed page tree (see `lib/page-tree`) with refs
// stamped on landmark containers and interactive elements, hand it to the LLM,
// and replace the elements whose refs come back as "irrelevant". Both the
// interactive refs and the prompt's preserve-list keep the LLM from flagging
// search/cart/checkout/account UI. The container-level refs let the LLM pick
// the right granularity instead of being forced into outermost-only choices.

import { ReusableAbortController } from "abort-utils";
import {
  pruneReferences,
  resolveReference,
} from "../lib/automation-element-reference";
import { createApiKeyAvailability } from "../lib/availability";
import { isInsidePlaceholder } from "../lib/dom-utils";
import { classifyIrrelevantSections } from "../lib/llm-client";
import { createRuleLogger } from "../lib/log";
import { getPageTree } from "../lib/page-tree";
import { replaceWithBlockPlaceholder } from "../lib/placeholder";
import { waitForSettle } from "../lib/wait-for-settle";
import type { Rule } from "./types";

const RULE_ID = "irrelevant-sections-redact" as const;
const log = createRuleLogger(RULE_ID);
const SCROLL_DEBOUNCE_MS = 600;
const SETTLE_TIMEOUT_MS = 3000;
const SETTLE_QUIET_MS = 500;
// Sections taller than this (relative to viewport) tend to be hero/banner
// regions whose removal collapses the page layout. Defense in depth — the
// prompt already discourages this, but a misclassification shouldn't be able
// to occlude the whole page.
const MAX_VIEWPORT_HEIGHT_FRACTION = 0.7;
// Cap on placeholder min-height so a tall element's replacement doesn't push
// the page off-screen.
const MAX_PLACEHOLDER_HEIGHT_PX = 200;

// Single controller covers both the settle phase and every classify call
// (initial + scroll-triggered). Teardown calls abortAndReset, which aborts the
// shared signal and produces a fresh one for the next apply — so the previous
// settle's waiter, the pending fetch, and any debounced scroll classification
// all unwind together.
const lifecycleController = new ReusableAbortController();
let scrollHandler: (() => void) | null = null;
let scrollDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let classifyInFlight = false;
// Track every element we've already submitted (regardless of whether it ended
// up hidden) so re-scans after scroll don't re-spend tokens on the same nodes.
let processedElements = new WeakSet<Element>();

function placeholderLabel(summary: string): string {
  const trimmed = summary.trim();
  return trimmed
    ? `[hidden: ${trimmed} — click to reveal]`
    : "[irrelevant section hidden — click to reveal]";
}

function describeElement(element: Element): Record<string, unknown> {
  const rect = element.getBoundingClientRect();
  const text = element.textContent.replaceAll(/\s+/g, " ").trim();
  return {
    tag: element.tagName,
    id: element.id || undefined,
    classes: element.className || undefined,
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    textSnippet: text.length > 80 ? `${text.slice(0, 80)}…` : text,
  };
}

// Single hideability check used both as a boolean gate and as a structured
// log reason. Returns null when the element is safe to hide, or a short
// machine-readable reason string when it isn't. Two parallel predicates used
// to drift; one function eliminates the risk.
function checkHideable(element: Element): string | null {
  if (!(element instanceof HTMLElement)) {
    return "not-an-htmlelement";
  }
  if (!element.isConnected) {
    return "detached-from-dom";
  }
  if (processedElements.has(element)) {
    return "already-processed";
  }
  if (isInsidePlaceholder(element)) {
    return "inside-placeholder";
  }

  // Protect the same categories the prompt is instructed to skip, in case the
  // LLM ignores the instruction.
  if (element.closest("article")) {
    return "inside-article";
  }
  if (element.closest("header")) {
    return "inside-header";
  }
  if (element.closest('[role="banner"]')) {
    return "inside-banner";
  }

  // Sticky / fixed elements leave a layout hole behind if replaced.
  const position = globalThis.getComputedStyle(element).position;
  if (position === "fixed" || position === "sticky") {
    return `position-${position}`;
  }

  // Skip anything that would dominate the viewport.
  const viewportHeight =
    window.innerHeight || document.documentElement.clientHeight;
  const rect = element.getBoundingClientRect();
  if (rect.height > viewportHeight * MAX_VIEWPORT_HEIGHT_FRACTION) {
    return `taller-than-${MAX_VIEWPORT_HEIGHT_FRACTION}-of-viewport`;
  }

  return null;
}

// Drop elements whose ancestor is also selected. If the LLM flagged both a
// wrapper and its descendant, hiding the wrapper subsumes the descendant —
// the inner placeholder would just sit inside the outer one. Run the dedupe
// before any DOM mutation so the ancestor relationships are still intact.
function dedupeToOutermost<T extends { element: Element }>(
  selections: readonly T[],
): T[] {
  return selections.filter((candidate) =>
    selections.every(
      (other) =>
        other === candidate || !other.element.contains(candidate.element),
    ),
  );
}

function serializePageTree(): string {
  const tree = getPageTree();
  return tree.innerHTML;
}

function runClassification(): void {
  if (classifyInFlight) {
    return;
  }

  pruneReferences();
  const pageTree = serializePageTree();
  if (!pageTree) {
    log.debug("irrelevant-sections-redact skipped — empty page tree");
    return;
  }

  const signal = lifecycleController.signal;
  classifyInFlight = true;

  log.debug("irrelevant-sections-redact classify start", {
    url: location.href,
    pageTreeBytes: pageTree.length,
  });

  classifyIrrelevantSections({ url: location.href, pageTree }, signal)
    .then((response) => {
      if (signal.aborted) {
        return;
      }

      log.debug("irrelevant-sections-redact classify response", {
        count: response.irrelevant.length,
        entries: response.irrelevant,
      });

      const seenRefs = new Set<string>();
      const candidates: Array<{
        element: HTMLElement;
        summary: string;
        ref: string;
      }> = [];
      for (const entry of response.irrelevant) {
        if (seenRefs.has(entry.ref)) {
          log.debug("irrelevant-sections-redact ref skipped — duplicate", {
            ref: entry.ref,
          });
          continue;
        }
        seenRefs.add(entry.ref);
        const element = resolveReference(entry.ref);
        if (!element) {
          log.debug("irrelevant-sections-redact ref skipped — unresolved", {
            ref: entry.ref,
            summary: entry.summary,
          });
          continue;
        }
        const skipReason = checkHideable(element);
        if (skipReason !== null) {
          log.debug("irrelevant-sections-redact ref skipped — not hideable", {
            ref: entry.ref,
            summary: entry.summary,
            reason: skipReason,
            element: describeElement(element),
          });
          continue;
        }
        log.debug("irrelevant-sections-redact ref accepted as candidate", {
          ref: entry.ref,
          summary: entry.summary,
          element: describeElement(element),
        });
        candidates.push({
          element: element as HTMLElement,
          summary: entry.summary,
          ref: entry.ref,
        });
      }

      const outermost = dedupeToOutermost(candidates);
      const droppedByDedupe = candidates.filter(
        (candidate) => !outermost.includes(candidate),
      );
      for (const dropped of droppedByDedupe) {
        log.debug(
          "irrelevant-sections-redact ref dropped by dedupe — has ancestor",
          {
            ref: dropped.ref,
            summary: dropped.summary,
            element: describeElement(dropped.element),
          },
        );
      }

      let hiddenCount = 0;
      for (const { element, summary, ref } of outermost) {
        if (!element.isConnected) {
          log.debug(
            "irrelevant-sections-redact ref skipped at hide — detached",
            {
              ref,
              summary,
            },
          );
          continue;
        }
        const description = describeElement(element);
        processedElements.add(element);
        const placeholder = replaceWithBlockPlaceholder(
          element,
          RULE_ID,
          placeholderLabel(summary),
        );
        placeholder.style.minHeight = `${Math.min(
          placeholder.getBoundingClientRect().height,
          MAX_PLACEHOLDER_HEIGHT_PX,
        )}px`;
        placeholder.style.maxHeight = `${MAX_PLACEHOLDER_HEIGHT_PX}px`;
        placeholder.style.overflow = "hidden";
        hiddenCount++;
        log.debug("irrelevant-sections-redact ref hidden", {
          ref,
          summary,
          element: description,
        });
      }

      log.info("irrelevant-sections-redact classify done", {
        returned: response.irrelevant.length,
        candidates: candidates.length,
        deduped: outermost.length,
        hidden: hiddenCount,
      });
    })
    .catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      log.error("irrelevant-sections-redact classify failed", {
        error: message,
      });
    })
    .finally(() => {
      classifyInFlight = false;
    });
}

function startScrollWatcher(): void {
  scrollHandler = () => {
    if (scrollDebounceTimer) {
      clearTimeout(scrollDebounceTimer);
    }
    scrollDebounceTimer = setTimeout(() => {
      scrollDebounceTimer = null;
      runClassification();
    }, SCROLL_DEBOUNCE_MS);
  };
  window.addEventListener("scroll", scrollHandler, { passive: true });
}

function stopScrollWatcher(): void {
  if (scrollHandler) {
    window.removeEventListener("scroll", scrollHandler);
    scrollHandler = null;
  }
  if (scrollDebounceTimer) {
    clearTimeout(scrollDebounceTimer);
    scrollDebounceTimer = null;
  }
}

function apply(_root: ParentNode): void {
  log.info("irrelevant-sections-redact apply", { url: location.href });
  const signal = lifecycleController.signal;

  void waitForSettle({
    timeout: SETTLE_TIMEOUT_MS,
    quietMs: SETTLE_QUIET_MS,
    signal,
  }).then(() => {
    if (signal.aborted) {
      log.debug("irrelevant-sections-redact aborted before classify");
      return;
    }
    log.info("irrelevant-sections-redact page settled — classifying");
    runClassification();
    startScrollWatcher();
  });
}

function teardown(): void {
  lifecycleController.abortAndReset();
  stopScrollWatcher();
  classifyInFlight = false;
  processedElements = new WeakSet();
}

export const irrelevantSectionsRedactRule = {
  id: RULE_ID,
  label: "Hide Irrelevant Sections (AI)",
  description:
    "Use a small LLM to identify engagement rails (related products, recommended articles, trending now) and replace them with click-to-reveal placeholders.",
  available: createApiKeyAvailability(
    "Set an OpenAI API key on the options page to enable this rule.",
  ),
  // Page-level recommendation rails live on the top frame; classifying the
  // contents of every iframe would multiply LLM cost without benefit.
  topFrameOnly: true,
  apply,
  teardown,
} satisfies Rule;
