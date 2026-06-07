// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Shared primitives for verifying schema.org authority claims (the
// `Organization`-typed nodes that show up as `Article.publisher`,
// `Article.sourceOrganization`, `ClaimReview.author`, or as a top-level
// brand assertion). Both the JSON-LD and microdata extraction paths
// converge on the same question — does the URL the claim provides live
// on the same registrable domain as the page asserting it? — and on the
// same sanitize action (blank `name`, `url`, `@id`).

import { registrableDomain } from "./domain-trust";

// Schema.org @type values we treat as carrying organizational authority
// strongly enough to *blank* identity fields when the URL doesn't match.
// `Person` is intentionally NOT in this set — see ANNOTATE_ONLY_AUTHORITY_TYPES
// below for the weaker treatment.
//
// Match is by substring on the bare type name so a `@type` of
// `"https://schema.org/NewsMediaOrganization"` (the long-form IRI form)
// is treated the same as the bare `"NewsMediaOrganization"`.
export const AUTHORITY_TYPES: ReadonlySet<string> = new Set([
  "Organization",
  "NewsMediaOrganization",
  "OnlineBusiness",
  "EducationalOrganization",
  "GovernmentOrganization",
  "Corporation",
  "NGO",
  "MediaOrganization",
]);

// Schema.org @type values we treat as carrying *borrowed* authority — strong
// enough to flag a cross-RD URL as unverifiable, not strong enough to blank
// the identity outright. Concretely: `Person`. We can't sanitize Person.url
// mismatches because they're routinely legitimate (a guest author on
// nytimes.com linking to their personal site at janedoe.example, an academic
// `author` whose `url` is their university page). But the same shape is also
// the exact carrier for byline impersonation — a scam page asserting
// `Article.author = Person{name:"Sanjay Gupta", url:"cnn.com"}` to borrow
// CNN's authority. The annotate path lets an agent reading structured data
// see "this authority claim has no domain binding" without erasing genuine
// metadata.
export const ANNOTATE_ONLY_AUTHORITY_TYPES: ReadonlySet<string> = new Set([
  "Person",
]);

// Schema.org property names whose values inherit organizational authority
// from the enclosing entity (the Article, ClaimReview, Product, etc.). A
// `Person` standing alone (e.g. a top-level bio page typed as `Person`) is
// not making a cross-domain authority claim — only one nested under one of
// these properties is. Restricting the annotate path to these properties is
// what makes it safe to ship: a personal homepage typed as `@type: Person`
// with a cross-RD `url` is not borrowing anyone's authority and is left
// alone.
export const AUTHORITY_CONTEXT_PROPERTIES: ReadonlySet<string> = new Set([
  "author",
  "editor",
  "publisher",
  "creator",
  "contributor",
  "maintainer",
  "sourceOrganization",
  "reviewedBy",
  "funder",
  "sponsor",
  "provider",
  "producer",
]);

// Fields to blank on an authority object whose URL doesn't match the
// page. The agent still sees the structural shape of the claim
// (`@type: Organization`), it just loses the impersonating identity
// strings.
export const SANITIZE_KEYS: readonly string[] = ["name", "url", "@id"];

// JSON-LD key we add to a Person object whose borrowed-authority URL
// doesn't match the page. The `abs:` prefix namespaces the assertion so
// it can't collide with a real schema.org property and is recognizable
// to any agent that's inspecting the structured data.
export const UNVERIFIED_AUTHORITY_KEY = "abs:unverified-authority";

// Page hosts where mismatched publisher claims are expected, not
// suspicious — aggregators, AMP caches, web archives, reader-mode
// proxies. The rule short-circuits entirely when the page is on one of
// these, leaving every authority claim alone. Suffix matches are
// expressed with a leading dot so `googleusercontent.com` matches both
// `lh3.googleusercontent.com` and the bare apex.
//
// Kept small and hand-curated; a longer list belongs in a generated
// data file once we have real-world telemetry to drive selection.
const SKIP_EXACT_HOSTS: ReadonlySet<string> = new Set([
  "news.google.com",
  "news.yahoo.com",
  "news.msn.com",
  "flipboard.com",
  "smartnews.com",
  "apple.news",
  "web.archive.org",
  "archive.today",
  "archive.ph",
  "feedly.com",
  "getpocket.com",
]);

const SKIP_HOST_SUFFIXES: readonly string[] = [
  ".cdn.ampproject.org",
  ".translate.goog",
];

export function shouldSkipPage(pageHost: string): boolean {
  const host = pageHost.toLowerCase();
  if (SKIP_EXACT_HOSTS.has(host)) {
    return true;
  }
  return SKIP_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

// Normalize a `@type` value (string or array of strings, with optional
// `https://schema.org/` IRI prefix) into the set of bare type names.
export function typeNames(rawType: unknown): string[] {
  const values = Array.isArray(rawType) ? rawType : [rawType];
  const out: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }
    const slash = value.lastIndexOf("/");
    out.push(slash === -1 ? value : value.slice(slash + 1));
  }
  return out;
}

export function isAuthorityType(rawType: unknown): boolean {
  return typeNames(rawType).some((name) => AUTHORITY_TYPES.has(name));
}

export function isAnnotateOnlyAuthorityType(rawType: unknown): boolean {
  return typeNames(rawType).some((name) =>
    ANNOTATE_ONLY_AUTHORITY_TYPES.has(name),
  );
}

export function isAuthorityContextProperty(name: string): boolean {
  return AUTHORITY_CONTEXT_PROPERTIES.has(name);
}

// True iff `claimUrl` resolves to a different registrable domain than
// `pageHost`. Returns false (no mismatch) when either side can't be
// parsed — we'd rather under-sanitize than blank fields based on a
// guess.
export function isAuthorityUrlMismatch(
  claimUrl: string,
  pageHost: string,
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(claimUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }
  const claimRD = registrableDomain(parsed.hostname);
  const pageRD = registrableDomain(pageHost);
  if (claimRD === null || pageRD === null) {
    return false;
  }
  return claimRD !== pageRD;
}
