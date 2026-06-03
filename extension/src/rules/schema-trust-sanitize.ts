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
// V1 scope is intentionally narrow: only `Organization` and its
// subtypes, only when the claim object exposes a `url` field, only
// matching at eTLD+1 (registrable domain). `Person.url` mismatches and
// name-only claims with no `url` to anchor against are out — they're
// noisier and need a brand allowlist to handle without false positives.
//
// Sanitize semantics: when a mismatch is detected we blank the
// identifying string fields (`name`, `url`, `@id`) on the offending
// object and leave the surrounding structure intact, so an agent still
// receives the article's price / rating / headline / dates but loses
// the impersonating identity. Pages on known syndicators, AMP caches,
// archive proxies, and reader-mode hosts short-circuit the rule
// entirely — mismatched publishers on those hosts are expected, not
// suspicious.

import {
  isAuthorityType,
  isAuthorityUrlMismatch,
  SANITIZE_KEYS,
  shouldSkipPage,
} from "../lib/schema-trust";
import { createSubtreeWatcher } from "../lib/subtree-watcher";
import type { Rule } from "./types";

const RULE_ID = "schema-trust-sanitize" as const;
const JSON_LD_SELECTOR = 'script[type="application/ld+json" i]';
const MICRODATA_SELECTOR = "[itemtype][itemscope]";

function getPageHost(): string {
  return globalThis.location.hostname;
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
    if (key in node && node[key] !== "") {
      node[key] = "";
      mutated.value = true;
    }
  }
}

function walk(
  value: unknown,
  pageHost: string,
  mutated: { value: boolean },
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      walk(item, pageHost, mutated);
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
  }
  for (const child of Object.values(node)) {
    walk(child, pageHost, mutated);
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
    script.textContent = JSON.stringify(parsed);
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
    // Walk up to find the nearest itemscope ancestor; if it isn't us,
    // the itemprop belongs to a nested scope.
    let parent = candidate.parentElement;
    let nearestScope: Element | null = null;
    while (parent !== null) {
      if (parent.hasAttribute("itemscope")) {
        nearestScope = parent;
        break;
      }
      parent = parent.parentElement;
    }
    if (nearestScope === scope) {
      out.push(candidate);
    }
  }
  return out;
}

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
  if (tag === "A" || tag === "LINK" || tag === "AREA") {
    return element.getAttribute("href") ?? "";
  }
  if (tag === "IMG" || tag === "AUDIO" || tag === "VIDEO" || tag === "SOURCE") {
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
  if (tag === "A" || tag === "LINK" || tag === "AREA") {
    if (element.getAttribute("href") !== "") {
      element.setAttribute("href", "");
      return true;
    }
    return false;
  }
  if (tag === "IMG" || tag === "AUDIO" || tag === "VIDEO" || tag === "SOURCE") {
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

function processItem(item: Element, pageHost: string): void {
  const itemtype = item.getAttribute("itemtype");
  if (itemtype === null) {
    return;
  }
  const types = microdataTypeNames(itemtype);
  if (!types.some((name) => isAuthorityType(name))) {
    return;
  }
  const urlElements = scopedDescendants(item, "url");
  let claimUrl: string | null = null;
  for (const element of urlElements) {
    const value = readItempropValue(element).trim();
    if (value !== "") {
      claimUrl = value;
      break;
    }
  }
  if (claimUrl === null) {
    // Fall back to itemid (microdata's @id-equivalent) if present.
    const itemid = item.getAttribute("itemid");
    if (itemid !== null && itemid !== "") {
      claimUrl = itemid;
    }
  }
  if (claimUrl === null || !isAuthorityUrlMismatch(claimUrl, pageHost)) {
    return;
  }
  for (const key of SANITIZE_KEYS) {
    // `@id` in microdata is the `itemid` attribute on the scope element.
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

const watcher = createSubtreeWatcher({
  onSubtrees: (roots) => {
    for (const root of roots) {
      processRoot(root);
    }
  },
});

function apply(root: ParentNode): void {
  processRoot(root);
  watcher.start(root);
}

export const schemaTrustSanitizeRule = {
  id: RULE_ID,
  label: "Sanitize Schema Trust Claims (Experimental)",
  description:
    "Blank schema.org Organization fields (name, url, @id) when the claim's URL is on a different registrable domain than the page. Defends against non-NYT pages asserting publisher = The New York Times, non-Snopes pages forging ClaimReview.author, and similar unearned-authority claims.",
  apply,
  teardown: () => {
    watcher.stop();
  },
} satisfies Rule;
