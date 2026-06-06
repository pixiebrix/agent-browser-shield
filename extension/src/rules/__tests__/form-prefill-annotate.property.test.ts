/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://shop.example.com/checkout"}
 */
// Property-based tests for form-prefill-annotate. fast-check explores the
// boundary cases the FP control gates are supposed to reject:
//   - autocomplete-token allowlist (recognized tokens never flag, off /
//     unrecognized tokens still flag if the value is present),
//   - <select> first-option vs. non-first-option default detection,
//   - geo-select skip across name/id/aria,
//   - idempotency under repeated apply().

import fc from "fast-check";

import { FORM_PREFILL_ANNOTATED_ATTR as FLAGGED_ATTR } from "../../lib/dom-markers";
import { formPrefillAnnotateRule, isGeoSelect } from "../form-prefill-annotate";

const FLAG_CLASS = "abs-form-prefill-annotate";

// Mirror of the AUTOFILL_TOKENS set in form-prefill-annotate.ts. Tests
// here are not required to exhaustively match — that's what the unit
// suite covers — but fast-check needs a concrete sample to draw from.
const AUTOFILL_TOKENS: readonly string[] = [
  "name",
  "given-name",
  "family-name",
  "email",
  "tel",
  "street-address",
  "address-line1",
  "address-line2",
  "address-level1",
  "address-level2",
  "country",
  "country-name",
  "postal-code",
  "bday",
  "organization",
];

// Token-shaped strings the autocomplete attribute might carry that
// are NOT in the allowlist. We want the rule to still flag a prefilled
// value when the site set one of these (custom or off-by-typo tokens).
const NON_AUTOFILL_TOKENS: readonly string[] = [
  "off",
  "shipping-notes",
  "promo-code",
  "referral-source",
  "marketing-opt-in",
  "loyalty-id",
];

const GEO_NAMES: readonly string[] = [
  "country",
  "state",
  "province",
  "region",
  "county",
  "locale",
  "language",
  "currency",
  "territory",
  "prefecture",
];

const NON_GEO_SELECT_NAMES: readonly string[] = [
  "shipping",
  "shipping_speed",
  "tip",
  "tip_percent",
  "donation_amount",
  "insurance_plan",
  "delivery_slot",
  "gift_wrap_style",
];

afterEach(() => {
  formPrefillAnnotateRule.teardown();
  document.body.innerHTML = "";
});

describe("autocomplete-token gating (property)", () => {
  it("never flags a text input whose autocomplete is a recognized autofill token", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...AUTOFILL_TOKENS),
        fc.stringMatching(/^[A-Za-z][A-Za-z0-9 @.-]{0,30}$/),
        (token, value) => {
          document.body.innerHTML = "";
          const form = document.createElement("form");
          const label = document.createElement("label");
          const input = document.createElement("input");
          input.type = "text";
          input.name = "x";
          input.setAttribute("autocomplete", token);
          input.setAttribute("value", value);
          label.append(input);
          form.append(label);
          document.body.append(form);

          formPrefillAnnotateRule.apply(document.body);
          const chips = document.querySelectorAll(`.${FLAG_CLASS}`).length;
          formPrefillAnnotateRule.teardown();
          expect(chips).toBe(0);
        },
      ),
    );
  });

  it("flags a text input whose autocomplete is unrecognized and value is non-empty", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...NON_AUTOFILL_TOKENS),
        fc.stringMatching(/^[A-Za-z][A-Za-z0-9 @.-]{0,30}$/),
        (token, value) => {
          document.body.innerHTML = "";
          const form = document.createElement("form");
          const label = document.createElement("label");
          const input = document.createElement("input");
          input.type = "text";
          input.name = "y";
          input.setAttribute("autocomplete", token);
          input.setAttribute("value", value);
          label.append(input);
          form.append(label);
          document.body.append(form);

          formPrefillAnnotateRule.apply(document.body);
          const chips = document.querySelectorAll(`.${FLAG_CLASS}`).length;
          formPrefillAnnotateRule.teardown();
          expect(chips).toBe(1);
        },
      ),
    );
  });
});

