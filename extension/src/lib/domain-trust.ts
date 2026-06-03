// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Domain comparison primitives for rules that need to decide whether two
// hostnames represent the same registrable identity. Uses the Mozilla
// Public Suffix List via `tldts`, restricted to the ICANN section.
//
// We deliberately ignore the PSL "Private" section (`github.io`,
// `*.vercel.app`, `*.s3.amazonaws.com`, etc.). The Private section is
// useful for browsers deciding cookie scope but wrong for trust
// comparisons: `attacker.github.io` and `victim.github.io` would each be
// their own "registrable domain" under the Private rules, hiding the
// fact that they share an underlying host whose content boundary is
// soft. ICANN-only keeps the comparison conservative — two pages on
// `*.github.io` collapse to the same registrable domain, which matches
// what an unearned-authority check needs to know.
//
// IP literals don't have a registrable domain in the DNS sense; we let
// them stand in for one (returning the IP itself) so a mixed comparison
// — visible text like "paypal.com" against an href pointing to a raw IP
// — still surfaces as a mismatch rather than getting silently skipped.

import { parse } from "tldts";

const TLDTS_OPTIONS = {
  allowIcannDomains: true,
  allowPrivateDomains: false,
} as const;

export function registrableDomain(host: string): string | null {
  if (host === "") {
    return null;
  }
  const parsed = parse(host, TLDTS_OPTIONS);
  if (parsed.isIp === true && parsed.hostname !== null) {
    return parsed.hostname;
  }
  return parsed.domain;
}

// True iff both hostnames resolve to the same registrable domain. Returns
// false when either side cannot be resolved (empty, single-label host,
// unparseable input) — "we can't tell" is treated as "not the same" so
// trust checks fail closed.
export function sameRegistrableDomain(a: string, b: string): boolean {
  const dA = registrableDomain(a);
  if (dA === null) {
    return false;
  }
  return dA === registrableDomain(b);
}
