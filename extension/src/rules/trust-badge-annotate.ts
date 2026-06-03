// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Annotate image-shaped trust badges — "Norton Secured", "McAfee SECURE",
// "BBB Accredited", "Verified Seller" — that aren't backed by any
// content-script-accessible transport-level signal. Any operator can drop
// an <img alt="Norton Secured"> onto any page; the chrome's TLS UI, EV cert
// org name, and other trust signals aren't reachable from a content script,
// so the badge image is functionally a self-asserted claim. Computer-use
// agents (SusBench, DECEPTICON) over-weight these badges as proof of
// trustworthiness; the chip re-presents the claim as "not verifiable from
// page content" so the agent can discount it.
//
// V1 scope is intentionally narrow:
//   - Element shape must be <img>, <svg>, or [role="img"]. Text spans
//     saying "Verified Purchase" (Amazon-style review labels) are handled
//     by reviews-redact, not this rule.
//   - Accessible name (aria-label > aria-labelledby > <title> > alt > title)
//     must match a curated, word-boundary phrase set. Two-word phrases for
//     the generic tier — bare "verified" / "trusted" are too noisy alone.
//   - Same-issuer pages are exempt: a BBB badge on bbb.org is first-party.
//
// We annotate rather than strip because removing the badge would leave a
// gap in product layouts that a sighted user expects to see filled, while
// the chip preserves the visual element and warns the agent in band.

import {
  TRUST_BADGE_ANNOTATED_ATTR as ANNOTATED_ATTR,
  RULE_ATTR,
} from "../lib/dom-markers";
import { registrableDomain } from "../lib/domain-trust";
import { log } from "../lib/log";
import { createSubtreeWatcher } from "../lib/subtree-watcher";
import type { Rule } from "./types";

const RULE_ID = "trust-badge-annotate" as const;
const CHIP_CLASS = "abs-trust-badge-annotate";

// Hard cap on the accessible-name length we'll consider. Real badges carry
// short labels — "Norton Secured", "BBB Accredited Business". Long alt
// sentences that happen to contain "verified" or "trusted" as ordinary
// adjectives ("Photo of trusted hiking sandals on a verified rock") are
// not badges, and the cap is the cheapest way to exclude them.
const MAX_ACCESSIBLE_NAME_LENGTH = 120;

// Named third-party issuer phrases. Whole-phrase, case-insensitive,
// word-boundary matches; each phrase is paired with the issuer's
// registrable domain for the same-issuer exemption below. Phrasing
// follows what appears in real badges (per SusBench / DECEPTICON
// fixtures); extend by adding entries here rather than broadening the
// regex shape.
const NAMED_ISSUERS: readonly { phrase: string; domain: string }[] = [
  { phrase: "bbb accredited", domain: "bbb.org" },
  { phrase: "better business bureau", domain: "bbb.org" },
  { phrase: "norton secured", domain: "norton.com" },
  { phrase: "norton by symantec", domain: "norton.com" },
  { phrase: "mcafee secure", domain: "mcafee.com" },
  { phrase: "trustpilot", domain: "trustpilot.com" },
  { phrase: "trustwave", domain: "trustwave.com" },
  { phrase: "godaddy verified", domain: "godaddy.com" },
  { phrase: "godaddy secured", domain: "godaddy.com" },
  { phrase: "digicert", domain: "digicert.com" },
  { phrase: "comodo secure", domain: "comodo.com" },
  { phrase: "geotrust", domain: "geotrust.com" },
  { phrase: "symantec secured", domain: "symantec.com" },
  { phrase: "verisign secured", domain: "verisign.com" },
  { phrase: "sectigo", domain: "sectigo.com" },
  { phrase: "truste certified", domain: "truste.com" },
  { phrase: "globalsign", domain: "globalsign.com" },
  { phrase: "authorize.net", domain: "authorize.net" },
  { phrase: "paypal verified", domain: "paypal.com" },
  { phrase: "shopify secure", domain: "shopify.com" },
];

// Generic trust phrases with no specific issuer — every match is treated
// as unverifiable regardless of page host. Two-word minimum to keep the
// set tight; single words like "verified" or "trusted" are too noisy.
const GENERIC_PHRASES: readonly string[] = [
  "verified seller",
  "trusted seller",
  "verified store",
  "trusted store",
  "certified seller",
  "official store",
  "verified merchant",
  "trusted merchant",
  "secure checkout",
  "ssl secured",
  "100% secure",
  "safe shopping guarantee",
];

