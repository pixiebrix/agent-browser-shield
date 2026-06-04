// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Property-based tests for the Luhn-gated card detector. The regex
// (`\b(?:\d[ -]?){12,18}\d\b`) accepts plenty of digit-only strings the Luhn
// check then has to reject; fast-check explores that boundary with random
// digit sequences and computed check digits.

import fc from "fast-check";

import { PLACEHOLDER_CLASS } from "../../lib/placeholder";
import { piiRedactRule } from "../pii-redact";

// Compute the Luhn check digit for a numeric string. Doubling and -9
// folding matches the rule's `passesLuhn` so the appended digit yields a
// total divisible by 10.
function luhnCheckDigit(digits: string): string {
  let sum = 0;
  let alt = true; // rightmost data digit gets doubled (it becomes second-from-right after append)
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) {
        n -= 9;
      }
    }
    sum += n;
    alt = !alt;
  }
  const remainder = sum % 10;
  return String((10 - remainder) % 10);
}

// 12-18 body digits + 1 Luhn check digit = 13-19 total, matching the regex.
const cardDigitsArb = fc
  .integer({ min: 12, max: 18 })
  .chain((length) =>
    fc
      .stringMatching(new RegExp(`^[0-9]{${length}}$`))
      .map((body) => body + luhnCheckDigit(body)),
  );

// Flip the last digit by +1 (mod 10) — breaks the checksum, keeps length.
const invalidCardDigitsArb = cardDigitsArb.map((valid) => {
  const lastDigit = Number(valid.at(-1));
  return valid.slice(0, -1) + String((lastDigit + 1) % 10);
});

function applyPiiToText(text: string): HTMLElement {
  document.body.innerHTML = "";
  const p = document.createElement("p");
  p.textContent = text;
  document.body.append(p);
  piiRedactRule.apply(document.body);
  return document.body;
}

afterEach(() => {
  piiRedactRule.teardown();
  document.body.innerHTML = "";
});

describe("pii-redact Luhn detection (property)", () => {
  it("masks every Luhn-valid card number", () => {
    fc.assert(
      fc.property(cardDigitsArb, (card) => {
        const body = applyPiiToText(`card ${card} end`);
        const placeholder = body.querySelector(`.${PLACEHOLDER_CLASS}`);
        expect(placeholder?.textContent).toBe("[card hidden]");
        expect(body.textContent).not.toContain(card);
      }),
    );
  });

  it("leaves Luhn-invalid digit runs alone", () => {
    fc.assert(
      fc.property(invalidCardDigitsArb, (notCard) => {
        const body = applyPiiToText(`digits ${notCard} end`);
        // No card placeholder. The phone/SSN regex could in principle bite
        // (phone needs separators; SSN needs the 3-2-4 hyphen shape), but a
        // bare digit run won't hit either.
        const placeholder = body.querySelector(`.${PLACEHOLDER_CLASS}`);
        expect(placeholder).toBeNull();
        expect(body.textContent).toContain(notCard);
      }),
    );
  });
});
