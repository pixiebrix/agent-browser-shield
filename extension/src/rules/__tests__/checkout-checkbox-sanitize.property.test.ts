/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://shop.example.com/checkout"}
 */
// Property-based tests for checkout-checkbox-sanitize. The rule guarantees
// two invariants we want fast-check to hammer against arbitrary sequences
// of programmatic state writes:
//
//   1. While the URL is checkout-shaped and the box wears `CLEARED_ATTR`,
//      no sequence of `.checked = boolean` writes can leave the box in
//      a checked state. (`.click()` is the escape hatch — it routes
//      through the activation behavior, not the patched setter.)
//   2. The patch is selective: a fresh checkbox that the rule never
//      touched accepts arbitrary `.checked` writes verbatim.
//   3. URL gating is symmetric: once the SPA navigates away from a
//      checkout URL, a re-check on the (still-marked) box sticks again.

import fc from "fast-check";

import { CHECKOUT_CHECKBOX_CLEARED_ATTR as CLEARED_ATTR } from "../../lib/dom-markers";
import { checkoutCheckboxSanitizeRule } from "../checkout-checkbox-sanitize";

afterEach(() => {
  checkoutCheckboxSanitizeRule.teardown();
  document.body.innerHTML = "";
});

describe("cleared checkbox stays cleared under arbitrary .checked writes", () => {
  it("any sequence of programmatic writes resolves to unchecked", () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { minLength: 1, maxLength: 20 }),
        (writes) => {
          document.body.innerHTML = `<input id="upsell" type="checkbox" checked />`;
          const checkbox = document.querySelector(
            "#upsell",
          ) as HTMLInputElement;
          checkoutCheckboxSanitizeRule.apply(document.body);
          expect(checkbox.checked).toBe(false);

          for (const value of writes) {
            checkbox.checked = value;
            // The invariant: at no point may a programmatic write leave
            // the box checked. `value === true` is blocked outright;
            // `value === false` is a no-op pass-through.
            expect(checkbox.checked).toBe(false);
          }
          checkoutCheckboxSanitizeRule.teardown();
          document.body.innerHTML = "";
        },
      ),
    );
  });
});

describe("non-cleared checkbox is unaffected by the prototype patch", () => {
  it("accepts arbitrary .checked writes verbatim", () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { minLength: 1, maxLength: 20 }),
        (writes) => {
          document.body.innerHTML = `<input id="fresh" type="checkbox" />`;
          const checkbox = document.querySelector("#fresh") as HTMLInputElement;
          // Install the patch by applying the rule on an unrelated subtree.
          checkoutCheckboxSanitizeRule.apply(document.body);

          for (const value of writes) {
            checkbox.checked = value;
            expect(checkbox.checked).toBe(value);
          }
          // Marker was never stamped on a box that started unchecked.
          expect(checkbox.hasAttribute(CLEARED_ATTR)).toBe(false);
          checkoutCheckboxSanitizeRule.teardown();
          document.body.innerHTML = "";
        },
      ),
    );
  });
});

describe("URL gate releases the defense off checkout", () => {
  it("re-checks on a marked box stick once the route is non-checkout", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("/account", "/", "/product/123", "/orders/42"),
        (nonCheckoutPath) => {
          globalThis.history.replaceState({}, "", "/checkout");
          document.body.innerHTML = `<input id="upsell" type="checkbox" checked />`;
          const checkbox = document.querySelector(
            "#upsell",
          ) as HTMLInputElement;
          checkoutCheckboxSanitizeRule.apply(document.body);
          expect(checkbox.checked).toBe(false);
          expect(checkbox.hasAttribute(CLEARED_ATTR)).toBe(true);

          globalThis.history.replaceState({}, "", nonCheckoutPath);
          try {
            checkbox.checked = true;
            expect(checkbox.checked).toBe(true);
          } finally {
            globalThis.history.replaceState({}, "", "/checkout");
            checkoutCheckboxSanitizeRule.teardown();
            document.body.innerHTML = "";
          }
        },
      ),
    );
  });
});
