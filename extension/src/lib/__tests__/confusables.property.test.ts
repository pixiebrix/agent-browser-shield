// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Property-based tests for the confusables skeleton helper. These pin
// the invariants the rule code depends on so that future map edits
// can't silently break them — most importantly, that the skeleton
// output is canonical (idempotent), is ASCII whenever input is drawn
// from the confusables alphabet, and is exactly `.toLowerCase()` on
// pure-ASCII input (i.e., no Latin codepoint was accidentally added
// to the table).

import fc from "fast-check";

import { skeleton } from "../confusables";

// Sample from the confusables alphabet — every codepoint that has a
// Latin target. Generated from the same source-of-truth as the map by
// listing the known keys; if the map shrinks, we want this to keep
// covering the surviving entries (which is naturally satisfied as
// long as we include only those characters).
const CONFUSABLE_CHARS = [
  "а",
  "е",
  "о",
  "р",
  "с",
  "у",
  "х",
  "ј",
  "і",
  "ѕ",
  "ӏ",
  "ԁ",
  "А",
  "В",
  "Е",
  "К",
  "М",
  "Н",
  "О",
  "Р",
  "С",
  "Т",
  "Х",
  "Ѕ",
  "І",
  "Ј",
  "Ү",
  "α",
  "ο",
  "ρ",
  "ν",
  "κ",
  "τ",
  "υ",
  "ι",
  "ε",
  "η",
  "ϲ",
  "Α",
  "Β",
  "Ε",
  "Ζ",
  "Η",
  "Ι",
  "Κ",
  "Μ",
  "Ν",
  "Ο",
  "Ρ",
  "Τ",
  "Υ",
  "Χ",
  "Ϲ",
  "օ",
  "ո",
  "ս",
  "հ",
];

const confusableStringArb = fc
  .array(fc.constantFrom(...CONFUSABLE_CHARS), { minLength: 1, maxLength: 16 })
  .map((chars) => chars.join(""));

const asciiLatinArb = fc.stringMatching(/^[A-Za-z]{1,32}$/);

describe("skeleton (property)", () => {
  it("is idempotent — second pass is a no-op", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 64 }), (s) => {
        expect(skeleton(skeleton(s))).toBe(skeleton(s));
      }),
      { numRuns: 200 },
    );
  });

  it("equals .toLowerCase() on pure ASCII Latin input", () => {
    // Catches accidental inclusion of an ASCII Latin codepoint in the
    // confusables map — the skeleton of "A" must be "a", not anything
    // else.
    fc.assert(
      fc.property(asciiLatinArb, (s) => {
        expect(skeleton(s)).toBe(s.toLowerCase());
      }),
      { numRuns: 200 },
    );
  });

  it("collapses any confusable-only input to pure-ASCII Latin", () => {
    // Load-bearing invariant for the rule's homograph trigger: every
    // entry in the map must target a lowercase ASCII Latin letter, so
    // that a domain made entirely of confusables skeletons cleanly to
    // /^[a-z]+$/ and the rule's `/^[a-z0-9.-]+$/` check fires.
    fc.assert(
      fc.property(confusableStringArb, (s) => {
        expect(skeleton(s)).toMatch(/^[a-z]+$/);
      }),
      { numRuns: 200 },
    );
  });

  it("preserves non-confusable codepoints (modulo case)", () => {
    // A digit run is neither in the confusables map nor affected by
    // .toLowerCase() — skeleton must be the identity on it.
    fc.assert(
      fc.property(fc.stringMatching(/^[0-9.-]{1,16}$/), (s) => {
        expect(skeleton(s)).toBe(s);
      }),
      { numRuns: 100 },
    );
  });
});
