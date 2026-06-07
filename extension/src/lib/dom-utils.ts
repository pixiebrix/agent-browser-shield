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
// `NON_CONTENT_TAGS` subtrees (SCRIPT/STYLE/NOSCRIPT/TEMPLATE) excluded and
// open shadow roots descended into. `Node.textContent` happily serializes
// inline script source as if it were prose (misleading for any check keyed on
// "does this element show text" — e.g., color-match on a wrapper whose only
// `textContent` is a JSON blob inside a <script>) and ignores shadow trees
// entirely (which is the wrong default for the rules that consume this —
// hidden-text-strip, color-match heuristics, etc. need to see the text the
// user / a11y tree would render, including from web components).
export function visibleTextContent(element: Element): string {
  let out = "";
  const visit = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? "";
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }
    const childElement = node as Element;
    if (NON_CONTENT_TAGS.has(childElement.tagName)) {
      return;
    }
    for (const child of childElement.childNodes) {
      visit(child);
    }
    if (childElement.shadowRoot) {
      for (const child of childElement.shadowRoot.childNodes) {
        visit(child);
      }
    }
  };
  for (const child of element.childNodes) {
    visit(child);
  }
  if (element.shadowRoot) {
    for (const child of element.shadowRoot.childNodes) {
      visit(child);
    }
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
// loop in pii-redact / secrets-redact / prompt-injection-redact. Open shadow
// roots are descended into so injection-defense rules catch payloads
// rendered inside web-component shadow trees; closed shadow roots are
// opaque by design and skipped.
export function walkTextNodes(
  root: ParentNode,
  options: WalkTextNodesOptions = {},
): Text[] {
  return collectTextNodesShadowPiercing(root, options);
}

// Tags that introduce a new inline-formatting context — text nodes on
// opposite sides render on separate lines visually and do NOT logically
// concatenate. Used by `collectTextNodesWithInlineGroups` to bucket text
// nodes so the inline-text-redact factory can detect matches split across
// sibling text nodes (a React `<span>`-per-digit-group card render is the
// motivating case) without falsely concatenating across block boundaries.
//
// Static list rather than `getComputedStyle().display` — the lookup is
// hot (every text node visited), the false-negative cost is only a missed
// detection on an inline tag styled to `display:block`, and reading
// computed style during a tree walk forces layout. Conservative: a tag
// missing from this set is treated as inline; that can cause false
// negatives but never false positives across true block boundaries.
const BLOCK_LEVEL_TAGS: ReadonlySet<string> = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "BODY",
  "CAPTION",
  "COLGROUP",
  "DD",
  "DETAILS",
  "DIALOG",
  "DIV",
  "DL",
  "DT",
  "FIELDSET",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "FORM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "HR",
  "HTML",
  "LI",
  "MAIN",
  "MENU",
  "NAV",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "SUMMARY",
  "TABLE",
  "TBODY",
  "TD",
  "TFOOT",
  "TH",
  "THEAD",
  "TR",
  "UL",
]);

export interface TextNodeWithInlineGroup {
  node: Text;
  // Stable id per inline-formatting context within this collection pass.
  // Two text nodes share a group iff they're rendered as one continuous
  // line of inline text (no intervening block element, `<br>`, or shadow
  // boundary). Ids are dense within a pass but otherwise opaque.
  group: number;
}

// Shared core for `walkTextNodes` and the chunked walker in
// `yielding-text-walk.ts`. Pre-collects every text node under `root`
// matching the same filter both APIs expose, descending through open
// shadow roots so the injection-defense rules don't have a free
// bypass via `attachShadow`. Pre-collection (vs an interleaved
// TreeWalker) is what makes shadow piercing tractable — TreeWalker
// can't cross shadow boundaries, and a custom iterator with the same
// chunked-resume semantics would have to dance around consumer
// detachment. A static array side-steps both problems.
export function collectTextNodesShadowPiercing(
  root: ParentNode,
  options: WalkTextNodesOptions = {},
): Text[] {
  return collectTextNodesWithInlineGroups(root, options).map(
    (entry) => entry.node,
  );
}

// Group-aware variant. Same filter and shadow-piercing semantics as
// `collectTextNodesShadowPiercing`, plus an inline-formatting-context id
// per text node so callers can detect cross-node matches without
// concatenating across block / `<br>` / shadow-root boundaries.
//
// Group id bumps:
//   - on entering and leaving a `BLOCK_LEVEL_TAGS` subtree (pre+post so
//     siblings before/inside/after the block sit in three groups);
//   - on encountering a `<br>` element (post only; `<br>` is void);
//   - on entering and leaving a shadow root.
//
// Each text node is tagged with the counter's value at the moment it's
// visited.
export function collectTextNodesWithInlineGroups(
  root: ParentNode,
  options: WalkTextNodesOptions = {},
): TextNodeWithInlineGroup[] {
  const { minLength = 0, shouldSkipParent } = options;
  const out: TextNodeWithInlineGroup[] = [];
  let currentGroup = 0;

  function accept(text: Text): boolean {
    const parent = text.parentElement;
    if (!parent) {
      return false;
    }
    if (isNonContentTag(parent.tagName)) {
      return false;
    }
    if (isInsidePlaceholder(parent)) {
      return false;
    }
    if (shouldSkipParent?.(parent)) {
      return false;
    }
    const value = text.nodeValue;
    if (!value || value.length < minLength) {
      return false;
    }
    return true;
  }

  function visit(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node as Text;
      if (accept(text)) {
        out.push({ node: text, group: currentGroup });
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }
    const element = node as Element;
    // Prune NON_CONTENT_TAGS at the subtree boundary — saves the
    // per-text-node parent check on the (rare) case where a content
    // element has many text descendants under a script/style. Equivalent
    // result either way; the filter at `accept` is the source of truth.
    if (isNonContentTag(element.tagName)) {
      return;
    }
    const tag = element.tagName;
    if (tag === "BR") {
      // Void element; bump on leave so any post-<br> sibling text starts
      // a new group.
      currentGroup++;
      return;
    }
    const isBlock = BLOCK_LEVEL_TAGS.has(tag);
    if (isBlock) {
      currentGroup++;
    }
    for (const child of element.childNodes) {
      visit(child);
    }
    if (element.shadowRoot) {
      currentGroup++;
      for (const child of element.shadowRoot.childNodes) {
        visit(child);
      }
      currentGroup++;
    }
    if (isBlock) {
      currentGroup++;
    }
  }

  // ParentNode covers Element, Document, DocumentFragment, ShadowRoot.
  // For an Element root, also descend into its own shadow.
  if (root.nodeType === Node.ELEMENT_NODE) {
    visit(root);
  } else {
    for (const child of root.childNodes) {
      visit(child);
    }
  }
  return out;
}