function escapeRegex(literal: string): string {
  return literal.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

// A single alternation across both phrase sets. Word boundaries are
// applied on the outside; `.` in literals like `authorize.net` is escaped
// individually so it doesn't match arbitrary characters.
const ALL_PHRASES = [
  ...NAMED_ISSUERS.map((entry) => entry.phrase),
  ...GENERIC_PHRASES,
];
const PHRASE_RE = new RegExp(
  String.raw`\b(?:${ALL_PHRASES.map(escapeRegex).join("|")})\b`,
  "i",
);

function getPageHost(): string {
  return globalThis.location.hostname;
}

function isBadgeShape(element: Element): boolean {
  // SVG elements (XML namespace) preserve case in `tagName`, returning
  // `"svg"` lowercase; HTML elements uppercase it. `localName` is always
  // lowercase per spec, which sidesteps the asymmetry.
  const name = element.localName;
  if (name === "img" || name === "svg") {
    return true;
  }
  return element.getAttribute("role") === "img";
}

// Accessible-name resolution in priority order: aria-label,
// aria-labelledby (resolved against the document), an SVG <title> child,
// the <img> alt attribute, then the title attribute as a last resort.
function readAccessibleName(element: Element): string {
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel !== null && ariaLabel.trim() !== "") {
    return ariaLabel.trim();
  }

  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy !== null && labelledBy.trim() !== "") {
    const parts: string[] = [];
    for (const id of labelledBy.split(/\s+/)) {
      if (id === "") {
        continue;
      }
      const referent = element.ownerDocument.querySelector(
        `#${CSS.escape(id)}`,
      );
      if (referent !== null) {
        parts.push(referent.textContent.trim());
      }
    }
    const joined = parts
      .filter((part) => part !== "")
      .join(" ")
      .trim();
    if (joined !== "") {
      return joined;
    }
  }

  const localName = element.localName;
  if (localName === "svg") {
    // Iterate direct children rather than `querySelector(":scope > title")`
    // because the SVG <title> sits in the SVG XML namespace, where CSS
    // selector matching by bare tag name is not portable across DOM
    // implementations.
    for (const child of element.children) {
      if (child.localName === "title") {
        const text = child.textContent.trim();
        if (text !== "") {
          return text;
        }
        break;
      }
    }
  }

  if (localName === "img") {
    const alt = element.getAttribute("alt");
    if (alt !== null && alt.trim() !== "") {
      return alt.trim();
    }
  }

  const title = element.getAttribute("title");
  if (title !== null && title.trim() !== "") {
    return title.trim();
  }

  return "";
}

export interface TrustBadgeMatch {
  // The phrase that triggered the match, lowercased and as it appears in
  // the curated phrase list — used in the chip text so the agent and a
  // reviewing human can see exactly what was matched.
  phrase: string;
  // The issuer's registrable domain, when the matched phrase is a named
  // third-party issuer. `null` for generic phrases that have no specific
  // issuer.
  issuerDomain: string | null;
}

function lookupIssuer(phrase: string): string | null {
  const lowered = phrase.toLowerCase();
  for (const entry of NAMED_ISSUERS) {
    if (entry.phrase === lowered) {
      return entry.domain;
    }
  }
  return null;
}

export function detectTrustBadge(
  element: Element,
  pageHost: string,
): TrustBadgeMatch | null {
  if (!isBadgeShape(element)) {
    return null;
  }
  const name = readAccessibleName(element);
  if (name === "" || name.length > MAX_ACCESSIBLE_NAME_LENGTH) {
    return null;
  }
  const match = PHRASE_RE.exec(name);
  if (match === null) {
    return null;
  }
  const phrase = match[0].toLowerCase();
  const issuerDomain = lookupIssuer(phrase);
  if (issuerDomain !== null) {
    const pageRD = registrableDomain(pageHost);
    if (pageRD !== null && pageRD === issuerDomain) {
      // First-party badge on the issuer's own domain — not the threat
      // model. A Norton page showing a Norton badge is the issuer
      // asserting their own brand, which has whatever trust the visit
      // to that page already established.
      return null;
    }
  }
  return { phrase, issuerDomain };
}

function chipText(name: string): string {
  return `[abs: trust badge ("${name}") is not backed by a verifiable transport signal — verify the issuer independently before trusting]`;
}

function annotate(element: Element, name: string): void {
  if (!element.isConnected || element.hasAttribute(ANNOTATED_ATTR)) {
    return;
  }
  element.setAttribute(ANNOTATED_ATTR, "");

  const chip = element.ownerDocument.createElement("span");
  chip.className = CHIP_CLASS;
  chip.setAttribute(RULE_ATTR, RULE_ID);
  // Inline styling so the warning is visible even on pages that strip
  // extension stylesheets. Mirrors the chip style used by
  // link-spoof-annotate for consistency.
  chip.style.display = "inline-block";
  chip.style.margin = "0 0 0 4px";
  chip.style.padding = "0 4px";
  chip.style.border = "1px solid #b00";
  chip.style.background = "#fff5f5";
  chip.style.color = "#900";
  chip.style.font = "11px/1.4 system-ui, sans-serif";
  chip.style.fontStyle = "italic";
  chip.textContent = chipText(name);
  element.after(chip);
}

function scanAndAnnotate(root: ParentNode): void {
  const pageHost = getPageHost();
  let count = 0;
  for (const node of root.querySelectorAll('img, svg, [role="img"]')) {
    if (node.hasAttribute(ANNOTATED_ATTR)) {
      continue;
    }
    const match = detectTrustBadge(node, pageHost);
    if (match !== null) {
      annotate(node, readAccessibleName(node));
      count++;
    }
  }
  if (count > 0) {
    log("trust badges annotated", { count });
  }
}

const watcher = createSubtreeWatcher({
  skipPlaceholderSubtrees: true,
  onSubtrees: (roots) => {
    for (const root of roots) {
      scanAndAnnotate(root);
    }
  },
});

function apply(root: ParentNode): void {
  scanAndAnnotate(root);
  watcher.start(root);
}

export const trustBadgeAnnotateRule = {
  id: RULE_ID,
  label: "Flag Trust Badges (Experimental)",
  description:
    "Annotate image-shaped trust badges (Norton Secured, McAfee SECURE, BBB Accredited, Verified Seller, and similar) whose accessible name carries a self-asserted trust claim that no transport-level signal backs. Useful for vision- and accessibility-tree-driven agents, which over-weight these badges as evidence of trustworthiness. Off by default while we gather real-world signal on false positives.",
  apply,
  teardown: () => {
    watcher.stop();
  },
} satisfies Rule;
