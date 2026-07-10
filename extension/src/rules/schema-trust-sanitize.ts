// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Sanitize schema.org Organization-typed claims whose `url` points to a
// different registrable domain than the page asserting them. Covers
// both `<script type="application/ld+json">` blocks and
// `[itemtype]`-marked microdata. The unearned-authority case the rule
// targets is a non-NYT page claiming `Article.publisher` is The New
// York Times, a non-Snopes page claiming `ClaimReview.author` is
// Snopes, or a top-level `@type: Organization` block on a domain that
// has no relationship to the named entity.
//
// Two treatments live in this rule, picked by `@type`:
//
//   * Organization-family @types are *sanitized* — `name` / `url` /
//     `@id` are blanked on a cross-RD mismatch. The agent still sees
//     `@type: Organization` and the surrounding metadata (headline,
//     price, dates) but loses the impersonating identity strings.
//   * `Person` is *annotated* — when nested under an authority context
//     property (author / editor / publisher / etc.) and the URL is
//     cross-RD, we stamp the JSON-LD object with
//     `abs:unverified-authority: true` and stamp the microdata scope
//     with `data-abs-schema-trust-unverified`. The identity is left
//     intact. The asymmetry is on purpose: sanitizing Person.url would
//     erase legitimate guest-author and academic bylines that
//     routinely link off-domain, but the same shape is the carrier for
//     byline impersonation (a scam page asserting `Article.author =
//     Person{name:"Sanjay Gupta", url:"cnn.com"}`). The annotation
//     gives an agent reading structured data the same domain-binding
//     warning the Organization path conveys by blanking, without
//     damaging real metadata. A standalone `@type: Person` (a personal
//     homepage) is left alone — it isn't borrowing anyone's authority,
//     so the cross-RD URL isn't a smoking gun.
//
// Pages on known syndicators, AMP caches, archive proxies, and
// reader-mode hosts short-circuit the rule entirely — mismatched
// publishers on those hosts are expected, not suspicious.

import { SCHEMA_TRUST_UNVERIFIED_ATTR } from "../lib/dom-markers";
import { createScanRule } from "../lib/scan-rule";
import {
  isAnnotateOnlyAuthorityType,
  isAuthorityContextProperty,
  isAuthorityType,
  isAuthorityUrlMismatch,
  SANITIZE_KEYS,
  shouldSkipPage,
  UNVERIFIED_AUTHORITY_KEY,
} from "../lib/schema-trust";
import { traceMutation } from "../lib/trace-mutation";

const RULE_ID = "schema-trust-sanitize" as const;
const JSON_LD_SELECTOR = 'script[type="application/ld+json" i]';
const MICRODATA_SELECTOR = "[itemtype][itemscope]";

function getPageHost(): string {
  return location.hostname;
}

// ---------- JSON-LD path ----------

function extractClaimUrl(node: Record<string, unknown>): string | null {
  const url = node.url;
  if (typeof url === "string" && url !== "") {
    return url;
  }
  const id = node["@id"];
  if (typeof id === "string" && id !== "") {
    return id;
  }
  return null;
}

function sanitizeAuthorityNode(
  node: Record<string, unknown>,
  mutated: { value: boolean },
): void {
  for (const key of SANITIZE_KEYS) {
    if (!(key in node) || node[key] === "") {
      continue;
    }

    node[key] = "";
    mutated.value = true;
  }
}

function annotateAuthorityNode(
  node: Record<string, unknown>,
  mutated: { value: boolean },
): void {
  if (node[UNVERIFIED_AUTHORITY_KEY] === true) {
    return;
  }
  node[UNVERIFIED_AUTHORITY_KEY] = true;
  mutated.value = true;
}

// `parentKey` is the property name under which this object lives in its
// containing object — `undefined` for the top-level node. It's used only
// to gate the Person annotate path: a Person under `author` (or one of
// the other authority-context properties) is borrowing organizational
// authority and worth flagging; a top-level `@type: Person` page is
// not. Arrays inherit the parent's key (a `Person[]` under `author` is
// still author-context).
function walk(
  value: unknown,
  pageHost: string,
  mutated: { value: boolean },
  parentKey?: string,
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      walk(item, pageHost, mutated, parentKey);
    }
    return;
  }
  if (value === null || typeof value !== "object") {
    return;
  }
  const node = value as Record<string, unknown>;
  if (isAuthorityType(node["@type"])) {
    const claimUrl = extractClaimUrl(node);
    if (claimUrl !== null && isAuthorityUrlMismatch(claimUrl, pageHost)) {
      sanitizeAuthorityNode(node, mutated);
    }
  } else if (
    parentKey !== undefined &&
    isAuthorityContextProperty(parentKey) &&
    isAnnotateOnlyAuthorityType(node["@type"])
  ) {
    const claimUrl = extractClaimUrl(node);
    if (claimUrl !== null && isAuthorityUrlMismatch(claimUrl, pageHost)) {
      annotateAuthorityNode(node, mutated);
    }
  }
  for (const [key, child] of Object.entries(node)) {
    walk(child, pageHost, mutated, key);
  }
}

