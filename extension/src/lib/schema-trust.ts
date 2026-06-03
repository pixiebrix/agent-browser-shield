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

// Schema.org @type values we treat as carrying organizational authority.
// `Person` is intentionally excluded: legitimate guest authors and
// outside contributors routinely link to personal sites, so a
// cross-domain `author.url` is too noisy to act on in V1. The
// `Organization` subtypes we list here are the ones we see in real-world
// publisher / sourceOrganization / ClaimReview.author markup.
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

// Fields to blank on an authority object whose URL doesn't match the
// page. The agent still sees the structural shape of the claim
// (`@type: Organization`), it just loses the impersonating identity
// strings.
export const SANITIZE_KEYS: readonly string[] = ["name", "url", "@id"];

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
