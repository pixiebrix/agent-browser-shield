// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Cross-rule DOM helpers. Lives in `lib/` so rules don't import each other.

import { PLACEHOLDER_CLASS } from "./placeholder";

// Tags whose text content is not user-facing prose and so should never be
// scanned for PII, secrets, scarcity claims, injection payloads, etc.
// `TEMPLATE` is included for callers that walk arbitrary trees; rules that
// stick to live document subtrees rarely encounter it but it's harmless.
export const NON_CONTENT_TAGS: ReadonlySet<string> = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEMPLATE",
]);

export function isNonContentTag(tagName: string): boolean {
  return NON_CONTENT_TAGS.has(tagName);
}

// True for placeholder elements themselves and anything inside one — the
// common "don't re-process my own replacement" check that every hide rule
// performs before considering a candidate.
export function isInsidePlaceholder(element: Element): boolean {
  if (element.classList.contains(PLACEHOLDER_CLASS)) {
    return true;
  }
  return element.closest(`.${PLACEHOLDER_CLASS}`) !== null;
}

// True if any element in the candidate list is an ancestor of `element`.
// Used to dedupe to the outermost match when multiple nested candidates all
// satisfy a rule.
function hasAncestorIn<T>(
  candidate: T,
  candidates: readonly T[],
  getElement: (item: T) => Element,
): boolean {
  const element = getElement(candidate);
  return candidates.some(
    (other) => other !== candidate && getElement(other).contains(element),
  );
}

// True if any element in the candidate list is a descendant of `element`.
function hasDescendantIn<T>(
  candidate: T,
  candidates: readonly T[],
  getElement: (item: T) => Element,
): boolean {
  const element = getElement(candidate);
  return candidates.some(
    (other) => other !== candidate && element.contains(getElement(other)),
  );
}

// Keep only candidates that have no candidate ancestor — the outermost
// match of each nested group. Use when hiding a wrapper should subsume its
// nested matches (prompt injection, irrelevant sections).
export function filterToOutermost<T>(
  candidates: readonly T[],
  getElement: (item: T) => Element = (item) => item as unknown as Element,
): T[] {
  return candidates.filter((c) => !hasAncestorIn(c, candidates, getElement));
}

// Keep only candidates that have no candidate descendant — the innermost
// match of each nested group. Use when the urgency/scarcity/match lives on
// a small leaf inside a larger card we shouldn't black out (countdown,
// scarcity, cart-addon).
export function filterToInnermost<T>(
  candidates: readonly T[],
  getElement: (item: T) => Element = (item) => item as unknown as Element,
): T[] {
  return candidates.filter((c) => !hasDescendantIn(c, candidates, getElement));
}

interface FindInnermostMatchesOptions<T> {
  // Drop elements failing this rule-specific gate. Universal skips
  // (non-content tags, descendant cap, text-length cap) are already applied;
  // callers add placeholder/revealed/flagged checks here.
  isSkipped?: (element: HTMLElement) => boolean;
  // Cap on trimmed `textContent` length. Real "leaf-like" matches (timer
  // text, scarcity badges, cart-line labels) are short; large containers
  // shouldn't be scanned as a single blob.
  maxTextLength: number;
  // Cap on element.children.length. Defends against matching the whole cart
  // wrapper because some descendant text mentions "warranty".
  maxDescendants: number;
  // Returns the per-match payload if `text` qualifies, or null to skip.
  match: (text: string, element: HTMLElement) => T | null;
}

// Shared "find leaf-ish elements whose trimmed text matches a predicate, then
// keep the innermost overlapping match" shape used by countdown-timer-hide,
// scarcity-hide, and cart-addon-flag. Each rule passes its own match function
// and its own skip predicate (placeholder check, revealed-attr check, etc.).
export function findInnermostMatches<T>(
  root: ParentNode,
  options: FindInnermostMatchesOptions<T>,
): Array<{ element: HTMLElement; match: T }> {
  const { isSkipped, maxTextLength, maxDescendants, match } = options;
  const out: Array<{ element: HTMLElement; match: T }> = [];
  for (const element of root.querySelectorAll<HTMLElement>("*")) {
    if (isNonContentTag(element.tagName)) {
      continue;
    }
    if (isSkipped?.(element)) {
      continue;
    }
    if (element.children.length > maxDescendants) {
      continue;
    }
    const text = element.textContent.trim();
    if (text.length === 0 || text.length > maxTextLength) {
      continue;
    }
    const matched = match(text, element);
    if (matched === null) {
      continue;
    }
    out.push({ element, match: matched });
  }
  return filterToInnermost(out, (item) => item.element);
}

interface WalkTextNodesOptions {
  // Reject text nodes shorter than this many characters. Tunes per-rule
  // false-positive rates (PII patterns need 9+, secrets need 16+).
  minLength?: number;
  // Extra parent-element predicate beyond the universal SCRIPT/STYLE/NOSCRIPT
  // + inside-placeholder skip. Rule-specific — most callers don't need it.
  shouldSkipParent?: (parent: Element) => boolean;
}

// Walk every text node under `root` whose parent is a content element (not
// SCRIPT/STYLE/NOSCRIPT, not inside an existing placeholder) and is at least
// `minLength` characters. Replaces the hand-rolled TreeWalker + collection
// loop in pii-mask / secrets-mask / prompt-injection-hide.
export function walkTextNodes(
  root: ParentNode,
  options: WalkTextNodesOptions = {},
): Text[] {
  const { minLength = 0, shouldSkipParent } = options;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) {
        return NodeFilter.FILTER_REJECT;
      }
      if (isNonContentTag(parent.tagName)) {
        return NodeFilter.FILTER_REJECT;
      }
      if (isInsidePlaceholder(parent)) {
        return NodeFilter.FILTER_REJECT;
      }
      if (shouldSkipParent?.(parent)) {
        return NodeFilter.FILTER_REJECT;
      }
      const value = node.nodeValue;
      if (!value || value.length < minLength) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const out: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    out.push(current as Text);
    current = walker.nextNode();
  }
  return out;
}
