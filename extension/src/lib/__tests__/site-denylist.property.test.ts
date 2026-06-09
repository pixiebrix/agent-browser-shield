// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Property tests for the site-denylist matcher round-trip. Two invariants
// that example tests can't exhaust:
//   - For any content-scheme URL, the pattern produced by `addHostPattern`
//     subsequently matches that URL via `matchesDenylist`.
//   - After `removeMatchingPatterns(url, ...)`, no remaining pattern matches
//     `url` — even when the input list contained multiple overlapping
//     entries (host-specific, subdomain wildcard, exact URL).

import fc from "fast-check";

import {
  addHostPattern,
  matchesDenylist,
  removeMatchingPatterns,
} from "../site-denylist";

// Arbitrary content-scheme URLs the popup might encounter. Hostnames are
// constrained to ASCII labels so URLPattern's hostname parser sees the
// same shape browsers produce.
const arbHost = fc
  .array(fc.stringMatching(/^[a-z]([a-z0-9-]{0,30}[a-z0-9])?$/), {
    minLength: 1,
    maxLength: 3,
  })
  .filter((labels) => labels.length > 0)
  .map((labels) => labels.join("."));

const arbPath = fc
  .array(fc.stringMatching(/^[a-zA-Z0-9_-]{1,20}$/), { maxLength: 4 })
  .map((segments) => (segments.length === 0 ? "/" : `/${segments.join("/")}`));

const arbContentUrl = fc
  .tuple(fc.constantFrom("http:", "https:"), arbHost, arbPath)
  .map(([scheme, host, path]) => `${scheme}//${host}${path}`);

describe("site-denylist matcher round-trip", () => {
  it("addHostPattern produces a pattern that subsequently matches the URL", () => {
    fc.assert(
      fc.property(arbContentUrl, (url) => {
        const { patterns, added } = addHostPattern(url, []);
        expect(added).not.toBeNull();
        expect(matchesDenylist(url, patterns)).toBe(true);
      }),
    );
  });

  it("removeMatchingPatterns leaves no pattern matching the URL", () => {
    // Builds a list of patterns guaranteed to include at least one match:
    // the host pattern from `url`, plus optional additional patterns from
    // other arbitrary URLs (some of which may also coincidentally match).
    fc.assert(
      fc.property(
        arbContentUrl,
        fc.array(arbContentUrl, { maxLength: 5 }),
        (url, others) => {
          const seedPatterns: string[] = [];
          for (const other of [url, ...others]) {
            const { added } = addHostPattern(other, seedPatterns);
            if (added) {
              seedPatterns.push(added);
            }
          }
          // Sanity: at least the URL's own host pattern is in there.
          expect(matchesDenylist(url, seedPatterns)).toBe(true);

          const { patterns } = removeMatchingPatterns(url, seedPatterns);
          expect(matchesDenylist(url, patterns)).toBe(false);
        },
      ),
    );
  });
});