describe("isGeoSelect (property)", () => {
  it("returns true for selects whose name/id/aria contains a geo token", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...GEO_NAMES),
        fc.constantFrom("name", "id", "aria-label"),
        (geo, where) => {
          document.body.innerHTML = "";
          const select = document.createElement("select");
          select.setAttribute(where, `user_${geo}_picker`);
          document.body.append(select);
          const result = isGeoSelect(select);
          expect(result).toBe(true);
        },
      ),
    );
  });

  it("returns false for non-geo select names", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...NON_GEO_SELECT_NAMES),
        fc.constantFrom("name", "id", "aria-label"),
        (nonGeo, where) => {
          document.body.innerHTML = "";
          const select = document.createElement("select");
          select.setAttribute(where, nonGeo);
          document.body.append(select);
          const result = isGeoSelect(select);
          expect(result).toBe(false);
        },
      ),
    );
  });
});

describe("<select> first-option invariant (property)", () => {
  // Build a select with N options and explicitly mark one as `selected`.
  // The rule flags iff the selected index is > 0 AND the select isn't a
  // geo field. Total chip count must equal the number of selects whose
  // `selected` index is > 0.
  const selectArb = fc.record({
    name: fc.constantFrom(...NON_GEO_SELECT_NAMES),
    optionCount: fc.integer({ min: 2, max: 6 }),
    selectedIndex: fc.integer({ min: 0, max: 5 }),
  });

  it("annotates exactly the selects whose selected index is > 0", () => {
    fc.assert(
      fc.property(
        fc.array(selectArb, { minLength: 1, maxLength: 6 }),
        (specs) => {
          document.body.innerHTML = "";
          const form = document.createElement("form");
          let expected = 0;
          for (const spec of specs) {
            const select = document.createElement("select");
            select.name = spec.name;
            const index = spec.selectedIndex % spec.optionCount;
            for (let i = 0; i < spec.optionCount; i++) {
              const option = document.createElement("option");
              option.value = `v${i}`;
              option.textContent = `Option ${i}`;
              if (i === index) {
                option.setAttribute("selected", "");
              }
              select.append(option);
            }
            form.append(select);
            if (index > 0) {
              expected++;
            }
          }
          document.body.append(form);
          formPrefillAnnotateRule.apply(document.body);
          const chips = document.querySelectorAll(`.${FLAG_CLASS}`).length;
          formPrefillAnnotateRule.teardown();
          expect(chips).toBe(expected);
        },
      ),
      { numRuns: 40 },
    );
  });
});

describe("idempotency (property)", () => {
  it("applying twice yields the same chip count as once", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            kind: fc.constantFrom("text", "select"),
            value: fc.stringMatching(/^[A-Za-z0-9]{1,15}$/),
            sneaky: fc.boolean(),
          }),
          { minLength: 1, maxLength: 6 },
        ),
        (specs) => {
          document.body.innerHTML = "";
          const form = document.createElement("form");
          for (const [i, spec] of specs.entries()) {
            if (spec.kind === "text") {
              const input = document.createElement("input");
              input.type = "text";
              input.name = `f${i}`;
              if (spec.sneaky) {
                input.setAttribute("value", spec.value);
              }
              form.append(input);
            } else {
              const select = document.createElement("select");
              select.name = `f${i}`;
              for (let j = 0; j < 3; j++) {
                const option = document.createElement("option");
                option.value = `o${j}`;
                option.textContent = `O${j}`;
                if (spec.sneaky && j === 2) {
                  option.setAttribute("selected", "");
                }
                select.append(option);
              }
              form.append(select);
            }
          }
          document.body.append(form);

          formPrefillAnnotateRule.apply(document.body);
          const firstPass = document.querySelectorAll(`.${FLAG_CLASS}`).length;
          expect(
            document.querySelectorAll(`[${FLAGGED_ATTR}=""]`).length,
          ).toBeGreaterThanOrEqual(firstPass);

          formPrefillAnnotateRule.apply(document.body);
          const secondPass = document.querySelectorAll(`.${FLAG_CLASS}`).length;
          expect(secondPass).toBe(firstPass);

          formPrefillAnnotateRule.teardown();
        },
      ),
      { numRuns: 40 },
    );
  });
});
