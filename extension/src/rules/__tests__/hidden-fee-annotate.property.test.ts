/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://hotel.example.com/checkout"}
 */
// Property-based tests for hidden-fee-annotate. fast-check explores the
// boundary cases the FP control gates are supposed to reject: substring
// mentions sneaking past the whole-string regex, exclude-list / phrase-set
// overlap, currency-regex precision, single-item-cart counting, and
// idempotency under repeated apply().

import fc from "fast-check";

import { HIDDEN_FEE_ANNOTATED_ATTR as FLAGGED_ATTR } from "../../lib/dom-markers";
import {
  hiddenFeeAnnotateRule,
  isCurrencyAmount,
  matchFeePhrase,
} from "../hidden-fee-annotate";

const FLAG_CLASS = "abs-hidden-fee-annotate";

const PHRASES: ReadonlySet<string> = new Set([
  "service fee",
  "convenience fee",
  "processing fee",
  "resort fee",
  "destination fee",
  "facility fee",
  "handling fee",
  "venue fee",
  "delivery surcharge",
]);

const EXCLUDE_TERMS: readonly string[] = [
  "tax",
  "vat",
  "gst",
  "sales tax",
  "tip",
  "gratuity",
  "shipping",
  "delivery",
];

afterEach(() => {
  hiddenFeeAnnotateRule.teardown();
  document.body.innerHTML = "";
});

describe("matchFeePhrase precision (property)", () => {
  it("rejects any phrase preceded by alphanumeric prefix", () => {
    // Any letter/digit immediately before a phrase breaks the anchor —
    // ^Service Fee$ cannot match "XService Fee" or "1service fee".
    fc.assert(
      fc.property(
        fc.constantFrom(...PHRASES),
        fc.stringMatching(/^[A-Za-z0-9]{1,20}$/),
        (phrase, prefix) => {
          const text = `${prefix}${phrase}`;
          expect(matchFeePhrase(text)).toBeNull();
        },
      ),
    );
  });

  it("rejects any phrase followed by a free-text suffix without a separator", () => {
    // The trailing qualifier branch requires either a separator char
    // ([:|—–-·(]) or a whitespace-then-currency-symbol. Bare word suffixes
    // ("Service Fee Schedule", "Resort Fee applies") must not slip
    // through.
    fc.assert(
      fc.property(
        fc.constantFrom(...PHRASES),
        fc.stringMatching(/^[A-Za-z][A-Za-z ]{0,30}$/),
        (phrase, suffix) => {
          const text = `${phrase} ${suffix}`;
          // Guard the rare case where fast-check picks a suffix that
          // happens to start with another phrase from the set — the
          // resulting concatenation could still legitimately match.
          if (PHRASES.has(`${phrase} ${suffix}`.toLowerCase())) {
            return;
          }
          expect(matchFeePhrase(text)).toBeNull();
        },
      ),
    );
  });

  it("rejects phrases with policy-paragraph framing", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...PHRASES),
        fc.constantFrom(
          "Our",
          "Read more about our",
          "Information regarding our",
          "Details on the",
          "Note about",
        ),
        fc.constantFrom("policy", "schedule", "FAQ", "details", "applies"),
        (phrase, lead, trail) => {
          const text = `${lead} ${phrase} ${trail}`;
          expect(matchFeePhrase(text)).toBeNull();
        },
      ),
    );
  });
});

describe("phrase / exclude disjointness (property)", () => {
  it("no curated phrase matches the exclude regex", () => {
    fc.assert(
      fc.property(fc.constantFrom(...PHRASES), (phrase) => {
        // matchFeePhrase first runs the exclude check, then the phrase
        // check. A bare phrase like "service fee" must still match.
        expect(matchFeePhrase(phrase)).not.toBeNull();
      }),
    );
  });

  it("no exclude term matches the phrase set", () => {
    fc.assert(
      fc.property(fc.constantFrom(...EXCLUDE_TERMS), (term) => {
        expect(matchFeePhrase(term)).toBeNull();
      }),
    );
  });
});

