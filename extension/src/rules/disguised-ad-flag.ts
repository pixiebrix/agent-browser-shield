// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Hide native advertorials — paid content rendered by the publisher's own
// CMS as article-shaped blocks, distinguishable from editorial only by a
// small "Sponsored" / "Promoted" / "Advertorial" label. `ads-hide` catches
// infrastructure-level ads (iframes, IAB `data-ad-slot`, named vendor
// classes) via EasyList; this rule fills the gap for publisher-rendered
// advertorials that bypass those selectors.
//
// Detection uses the *visible disclosure label* — not network selectors.
// Per FTC `.com Disclosures`, advertorials must carry a reasonably
// prominent label, so we can rely on it being present. The whole-string
// regex on a small leaf-ish text element keeps editorial prose mentioning
// sponsorship ("the team is sponsored by Adidas") from matching.

import {
  DISGUISED_AD_FLAG_CONSIDERED_ATTR as CONSIDERED_ATTR,
  HIDDEN_ATTR,
  REVEALED_ATTR,
} from "../lib/dom-markers";
import {
  filterToOutermost,
  findInnermostMatches,
  isInsidePlaceholder,
} from "../lib/dom-utils";
import { log } from "../lib/log";
import { replaceWithBlockPlaceholder } from "../lib/placeholder";
import { createSubtreeWatcher } from "../lib/subtree-watcher";
import type { Rule } from "./types";

const RULE_ID = "disguised-ad-flag" as const;

// Cap on the trimmed text length of the *label* element. Real disclosure
// labels are short — "Sponsored", "Paid for and presented by Acme", a
// bracketed "[Ad]". Editorial paragraphs that happen to contain the word
// "sponsored" are far longer.
const MAX_LABEL_TEXT_LENGTH = 80;

// Cap on direct children of the label element. The label sits in a small
// `<span>` / `<p>` / `<div>` — typically with no children or a single
// styling wrapper. A multi-child container is a card, not a label.
const MAX_LABEL_DESCENDANTS = 3;

// Limit how far we walk up looking for an article-shaped container. Going
// further is almost always overreach into page chrome (sections, mains,
// bodies). Eight hops covers reasonable card → wrapper → grid-cell nesting
// without licensing us to climb to <main>.
const MAX_ANCESTOR_HOPS = 8;

// Minimum prose-text length the article-shape ancestor must carry, in
// characters, after excluding the label itself and any headings. Filters
// out "card-shaped" UI like sort-control rows where there's a label but no
// editorial body to confuse an agent with.
const MIN_ARTICLE_PROSE_LENGTH = 80;

// Core whole-string label phrases (case-insensitive, word-boundaried at
// the ends of the trimmed text). The matcher requires the *entire* trimmed
// `textContent` of the candidate to be one of these phrases (with an
// optional " by <issuer>" suffix where allowed), so editorial prose
// containing the word in passing doesn't match.
const STANDALONE_PHRASES: readonly string[] = [
  "sponsored",
  "promoted",
  "advertorial",
  "paid post",
  "partner content",
  "sponsored content",
  "sponsored post",
  "branded content",
  // Added per audit #203 item 18: marketplace listings and partner-program
  // disclosures use these as standalone labels in the same shape — small
  // leaf-ish text in the corner of an article-shaped card.
  "featured listing",
  "from our advertisers",
  "marketing partner",
];

// Suffix-form phrases — "Sponsored by Acme", "Presented by Acme", "Paid
// for and presented by Acme". The trailing brand is matched as `.+` so
// the rule doesn't depend on a brand allowlist, but the prefix is fixed.
const SUFFIX_PHRASES: readonly string[] = [
  "sponsored by",
  "presented by",
  "paid for and presented by",
  // Added per audit #203 item 18: "In partnership with <Brand>" is the
  // co-branded native-advertorial label shape on retail and editorial
  // sites alike.
  "in partnership with",
];

