// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Annotate drip-pricing fees in checkout order summaries. The dark pattern:
// a low base price is advertised up front and mandatory fees ("resort
// fee", "service fee", "convenience fee", "processing fee", …) only
// surface inside the order-summary at the final step. A sighted shopper
// scans the running total before clicking Pay; an agent acting on
// `"buy X for $Y"` may not re-check the total at the final step.
//
// The defense is making the fee *visible* to the agent — same posture as
// `cart-addon-annotate` and `trust-badge-annotate`. We prepend an inline
// chip on the matched fee row; we do NOT remove the row. Many of these
// charges are legally required to be surfaced (FTC Unfair-or-Deceptive-
// Fees rule, effective 2025-05-12) and silently removing them would both
// desync the displayed total and risk wiping a disclosure the operator
// must show.
//
// False-positive control is the hard part — "service fee" appears in
// marketing copy, FAQs, and policy paragraphs all over checkout-adjacent
// templates. Layered gates:
//   1. Whole-string regex on a small leaf-ish label element (precision
//      bar lifted from `disguised-ad-flag`).
//   2. Order-summary ancestor — <table>, [role="region"] with
//      order-summary labelling, <aside>/<section>/<div> with cart-shaped
//      class/id, or schema.org Order microdata.
//   3. Currency amount embedded in the label OR in a nearby sibling.
//   4. Single-item-cart skip — if the order-summary holds only one priced
//      row, the fee IS the product (utility bill, DMV portal).
//   5. Explicit exclude list for legally-required line items (tax, VAT,
//      shipping, tip, gratuity — those have their own disclosure regime).
//   6. Per-host denylist for known false-positive hosts (empty at launch;
//      populate via PR review as real-world counts identify them).
// Ships default-on (Experimental tag retained) because the action is
// annotate-only — worst case is an extra chip on a row, not a destructive
// edit. Per-rule activity counts (#174) and the per-host denylist let us
// react if live signal surfaces a false-positive cluster.

import { isCheckoutUrl } from "../lib/checkout-url";
import {
  HIDDEN_FEE_ANNOTATED_ATTR as FLAGGED_ATTR,
  RULE_ATTR,
} from "../lib/dom-markers";
import { findInnermostMatches } from "../lib/dom-utils";
import { createRuleLogger } from "../lib/log";
import { createScanRule } from "../lib/scan-rule";
import { traceMutation } from "../lib/trace-mutation";

const RULE_ID = "hidden-fee-annotate" as const;
const log = createRuleLogger(RULE_ID);

const FLAG_CLASS = "abs-hidden-fee-annotate";

// Cap on the trimmed text length of the label element. Real order-summary
// fee labels are short — "Resort Fee", "Service Fee $45.00". A paragraph
// of marketing copy mentioning "service fee" is far longer.
const MAX_LABEL_TEXT_LENGTH = 80;

// Cap on direct children. The label is a small <td>/<span>/<div>. A
// multi-child container is the row, not the label, and the row's wider
// textContent isn't what we want to match against.
const MAX_LABEL_DESCENDANTS = 3;

// Max hops walked upward from the label looking for the order-summary
// container. Eight covers reasonable td → tr → tbody → table or
// span → div → div → aside nesting without licensing us to climb to <main>.
const MAX_ANCESTOR_HOPS = 8;

// Minimum count of priced rows the order-summary container must hold for
// the fee to qualify as *added* versus *the product*. A utility bill or
// DMV portal whose only line item is "Convenience Fee" is not drip
// pricing.
const MIN_PRICED_ROWS = 2;

// Curated phrase set (all 9 from issue #119). Whole-string anchored
// against the trimmed label text, with an optional short trailing
// qualifier ("Resort Fee — $45/night", "Service Fee: per stay",
// "Resort Fee $45.00"). Substring mentions ("Customer Service Fee
// Schedule") and policy-paragraph mentions ("Our service fee policy …")
// are rejected. Additions go through PR review; avoid expanding to
// generic single words like "fee" alone.
const FEE_PHRASES: readonly string[] = [
  "service fee",
  "convenience fee",
  "processing fee",
  "resort fee",
  "destination fee",
  "facility fee",
  "handling fee",
  "venue fee",
  "delivery surcharge",
];