function processScript(script: HTMLScriptElement, pageHost: string): void {
  const raw = script.textContent;
  if (raw.trim() === "") {
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  const mutated = { value: false };
  walk(parsed, pageHost, mutated);
  if (mutated.value) {
    traceMutation({ ruleId: RULE_ID, kind: "sanitize", target: script }, () => {
      script.textContent = JSON.stringify(parsed);
    });
  }
}

// ---------- Microdata path ----------

// Extract the bare schema.org type name (last URL segment) from an
// `itemtype` attribute. `itemtype` is space-separated and can carry
// multiple types per the HTML microdata spec.
function microdataTypeNames(itemtype: string): string[] {
  const out: string[] = [];
  for (const token of itemtype.split(/\s+/)) {
    if (token === "") {
      continue;
    }
    const slash = token.lastIndexOf("/");
    out.push(slash === -1 ? token : token.slice(slash + 1));
  }
  return out;
}

// Find the descendant `[itemprop=NAME]` that belongs to this item's
// scope — i.e. is not nested inside a deeper `[itemscope]` first. The
// microdata spec scopes itemprops to their nearest ancestor itemscope.
// Nearest ancestor with an `[itemscope]` attribute, or null if none.
function nearestItemscope(element: Element): Element | null {
  for (
    let parent = element.parentElement;
    parent !== null;
    parent = parent.parentElement
  ) {
    if (parent.hasAttribute("itemscope")) {
      return parent;
    }
  }
  return null;
}

function scopedDescendants(scope: Element, itempropName: string): Element[] {
  const out: Element[] = [];
  // Caller is the rule's internal code path; itempropName is one of a
  // small, known set of literals (`name`, `url`, `@id`) — all safe to
  // splice into a CSS attribute selector without escaping. The `~=`
  // match handles elements that declare multiple itemprops in a single
  // space-separated attribute.
  for (const candidate of scope.querySelectorAll(
    `[itemprop~="${itempropName}"]`,
  )) {
    if (candidate === scope) {
      continue;
    }
    // The itemprop belongs to us only if our scope is its nearest
    // itemscope ancestor; otherwise it's claimed by a deeper scope.
    if (nearestItemscope(candidate) === scope) {
      out.push(candidate);
    }
  }
  return out;
}

// Microdata URL carriers: <a>/<link>/<area> expose the value via href,
// <img>/<audio>/<video>/<source> via src.
const HREF_CARRIER_TAGS = new Set(["A", "LINK", "AREA"]);
const SRC_CARRIER_TAGS = new Set(["IMG", "AUDIO", "VIDEO", "SOURCE"]);

function readItempropValue(element: Element): string {
  // The microdata spec defines the itemprop value per element type:
  // <meta> uses content, <a>/<link>/<area> use href, <img>/<audio>/etc.
  // use src, <object> uses data, <time> uses datetime. We only need
  // enough to read URL-shaped claims, so cover the common carriers and
  // fall back to textContent.
  const tag = element.tagName;
  if (tag === "META") {
    return element.getAttribute("content") ?? "";
  }
  if (HREF_CARRIER_TAGS.has(tag)) {
    return element.getAttribute("href") ?? "";
  }
  if (SRC_CARRIER_TAGS.has(tag)) {
    return element.getAttribute("src") ?? "";
  }
  // `textContent` on an Element (not a Document or DocumentType) is
  // always a string per the DOM spec; the lib.dom.d.ts `string | null`
  // union is for the Node base type.
  return element.textContent;
}

function blankItempropValue(element: Element): boolean {
  const tag = element.tagName;
  if (tag === "META") {
    if (element.getAttribute("content") !== "") {
      element.setAttribute("content", "");
      return true;
    }
    return false;
  }
  if (HREF_CARRIER_TAGS.has(tag)) {
    if (element.getAttribute("href") !== "") {
      element.setAttribute("href", "");
      return true;
    }
    return false;
  }
  if (SRC_CARRIER_TAGS.has(tag)) {
    if (element.getAttribute("src") !== "") {
      element.setAttribute("src", "");
      return true;
    }
    return false;
  }
  if (element.textContent !== "") {
    element.textContent = "";
    return true;
  }
  return false;
}

// Microdata equivalent of the JSON-LD `parentKey` gate: in microdata,
// an item that's serving as the value of a property on the enclosing
// item carries that property name in its own `itemprop` attribute
// (e.g. `<div itemscope itemtype=".../Person" itemprop="author">`).
// Returns the property names this item is filling for its enclosing
// scope, or an empty array for a top-level item that isn't acting as
// anyone's property.
function itemPropertyContext(item: Element): string[] {
  const itemprop = item.getAttribute("itemprop");
  if (itemprop === null) {
    return [];
  }
  return itemprop.split(/\s+/).filter((name) => name !== "");
}

function readClaimUrl(item: Element): string | null {
  const urlElements = scopedDescendants(item, "url");
  for (const element of urlElements) {
    const value = readItempropValue(element).trim();
    if (value !== "") {
      return value;
    }
  }
  const itemid = item.getAttribute("itemid");
  if (itemid !== null && itemid !== "") {
    return itemid;
  }
  return null;
}

function processItem(item: Element, pageHost: string): void {
  const itemtype = item.getAttribute("itemtype");
  if (itemtype === null) {
    return;
  }
  const types = microdataTypeNames(itemtype);
  const isAuthority = types.some((name) => isAuthorityType(name));
  const isAnnotateOnly =
    !isAuthority && types.some((name) => isAnnotateOnlyAuthorityType(name));
  if (!isAuthority && !isAnnotateOnly) {
    return;
  }
  // For annotate-only (Person) we require an authority-context itemprop on
  // the item itself — a standalone Person scope (a personal bio page typed
  // as Person) is not borrowing anyone's authority, so a cross-RD URL
  // there isn't suspicious.
  if (isAnnotateOnly) {
    const context = itemPropertyContext(item);
    if (context.every((name) => !isAuthorityContextProperty(name))) {
      return;
    }
    if (item.hasAttribute(SCHEMA_TRUST_UNVERIFIED_ATTR)) {
      return;
    }
  }
  const claimUrl = readClaimUrl(item);
  if (claimUrl === null || !isAuthorityUrlMismatch(claimUrl, pageHost)) {
    return;
  }
  if (isAnnotateOnly) {
    traceMutation({ ruleId: RULE_ID, kind: "flag", target: item }, () => {
      item.setAttribute(SCHEMA_TRUST_UNVERIFIED_ATTR, "true");
    });
    return;
  }
  traceMutation({ ruleId: RULE_ID, kind: "sanitize", target: item }, () => {
    for (const key of SANITIZE_KEYS) {
      // `@id` in microdata is the `itemid` attribute on the scope
      // element.
      if (key === "@id") {
        if (item.getAttribute("itemid") !== null) {
          item.setAttribute("itemid", "");
        }
        continue;
      }
      for (const element of scopedDescendants(item, key)) {
        blankItempropValue(element);
      }
    }
  });
}

// ---------- Rule plumbing ----------

function processRoot(root: ParentNode): void {
  const pageHost = getPageHost();
  if (shouldSkipPage(pageHost)) {
    return;
  }
  if (root.nodeType === Node.ELEMENT_NODE) {
    const element = root as Element;
    if (element.matches(JSON_LD_SELECTOR)) {
      processScript(element as HTMLScriptElement, pageHost);
      return;
    }
    if (element.matches(MICRODATA_SELECTOR)) {
      processItem(element, pageHost);
      // Continue into descendants — a top-level item can contain nested
      // [itemscope] items that also need checking.
    }
  }
  for (const script of root.querySelectorAll<HTMLScriptElement>(
    JSON_LD_SELECTOR,
  )) {
    processScript(script, pageHost);
  }
  for (const item of root.querySelectorAll(MICRODATA_SELECTOR)) {
    processItem(item, pageHost);
  }
}

export const schemaTrustSanitizeRule = createScanRule({
  id: RULE_ID,
  scan: processRoot,
  label: "Sanitize Schema Trust Claims (Experimental)",
  description:
    "Blank schema.org Organization fields (name, url, @id) when the claim's URL is on a different registrable domain than the page. Defends against non-NYT pages asserting publisher = The New York Times, non-Snopes pages forging ClaimReview.author, and similar unearned-authority claims.",
});