function escapeRegex(literal: string): string {
  return literal.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

// Optional trailing separator + brand allows " — Acme", ": Acme", "| Acme".
// Trailing brand is capped at 60 chars to keep "Sponsored by X" from
// chewing through a misclassified prose paragraph.
const STANDALONE_RE = new RegExp(
  String.raw`^(?:${STANDALONE_PHRASES.map(escapeRegex).join(
    "|",
  )})(?:\s*[:\-—–|·]\s*.{1,60})?$`,
  "i",
);
const SUFFIX_RE = new RegExp(
  String.raw`^(?:${SUFFIX_PHRASES.map(escapeRegex).join("|")})\s+.{1,60}$`,
  "i",
);

// Bracket / parenthesized labels common in social feeds and mobile apps.
// The regex is anchored end-to-end against the *trimmed* textContent of a
// leaf-ish candidate, so the editorial idioms "ad hoc" / "ad lib" cannot
// match — their bracketed forms have internal whitespace ("[ad hoc]")
// which the no-content `\[ad\]` literal rejects. That's why we can accept
// the lowercase form here (audit #203 item 18) alongside the original
// case-variants that were guarded as a defense-in-depth precaution.
const BRACKET_RE = /^(?:\[ad\]|\[Ad\]|\[AD\]|\(promoted\)|\(sponsored\))$/;

interface LabelMatch {
  // The phrase form that matched, used in the placeholder copy so a
  // reviewer / agent can see which signal fired.
  phrase: string;
}

function matchLabel(text: string): LabelMatch | null {
  // Bracket form has no `i` flag (case-sensitive) and enumerates the three
  // accepted variants explicitly (`[ad]`, `[Ad]`, `[AD]`) so the editorial
  // idioms `[ad hoc]` / `[ad lib]` — which carry internal whitespace — can't
  // match. Check it before the case-insensitive regexes since both could
  // match a `[Ad]` text otherwise.
  if (BRACKET_RE.test(text)) {
    return { phrase: text };
  }
  if (STANDALONE_RE.test(text)) {
    return { phrase: text };
  }
  if (SUFFIX_RE.test(text)) {
    return { phrase: text };
  }
  return null;
}

// Interactive / form-control ancestors indicate the candidate is a filter
// chip, sort option, or button — not an advertorial label. Stop walking
// upward as soon as one of these is hit.
function isInteractiveAncestor(element: Element): boolean {
  const name = element.localName;
  if (
    name === "button" ||
    name === "select" ||
    name === "option" ||
    name === "input" ||
    name === "textarea" ||
    name === "label"
  ) {
    return true;
  }
  const role = element.getAttribute("role");
  if (
    role === "button" ||
    role === "tab" ||
    role === "menuitem" ||
    role === "option" ||
    role === "checkbox" ||
    role === "radio" ||
    role === "switch"
  ) {
    return true;
  }
  return false;
}

// Navigation / landmark ancestors — labels here are nav links to the
// publisher's branded-content hub, not embedded advertorials. Removing the
// containing card would punch a hole in the nav.
function isNavigationAncestor(element: Element): boolean {
  const name = element.localName;
  if (name === "nav" || name === "header") {
    return true;
  }
  const role = element.getAttribute("role");
  return role === "navigation" || role === "banner";
}

// Boundary tags we treat as "you've walked too far". Once we reach <main>,
// <body>, or <html>, the label isn't sitting on an article card.
// `<section>` is intentionally not a boundary — it's the natural wrapper
// for an advertorial.
function isPageBoundary(element: Element): boolean {
  const name = element.localName;
  if (name === "main" || name === "body" || name === "html") {
    return true;
  }
  return element.getAttribute("role") === "main";
}

// Heading-equivalent selector. Beyond the literal h1–h6 set, accept two
// accessibility-spec-compliant carriers (audit #203 item 19):
//   - `[role="heading"]`: the ARIA-defined heading carrier (a `<div
//     role="heading" aria-level="…">` is semantically identical to an
//     `<h*>` for assistive tech, and design systems that style their own
//     headings emit it instead of a real `<h*>`).
//   - `.headline` (exact token match via `[class~="headline"]`): the
//     conventional class name for card headlines on news / publisher CMSs
//     (`<div class="headline">`, `<div class="card headline">`). Narrow
//     to this single token — `[class*="title"]` would chew through chrome
//     like `.page-title` / `.section-title` and over-fire.
const HEADING_SELECTOR =
  'h1, h2, h3, h4, h5, h6, [role="heading"], [class~="headline"]';

// True if `element` looks like an article card: contains a heading, plus
// at least one of an image or an outgoing link, plus enough prose text to
// be confusable with editorial. The label text itself and headings are
// excluded from the prose count so a label-only row doesn't qualify.
function isArticleShaped(element: Element, labelElement: Element): boolean {
  const heading = element.querySelector(HEADING_SELECTOR);
  if (heading === null) {
    return false;
  }
  const hasImage = element.querySelector("img, picture") !== null;
  const hasLink = element.querySelector("a[href]") !== null;
  if (!hasImage && !hasLink) {
    return false;
  }
  // Tally text content excluding the label itself and any headings — the
  // remainder is the prose body. Card-shaped UI chrome (sort headers,
  // facet rows) has a label and maybe a heading but nothing substantial
  // after that.
  //
  // We only count "leaf-ish" candidates — those that don't themselves
  // contain another selector match. `<div><p><span>X</span></p></div>`
  // would otherwise count the same characters three times (div, p, span)
  // and let a 40-char card slip past an 80-char minimum.
  const proseCandidates = element.querySelectorAll("p, span, div, li");
  const candidateSet = new Set(proseCandidates);
  let proseLength = 0;
  for (const child of proseCandidates) {
    if (child === labelElement || labelElement.contains(child)) {
      continue;
    }
    if (child.querySelector(HEADING_SELECTOR) !== null) {
      continue;
    }
    let hasNestedCandidate = false;
    for (const nested of child.querySelectorAll("p, span, div, li")) {
      if (candidateSet.has(nested)) {
        hasNestedCandidate = true;
        break;
      }
    }
    if (hasNestedCandidate) {
      continue;
    }
    proseLength += child.textContent.trim().length;
    if (proseLength >= MIN_ARTICLE_PROSE_LENGTH) {
      return true;
    }
  }
  return false;
}

// Walk up from a matched label element looking for an article-shaped
// container. Returns the container, or null if no suitable ancestor is
// reachable within the hop budget (most often because the label is sitting
// on a filter chip / nav link / standalone disclosure).
export function findArticleAncestor(label: Element): HTMLElement | null {
  let cursor: Element | null = label.parentElement;
  let hops = 0;
  while (cursor !== null && hops < MAX_ANCESTOR_HOPS) {
    if (isInteractiveAncestor(cursor) || isNavigationAncestor(cursor)) {
      return null;
    }
    if (isPageBoundary(cursor)) {
      return null;
    }
    if (
      cursor instanceof HTMLElement &&
      cursor.isConnected &&
      isArticleShaped(cursor, label)
    ) {
      return cursor;
    }
    cursor = cursor.parentElement;
    hops++;
  }
  return null;
}

function isInsideHiddenAd(element: Element): boolean {
  // `ads-hide`'s curated selectors stamp HIDDEN_ATTR on display:none nodes
  // (see selector-hide-rule). Any ancestor with that attribute means the
  // surrounding region is already an ad; we'd be double-flagging.
  return element.closest(`[${HIDDEN_ATTR}="ads-hide"]`) !== null;
}

function isCandidateSkipped(element: HTMLElement): boolean {
  if (element.hasAttribute(CONSIDERED_ATTR)) {
    return true;
  }
  // Skip if the label sits inside (or is) an element this rule already
  // hid and the user then revealed. The reveal stamp lives on the article
  // ancestor — not on the label — so checking only `element.hasAttribute`
  // missed the common case and let a post-reveal mutation burst re-wrap
  // the same article into an unrevealable loop.
  if (element.closest(`[${REVEALED_ATTR}="${RULE_ID}"]`)) {
    return true;
  }
  if (isInsidePlaceholder(element)) {
    return true;
  }
  if (isInsideHiddenAd(element)) {
    return true;
  }
  // If any ancestor up to a navigation / interactive boundary is itself
  // nav / interactive, the candidate can't be an advertorial. We do the
  // cheap structural check here so findInnermostMatches doesn't return
  // matches we'll immediately throw away.
  let cursor: Element | null = element.parentElement;
  let hops = 0;
  while (cursor !== null && hops < MAX_ANCESTOR_HOPS) {
    if (isInteractiveAncestor(cursor) || isNavigationAncestor(cursor)) {
      return true;
    }
    if (isPageBoundary(cursor)) {
      return false;
    }
    cursor = cursor.parentElement;
    hops++;
  }
  return false;
}

function placeholderLabel(phrase: string): string {
  return `[hidden: sponsored content ("${phrase}") — click to reveal]`;
}

interface Candidate {
  label: HTMLElement;
  article: HTMLElement;
  phrase: string;
}

function collectCandidates(root: ParentNode): Candidate[] {
  const labelMatches = findInnermostMatches<LabelMatch>(root, {
    maxTextLength: MAX_LABEL_TEXT_LENGTH,
    maxDescendants: MAX_LABEL_DESCENDANTS,
    isSkipped: isCandidateSkipped,
    match: (text) => matchLabel(text),
  });

  // Dedupe by article identity first — two labels inside the same card
  // (e.g., a small "Sponsored" badge plus a "Paid for and presented by"
  // caption) resolve to the same article container, and we should hide it
  // exactly once. `filterToOutermost` after that handles the rarer case
  // where an advertorial card is itself nested inside an outer
  // article-shaped container that also matched.
  const byArticle = new Map<HTMLElement, Candidate>();
  for (const { element, match } of labelMatches) {
    const article = findArticleAncestor(element);
    if (article === null) {
      // Mark the label so we don't re-evaluate the same negative case on
      // every mutation burst. The marker is per-rule so other rules are
      // unaffected.
      element.setAttribute(CONSIDERED_ATTR, "no-article-ancestor");
      continue;
    }
    if (!byArticle.has(article)) {
      byArticle.set(article, {
        label: element,
        article,
        phrase: match.phrase,
      });
    }
  }
  return filterToOutermost([...byArticle.values()], (c) => c.article);
}

function hideCandidate(candidate: Candidate): void {
  if (!candidate.article.isConnected) {
    return;
  }
  const placeholder = replaceWithBlockPlaceholder(
    candidate.article,
    RULE_ID,
    placeholderLabel(candidate.phrase),
  );
  // Same height-cap pattern as irrelevant-sections-redact so a tall
  // advertorial doesn't blow out the layout when collapsed.
  placeholder.style.maxHeight = "200px";
  placeholder.style.overflow = "hidden";
}

function scanAndHide(root: ParentNode): void {
  const candidates = collectCandidates(root);
  if (candidates.length === 0) {
    return;
  }
  for (const candidate of candidates) {
    hideCandidate(candidate);
  }
  log("disguised ad placeholders inserted", {
    count: candidates.length,
    phrases: candidates.map((c) => c.phrase),
  });
}

const watcher = createSubtreeWatcher({
  skipPlaceholderSubtrees: true,
  onSubtrees: (roots) => {
    for (const root of roots) {
      scanAndHide(root);
    }
  },
});

function apply(root: ParentNode): void {
  scanAndHide(root);
  watcher.start(root);
}

export const disguisedAdFlagRule = {
  id: RULE_ID,
  label: "Hide Disguised Ads (Native Advertorials)",
  description:
    "Hide article-shaped blocks that carry a visible 'Sponsored', 'Promoted', 'Advertorial', or 'Paid Post' disclosure label. Catches native advertorials that bypass network-level ad selectors (EasyList) because the publisher's own CMS renders them. Replaces the card with a click-to-reveal placeholder.",
  apply,
  teardown: () => {
    watcher.stop();
  },
} satisfies Rule;