function escapeRegex(literal: string): string {
  return literal.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

// Currency-amount fragment used both as a standalone test (sibling
// amounts) and as part of the trailing qualifier branch. Covers common
// symbols, optional comma thousands separators, optional 1–2 decimal
// places. The trailing ISO code (USD/EUR/…) is matched separately.
const CURRENCY_FRAGMENT = String.raw`[\$£€¥¢₹₩]\s?[\d,]+(?:\.\d{1,2})?`;

// Whole-string label regex. Trailing qualifier branches:
//   (a) [:|—–-·(] separator then up to 60 chars — "Service Fee: per stay"
//   (b) whitespace + currency amount, optionally followed by a brief
//       qualifier — "Resort Fee $45.00 per night"
// The capture group surfaces the matched phrase for the chip text.
const FEE_RE = new RegExp(
  String.raw`^(${FEE_PHRASES.map(escapeRegex).join(
    "|",
  )})(?:\s*[:\-—–|·(]\s*.{0,60}|\s+${CURRENCY_FRAGMENT}(?:\s+.{0,30})?)?$`,
  "i",
);

// Exclude any candidate whose label also contains a legally-required
// line-item word. Belt-and-suspenders against composite labels like
// "Service Fee (incl. Tax)" sneaking past the precision bar — pure
// tax / shipping / tip rows never match FEE_RE in the first place.
// "delivery surcharge" stays in the phrase set; this regex matches
// "delivery" only when *not* followed by " surcharge".
const EXCLUDE_RE =
  /\b(?:sales\s+tax|vat|gst|tax|tip|gratuity|shipping(?!\s+surcharge)|delivery(?!\s+surcharge))\b/i;

// Anchored currency-only regex, for testing sibling text. Slightly looser
// than CURRENCY_FRAGMENT — allows surrounding whitespace and an optional
// trailing ISO currency code.
const CURRENCY_ONLY_RE = new RegExp(
  String.raw`^\s*${CURRENCY_FRAGMENT}\s*(?:USD|EUR|GBP|JPY|CAD|AUD)?\s*$`,
  "i",
);

// Embedded amount extractor — pull the first currency-shaped substring
// out of a label that already has one ("Resort Fee $45.00 per night").
const EMBEDDED_AMOUNT_RE = new RegExp(CURRENCY_FRAGMENT);

// Subtotal/total row labels — these aren't "items" for the priced-row
// count.
const SUMMARY_TOTAL_RE =
  /\b(?:sub\s*total|grand\s*total|total|amount\s+due|balance(?:\s+due)?|due\s+now|order\s+total)\b/i;

// Order-summary container signals.
const ORDER_SUMMARY_ARIA_RE =
  /\b(?:order\s+summary|cart\s+summary|checkout\s+summary|payment\s+summary|fee\s+breakdown|price\s+details|billing\s+summary|order\s+total)\b/i;
const CART_CONTAINER_NAME_RE =
  /(?:cart|order|checkout|basket|bag|summary|totals?|fees?|price-?details|billing)/i;

// Per-host kill-switch — hostnames where the fee genuinely IS the product
// (utility-bill portals, DMV payments, court e-filing) or where the
// pattern is otherwise inapplicable. Empty at launch; populate via PR
// review as real-world activity counts surface false-positive hosts.
// Same governance posture as `roach-motel-annotate`'s curated list.
const HOST_DENYLIST: ReadonlySet<string> = new Set<string>();

export interface PhraseMatch {
  // The curated phrase (lower-cased) that matched.
  phrase: string;
}

export function matchFeePhrase(text: string): PhraseMatch | null {
  if (EXCLUDE_RE.test(text)) {
    return null;
  }
  const match = FEE_RE.exec(text);
  if (match === null) {
    return null;
  }
  const captured = match[1];
  if (captured === undefined) {
    return null;
  }
  return { phrase: captured.toLowerCase() };
}

export function isCurrencyAmount(text: string): boolean {
  return CURRENCY_ONLY_RE.test(text);
}

const INTERACTIVE_TAGS = new Set([
  "button",
  "select",
  "option",
  "input",
  "textarea",
  "label",
]);
const INTERACTIVE_ROLES = new Set([
  "button",
  "tab",
  "menuitem",
  "option",
  "checkbox",
  "radio",
  "switch",
]);
const NAVIGATION_TAGS = new Set(["nav", "header", "footer"]);
const NAVIGATION_ROLES = new Set(["navigation", "banner", "contentinfo"]);
const PAGE_BOUNDARY_TAGS = new Set(["main", "body", "html"]);
const ORDER_SUMMARY_CONTAINER_TAGS = new Set([
  "aside",
  "section",
  "div",
  "ul",
  "ol",
]);

function isInteractiveAncestor(element: Element): boolean {
  if (INTERACTIVE_TAGS.has(element.localName)) {
    return true;
  }
  const role = element.getAttribute("role");
  return role !== null && INTERACTIVE_ROLES.has(role);
}

function isNavigationAncestor(element: Element): boolean {
  if (NAVIGATION_TAGS.has(element.localName)) {
    return true;
  }
  const role = element.getAttribute("role");
  return role !== null && NAVIGATION_ROLES.has(role);
}

function isPageBoundary(element: Element): boolean {
  if (PAGE_BOUNDARY_TAGS.has(element.localName)) {
    return true;
  }
  return element.getAttribute("role") === "main";
}

function readAriaLabel(element: Element): string {
  const direct = element.getAttribute("aria-label");
  if (direct !== null && direct.length > 0) {
    return direct;
  }
  const labelledby = element.getAttribute("aria-labelledby");
  if (labelledby === null || labelledby.length === 0) {
    return "";
  }
  // aria-labelledby can list multiple IDs; concatenate their visible text.
  // Leading/trailing whitespace on the attribute would otherwise yield empty
  // string IDs from the split — `CSS.escape("")` is `""`, and
  // `querySelector("#")` throws. Same guard pattern as `readAccessibleName`
  // in `trust-badge-annotate.ts`.
  const document_ = element.ownerDocument;
  const parts: string[] = [];
  for (const id of labelledby.split(/\s+/)) {
    if (id === "") {
      continue;
    }
    const labelElement = document_.querySelector(`#${CSS.escape(id)}`);
    if (labelElement !== null) {
      parts.push(labelElement.textContent.trim());
    }
  }
  return parts.join(" ");
}

function isOrderSummaryContainer(element: Element): boolean {
  const tag = element.localName;
  // A <table> at checkout is almost always an order-summary layout. The
  // priced-row count gate later filters tables that don't actually carry
  // line items.
  if (tag === "table") {
    return true;
  }
  // ARIA region with order-summary labelling.
  if (
    element.getAttribute("role") === "region" &&
    ORDER_SUMMARY_ARIA_RE.test(readAriaLabel(element))
  ) {
    return true;
  }
  // Container element with cart-shaped class or id.
  if (ORDER_SUMMARY_CONTAINER_TAGS.has(tag)) {
    const className =
      typeof element.className === "string" ? element.className : "";
    const idAttribute = element.id;
    if (
      CART_CONTAINER_NAME_RE.test(className) ||
      (idAttribute.length > 0 && CART_CONTAINER_NAME_RE.test(idAttribute))
    ) {
      return true;
    }
  }
  // schema.org Order microdata.
  const itemtype = element.getAttribute("itemtype");
  return itemtype !== null && /\bOrder\b/i.test(itemtype);
}

export function findOrderSummaryAncestor(label: Element): HTMLElement | null {
  let cursor: Element | null = label.parentElement;
  let hops = 0;
  while (cursor !== null && hops < MAX_ANCESTOR_HOPS) {
    if (isInteractiveAncestor(cursor) || isNavigationAncestor(cursor)) {
      return null;
    }
    if (isPageBoundary(cursor)) {
      return null;
    }
    if (cursor instanceof HTMLElement && isOrderSummaryContainer(cursor)) {
      return cursor;
    }
    cursor = cursor.parentElement;
    hops++;
  }
  return null;
}

function findEmbeddedAmount(label: Element): string | null {
  const text = label.textContent.trim();
  const match = EMBEDDED_AMOUNT_RE.exec(text);
  return match === null ? null : match[0];
}

function findSiblingAmount(label: Element): string | null {
  const parent = label.parentElement;
  if (parent === null) {
    return null;
  }
  for (const sibling of parent.children) {
    if (sibling === label || label.contains(sibling)) {
      continue;
    }
    const text = sibling.textContent.trim();
    if (text.length > 0 && text.length < 40 && isCurrencyAmount(text)) {
      return text;
    }
  }
  // Walk up one more level — the label might live inside a label-block
  // sibling of an amount-block (common in flex/grid row layouts).
  const grandparent = parent.parentElement;
  if (grandparent === null || grandparent.children.length > 8) {
    return null;
  }
  for (const sibling of grandparent.children) {
    if (sibling === parent || sibling.contains(label)) {
      continue;
    }
    const text = sibling.textContent.trim();
    if (text.length > 0 && text.length < 40 && isCurrencyAmount(text)) {
      return text;
    }
  }
  return null;
}

export function findAmountForLabel(label: Element): string | null {
  return findEmbeddedAmount(label) ?? findSiblingAmount(label);
}

function findRowAncestor(
  amountElement: Element,
  container: Element,
): Element | null {
  let row: Element | null = amountElement.parentElement;
  while (row !== null && row !== container) {
    let hasLabel = false;
    let hasAmount = false;
    for (const child of row.children) {
      if (child === amountElement || child.contains(amountElement)) {
        hasAmount = true;
      } else {
        const text = child.textContent.trim();
        if (text.length > 0 && !isCurrencyAmount(text)) {
          hasLabel = true;
        }
      }
    }
    if (hasLabel && hasAmount) {
      return row;
    }
    row = row.parentElement;
  }
  return null;
}

export function countPricedRows(container: Element): number {
  const seenRows = new Set<Element>();
  for (const element of container.querySelectorAll<HTMLElement>("*")) {
    if (element.children.length > 0) {
      continue;
    }
    const text = element.textContent.trim();
    if (text.length === 0 || text.length > 100) {
      continue;
    }
    if (!EMBEDDED_AMOUNT_RE.test(text)) {
      continue;
    }
    // Two row shapes:
    //   - Pure currency leaf in its own cell — walk up to the row that
    //     pairs it with a label sibling.
    //   - Embedded amount in a label cell ("Resort Fee $45.00") — the
    //     leaf itself IS the row.
    const row = isCurrencyAmount(text)
      ? findRowAncestor(element, container)
      : element;
    if (row === null || seenRows.has(row)) {
      continue;
    }
    seenRows.add(row);
  }
  let count = 0;
  for (const row of seenRows) {
    if (SUMMARY_TOTAL_RE.test(row.textContent.trim())) {
      continue;
    }
    count++;
  }
  return count;
}

function isDenylistedHost(href: string): boolean {
  try {
    const parsed = new URL(href);
    return HOST_DENYLIST.has(parsed.hostname);
  } catch {
    return false;
  }
}

interface Candidate {
  element: HTMLElement;
  phrase: string;
  amount: string | null;
}

function isCandidateSkipped(element: HTMLElement): boolean {
  if (element.hasAttribute(FLAGGED_ATTR)) {
    return true;
  }
  // Skip the chip itself and anything nested inside it so the chip's own
  // text doesn't drive recursive re-annotation.
  if (element.classList.contains(FLAG_CLASS)) {
    return true;
  }
  if (element.closest(`.${FLAG_CLASS}`)) {
    return true;
  }
  // If a descendant has already been flagged (annotated *or* considered
  // and rejected), the matching text lives there — re-evaluating an
  // ancestor with inherited textContent would be redundant.
  return Boolean(element.querySelector(`[${FLAGGED_ATTR}]`));
}

function collectCandidates(root: ParentNode): Candidate[] {
  const out: Candidate[] = [];
  const matches = findInnermostMatches<PhraseMatch>(root, {
    isSkipped: isCandidateSkipped,
    maxTextLength: MAX_LABEL_TEXT_LENGTH,
    maxDescendants: MAX_LABEL_DESCENDANTS,
    match: (text) => matchFeePhrase(text),
  });
  for (const { element, match } of matches) {
    const container = findOrderSummaryAncestor(element);
    if (container === null) {
      element.setAttribute(FLAGGED_ATTR, "no-summary-ancestor");
      continue;
    }
    const amount = findAmountForLabel(element);
    if (amount === null) {
      element.setAttribute(FLAGGED_ATTR, "no-adjacent-amount");
      continue;
    }
    if (countPricedRows(container) < MIN_PRICED_ROWS) {
      element.setAttribute(FLAGGED_ATTR, "single-item-cart");
      continue;
    }
    out.push({ element, phrase: match.phrase, amount });
  }
  return out;
}

function flag(candidate: Candidate): void {
  const { element, phrase, amount } = candidate;
  if (!element.isConnected) {
    return;
  }
  // Re-flagging the same element should be a no-op. `collectCandidates`
  // sets the attribute on rejected candidates too; an attribute value of
  // "" indicates an active annotation.
  if (element.getAttribute(FLAGGED_ATTR) === "") {
    return;
  }
  traceMutation({ ruleId: RULE_ID, kind: "flag", target: element }, () => {
    element.setAttribute(FLAGGED_ATTR, "");

    const chip = document.createElement("span");
    chip.className = FLAG_CLASS;
    chip.setAttribute(RULE_ATTR, RULE_ID);
    // Inline styling so the annotation survives
    // stripped-extension-CSS pages. Block display puts the chip on
    // its own visual line above the row text without disturbing the
    // existing layout.
    chip.style.display = "block";
    chip.style.padding = "2px 6px";
    chip.style.margin = "0 0 4px 0";
    chip.style.border = "1px solid #b00";
    chip.style.background = "#fff5f5";
    chip.style.color = "#900";
    chip.style.font = "12px/1.4 system-ui, sans-serif";
    chip.style.fontStyle = "italic";
    const amountSuffix = amount === null ? "" : `, "${amount}"`;
    chip.textContent = `[abs: drip-pricing fee (${phrase}${amountSuffix}) — verify the total before completing checkout]`;
    element.prepend(chip);
  });
}

function scanAndFlag(root: ParentNode): void {
  if (!isCheckoutUrl(location.href)) {
    return;
  }
  if (isDenylistedHost(location.href)) {
    return;
  }
  const candidates = collectCandidates(root);
  if (candidates.length === 0) {
    return;
  }
  for (const candidate of candidates) {
    flag(candidate);
  }
  log.info("hidden fees flagged", {
    count: candidates.length,
    phrases: candidates.map((c) => c.phrase),
    url: location.href,
  });
}

export const hiddenFeeAnnotateRule = createScanRule({
  id: RULE_ID,
  scan: scanAndFlag,
  label: "Annotate Drip-Pricing Fees (Experimental)",
  description:
    "On checkout pages, flag mandatory fees that only surface inside the order summary (resort, service, convenience, processing, etc.) with a visible annotation. The row is not removed — the agent reads the annotation and verifies the total before completing the purchase.",
});
