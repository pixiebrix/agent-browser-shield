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

// Text that a sighted user could perceive — like `Node.textContent` but with
// `NON_CONTENT_TAGS` subtrees (SCRIPT/STYLE/NOSCRIPT/TEMPLATE) excluded.
// `Node.textContent` happily serializes inline script source as if it were
// prose, which is misleading for any check keyed on "does this element show
// text" (e.g., color-match on a wrapper whose only `textContent` is a JSON
// blob inside a <script>).
export function visibleTextContent(element: Element): string {
  const walker = globalThis.document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        let parent: Node | null = node.parentNode;
        while (parent && parent !== element) {
          if (
            parent.nodeType === Node.ELEMENT_NODE &&
            NON_CONTENT_TAGS.has((parent as Element).tagName)
          ) {
            return NodeFilter.FILTER_REJECT;
          }
          parent = parent.parentNode;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    },
  );
  let out = "";
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    out += node.textContent ?? "";
  }
  return out;
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

// Keep only candidates that have no candidate ancestor — the outermost
// match of each nested group. Use when hiding a wrapper should subsume its
// nested matches (prompt injection, irrelevant sections).
//
// O(C·D) where D is the maximum depth: build a Set of candidate elements
// once, then walk each candidate's parent chain checking Set membership.
// The naive `candidates.some(other.contains(element))` shape was O(C²·D),
// which matters on feeds where the same rule sees hundreds of candidates
// accumulate across a scroll session.
export function filterToOutermost<T>(
  candidates: readonly T[],
  getElement: (item: T) => Element = (item) => item as unknown as Element,
): T[] {
  const elementSet = new Set<Element>(candidates.map(getElement));
  return candidates.filter((candidate) => {
    let parent = getElement(candidate).parentElement;
    while (parent) {
      if (elementSet.has(parent)) {
        return false;
      }
      parent = parent.parentElement;
    }
    return true;
  });
}

// Keep only candidates that have no candidate descendant — the innermost
// match of each nested group. Use when the urgency/scarcity/match lives on
// a small leaf inside a larger card we shouldn't black out (countdown,
// scarcity, cart-addon).
//
// Computed as the dual of filterToOutermost: for each candidate, walk up
// and mark any candidate-ancestors encountered as "has descendant." Anything
// not marked is innermost. O(C·D) total.
export function filterToInnermost<T>(
  candidates: readonly T[],
  getElement: (item: T) => Element = (item) => item as unknown as Element,
): T[] {
  const elementSet = new Set<Element>(candidates.map(getElement));
  const hasCandidateDescendant = new Set<Element>();
  for (const candidate of candidates) {
    let parent = getElement(candidate).parentElement;
    while (parent) {
      if (elementSet.has(parent)) {
        hasCandidateDescendant.add(parent);
      }
      parent = parent.parentElement;
    }
  }
  return candidates.filter(
    (candidate) => !hasCandidateDescendant.has(getElement(candidate)),
  );
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
// keep the innermost overlapping match" shape used by countdown-timer-redact,
// scarcity-redact, and cart-addon-annotate. Each rule passes its own match function
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
// loop in pii-redact / secrets-redact / prompt-injection-redact.
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
