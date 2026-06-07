// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

/**
 * @jest-environment jsdom
 */

// Property-based tests for `link-spoof-annotate`. Two invariants worth
// pinning:
//
//   1. The skeleton-based homograph trigger must NEVER fire on
//      pure-ASCII Latin visible text. A regression that lets it fire
//      on Latin would chip every link on the page.
//
//   2. An anchor whose visible text matches its href on the
//      registrable-domain level must NEVER be flagged. Catches the
//      "we got too aggressive with DOMAIN_RE" class of regression.
//
//   3. Cross-form IDN equivalence: for a small fixture set of legitimate
//      IDN domains, an anchor whose visible text is the Unicode form
//      and whose href is the punycode form must NOT trigger the
//      text/href mismatch branch. Fixture-driven (not pure fuzz) because
//      generating arbitrary IDN↔punycode pairs in fast-check is awkward,
//      but the property still holds across the set.

import fc from "fast-check";

import { detectSpoof } from "../link-spoof-annotate";

function makeAnchor(text: string, href: string): HTMLAnchorElement {
  const a = document.createElement("a");
  a.setAttribute("href", href);
  a.textContent = text;
  return a;
}

// Random Latin label: 1–24 lowercase letters. Combined into a 2-label
// domain with a 2–4 char TLD. Avoids leading/trailing/double hyphens
// and other DNS-invalid shapes — those aren't the FP risk surface.
const labelArb = fc.stringMatching(/^[a-z]{1,24}$/);
const tldArb = fc.stringMatching(/^[a-z]{2,4}$/);
const asciiDomainArb = fc
  .tuple(labelArb, tldArb)
  .map(([label, tld]) => `${label}.${tld}`);

// Pure-ASCII visible text of arbitrary shape — letters, digits, spaces,
// common punctuation. Used to assert the skeleton trigger never fires.
const asciiVisibleTextArb = fc.stringMatching(/^[A-Za-z0-9 .,!?'"-]{1,80}$/);

describe("link-spoof-annotate skeleton trigger (property)", () => {
  it("never fires on pure-ASCII visible text", () => {
    fc.assert(
      fc.property(asciiVisibleTextArb, (text) => {
        const anchor = makeAnchor(text, "https://example.com/");
        const triggers = detectSpoof(anchor);
        // Either no triggers, or only the text/href mismatch branch —
        // homoglyphSkeleton must stay null for pure-ASCII input.
        if (triggers !== null) {
          expect(triggers.homoglyphSkeleton).toBeNull();
        }
      }),
      { numRuns: 200 },
    );
  });
});

describe("link-spoof-annotate same-host invariance (property)", () => {
  it("does not flag an anchor whose text and href share the registrable domain", () => {
    fc.assert(
      fc.property(asciiDomainArb, (domain) => {
        const anchor = makeAnchor(domain, `https://${domain}/`);
        expect(detectSpoof(anchor)).toBeNull();
      }),
      { numRuns: 200 },
    );
  });

  it("does not flag a www-prefixed href against an apex-only visible text", () => {
    fc.assert(
      fc.property(asciiDomainArb, (domain) => {
        const anchor = makeAnchor(domain, `https://www.${domain}/path`);
        expect(detectSpoof(anchor)).toBeNull();
      }),
      { numRuns: 200 },
    );
  });
});

// Legitimate IDN fixtures — Unicode form ↔ punycode form. Spot-checked
// via `new URL(...).hostname` so the punycode is the form a browser
// would produce.
const LEGITIMATE_IDN_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["президент.рф", "xn--d1abbgf6aiiy.xn--p1ai"],
  ["bücher.de", "xn--bcher-kva.de"],
  ["mañana.es", "xn--maana-pta.es"],
  ["香港.hk", "xn--j6w193g.hk"],
];

describe("link-spoof-annotate IDN cross-form equivalence", () => {
  it.each(
    LEGITIMATE_IDN_PAIRS,
  )("does not flag legitimate IDN %s ↔ %s", (unicode, punycode) => {
    const anchor = makeAnchor(unicode, `https://${punycode}/`);
    const triggers = detectSpoof(anchor);
    // textDomain mismatch must not fire — both sides resolve to the
    // same registrable domain after punycode normalization.
    expect(triggers?.textDomain ?? null).toBeNull();
    expect(triggers?.hrefHost ?? null).toBeNull();
  });
});