describe("isCurrencyAmount precision (property)", () => {
  const validAmountArb = fc.tuple(
    fc.constantFrom("$", "£", "€", "¥", "¢", "₹", "₩"),
    fc.option(fc.constant(" "), { nil: "" }),
    fc
      .integer({ min: 0, max: 9_999_999 })
      .map((n) => n.toLocaleString("en-US")),
    fc.option(
      fc
        .integer({ min: 0, max: 99 })
        .map((c) => `.${c.toString().padStart(2, "0")}`),
      { nil: "" },
    ),
    fc.option(fc.constantFrom(" USD", " EUR", " GBP", " JPY", " CAD", " AUD"), {
      nil: "",
    }),
  );

  it("accepts well-formed currency amounts", () => {
    fc.assert(
      fc.property(validAmountArb, ([sym, sp, int, dec, code]) => {
        const text = `${sym}${sp}${int}${dec}${code}`;
        expect(isCurrencyAmount(text)).toBe(true);
      }),
    );
  });

  it("rejects pure integer strings without a currency symbol", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100_000 }), (n) => {
        expect(isCurrencyAmount(n.toString())).toBe(false);
      }),
    );
  });

  it("rejects alphabetic strings", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[A-Za-z ]{1,30}$/), (s) => {
        expect(isCurrencyAmount(s)).toBe(false);
      }),
    );
  });
});

interface SyntheticRow {
  label: string;
  amount: number;
  isFee: boolean;
}

const labelArb = fc.constantFrom(
  "Hotel room",
  "Concert ticket",
  "Flight",
  "Item A",
  "Item B",
  "Item C",
  "Show entry",
);

const rowArb: fc.Arbitrary<SyntheticRow> = fc.record({
  label: labelArb,
  amount: fc
    .integer({ min: 100, max: 100_000 })
    .map((cents) => Math.round(cents) / 100),
  isFee: fc.constant(false),
});

function buildCartContainer(rows: readonly SyntheticRow[]): HTMLElement {
  const container = document.createElement("aside");
  container.className = "order-summary";
  let total = 0;
  for (const row of rows) {
    const rowElement = document.createElement("div");
    rowElement.className = "row";
    const labelElement = document.createElement("span");
    labelElement.textContent = row.label;
    const amountElement = document.createElement("span");
    amountElement.textContent = `$${row.amount.toFixed(2)}`;
    rowElement.append(labelElement, amountElement);
    container.append(rowElement);
    total += row.amount;
  }
  const totalRow = document.createElement("div");
  totalRow.className = "row";
  totalRow.innerHTML = `<span>Total</span><span>$${total.toFixed(2)}</span>`;
  container.append(totalRow);
  return container;
}

describe("single-item-cart invariant (property)", () => {
  it("annotates the single fee row iff at least one non-fee priced row sits beside it", () => {
    const nonFeeRowsArb = fc.array(rowArb, { minLength: 0, maxLength: 5 });
    fc.assert(
      fc.property(nonFeeRowsArb, (nonFeeRows) => {
        document.body.innerHTML = "";
        const feeRow: SyntheticRow = {
          label: "Resort Fee",
          amount: 45,
          isFee: true,
        };
        const allRows = [...nonFeeRows, feeRow];
        const container = buildCartContainer(allRows);
        document.body.append(container);

        hiddenFeeAnnotateRule.apply(document.body);

        const chips = document.querySelectorAll(`.${FLAG_CLASS}`).length;
        if (nonFeeRows.length === 0) {
          expect(chips).toBe(0);
        } else {
          expect(chips).toBe(1);
        }

        hiddenFeeAnnotateRule.teardown();
      }),
      // Smaller run count — each iteration builds DOM and applies the
      // rule. 50 still hits both branches dozens of times.
      { numRuns: 50 },
    );
  });
});

describe("idempotency (property)", () => {
  it("applying the rule twice yields the same number of chips as once", () => {
    const nonFeeRowsArb = fc.array(rowArb, { minLength: 1, maxLength: 5 });
    fc.assert(
      fc.property(nonFeeRowsArb, (nonFeeRows) => {
        document.body.innerHTML = "";
        const feeRow: SyntheticRow = {
          label: "Service Fee",
          amount: 5,
          isFee: true,
        };
        const container = buildCartContainer([...nonFeeRows, feeRow]);
        document.body.append(container);

        hiddenFeeAnnotateRule.apply(document.body);
        const firstPass = document.querySelectorAll(`.${FLAG_CLASS}`).length;
        // Annotated row should carry the FLAGGED_ATTR marker.
        expect(document.querySelectorAll(`[${FLAGGED_ATTR}=""]`).length).toBe(
          firstPass,
        );

        hiddenFeeAnnotateRule.apply(document.body);
        const secondPass = document.querySelectorAll(`.${FLAG_CLASS}`).length;
        expect(secondPass).toBe(firstPass);

        hiddenFeeAnnotateRule.teardown();
      }),
      { numRuns: 50 },
    );
  });
});
