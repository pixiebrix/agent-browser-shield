/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://shop.example.com/checkout"}
 */
// Property-based tests for hidden-affiliate-sanitize. fast-check
// explores the boundary cases the FP control gates are supposed to
// reject:
//   - allowlist / denylist disjointness — no curated affiliate name
//     should also match the denylist,
//   - denylist precedence — any name containing a security-critical
//     token must be preserved,
//   - idempotency under repeated apply(),
//   - URL-gate invariance off checkout.

import fc from "fast-check";

import { HIDDEN_AFFILIATE_CLEARED_ATTR as CLEARED_ATTR } from "../../lib/dom-markers";
import {
  hiddenAffiliateSanitizeRule,
  isAffiliateName,
  isDenylistedName,
  shouldClearName,
} from "../hidden-affiliate-sanitize";

// Mirror of the attribution name set sufficient for property
// exploration. The unit suite covers the exhaustive list; here we draw
// from a representative sample. Promo / coupon / discount names are
// deliberately absent — see PROMO_NAMES below.
const AFFILIATE_NAMES: readonly string[] = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "aff",
  "aff_id",
  "affid",
  "affiliate_id",
  "ref",
  "ref_id",
  "refid",
  "referrer",
  "referral_code",
  "source_id",
  "campaign_id",
  "partner_code",
  "click_id",
  "gclid",
  "fbclid",
  "msclkid",
];

// Promo / coupon / discount names. The rule must preserve these — they
// commonly carry a legitimate user-acquired discount and clearing them
// would silently strip it.
const PROMO_NAMES: readonly string[] = [
  "promo",
  "promo_code",
  "promotion",
  "promotion_id",
  "coupon",
  "coupon_code",
  "coupon_id",
  "discount",
  "discount_code",
  "discount_id",
];

// Substring tokens that must always be preserved regardless of context.
const SECURITY_TOKENS: readonly string[] = [
  "csrf",
  "nonce",
  "signature",
  "hmac",
  "secret",
  "session",
  "antiforgery",
  "verify",
];

afterEach(() => {
  hiddenAffiliateSanitizeRule.teardown();
  document.body.innerHTML = "";
});

describe("allowlist / denylist disjointness (property)", () => {
  it("no curated affiliate name matches the denylist", () => {
    fc.assert(
      fc.property(fc.constantFrom(...AFFILIATE_NAMES), (name) => {
        expect(isAffiliateName(name)).toBe(true);
        expect(isDenylistedName(name)).toBe(false);
        expect(shouldClearName(name)).toBe(true);
      }),
    );
  });
});

describe("denylist precedence (property)", () => {
  it("any name containing a security token is preserved", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SECURITY_TOKENS),
        fc.constantFrom("", "_", "-", "__"),
        fc.constantFrom("", "_v2", "_token", "1", "_id"),
        (token, prefix, suffix) => {
          const name = `${prefix}${token}${suffix}`;
          expect(isDenylistedName(name)).toBe(true);
          expect(shouldClearName(name)).toBe(false);
        },
      ),
    );
  });

  it("a denied name overlapping the allowlist still does not clear", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...AFFILIATE_NAMES),
        fc.constantFrom(...SECURITY_TOKENS),
        (allow, deny) => {
          // Compose a name that contains both — e.g. `utm_csrf_source`.
          // The combination semantically conflicts with the allowlist
          // intent (the field has CSRF in its purpose) and should be
          // preserved.
          const name = `${allow}_${deny}_combined`;
          expect(shouldClearName(name)).toBe(false);
        },
      ),
    );
  });
});

describe("promo / coupon / discount preservation (property)", () => {
  it("no promo name matches the allowlist or gets cleared", () => {
    fc.assert(
      fc.property(fc.constantFrom(...PROMO_NAMES), (name) => {
        expect(isAffiliateName(name)).toBe(false);
        expect(shouldClearName(name)).toBe(false);
      }),
    );
  });

  it("hidden promo inputs at checkout keep their value", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...PROMO_NAMES),
        fc.stringMatching(/^[A-Z0-9-]{4,16}$/),
        (name, code) => {
          document.body.innerHTML = "";
          const form = document.createElement("form");
          const promo = document.createElement("input");
          promo.type = "hidden";
          promo.name = name;
          promo.value = code;
          const utm = document.createElement("input");
          utm.type = "hidden";
          utm.name = "utm_source";
          utm.value = "email";
          form.append(promo, utm);
          document.body.append(form);

          hiddenAffiliateSanitizeRule.apply(document.body);

          // Promo value survives.
          expect(promo.value).toBe(code);
          // Attribution gets cleared.
          expect(utm.value).toBe("");
          hiddenAffiliateSanitizeRule.teardown();
        },
      ),
    );
  });
});

describe("URL-gate invariance (property)", () => {
  it("never clears on a non-checkout URL", () => {
    const originalHref = location.href;
    history.replaceState({}, "", "/account");
    try {
      fc.assert(
        fc.property(fc.constantFrom(...AFFILIATE_NAMES), (name) => {
          document.body.innerHTML = "";
          const form = document.createElement("form");
          const input = document.createElement("input");
          input.type = "hidden";
          input.name = name;
          input.value = "some-tracker-id";
          form.append(input);
          document.body.append(form);

          hiddenAffiliateSanitizeRule.apply(document.body);
          // `.value` should be untouched.
          expect(input.value).toBe("some-tracker-id");
          // No CLEARED_ATTR stamp on a no-op URL.
          expect(input.hasAttribute(CLEARED_ATTR)).toBe(false);
          hiddenAffiliateSanitizeRule.teardown();
        }),
      );
    } finally {
      history.replaceState({}, "", originalHref);
    }
  });
});

describe("idempotency (property)", () => {
  it("applying twice yields the same cleared-set as once", () => {
    // Build a form with a mix of allowlisted and denylisted names,
    // each appearing at most once so we don't accidentally violate
    // <input name> uniqueness invariants the rule doesn't promise to
    // handle. Names are drawn verbatim (no suffix) so the allowlist
    // actually matches.
    const PRESERVED: readonly string[] = [
      "csrf_token",
      "cart_id",
      "session_id",
      "email",
    ];
    const NAMES_ARB = fc.uniqueArray(
      fc.constantFrom(...AFFILIATE_NAMES, ...PRESERVED),
      { minLength: 1, maxLength: 6 },
    );
    fc.assert(
      fc.property(
        NAMES_ARB,
        fc.stringMatching(/^[A-Za-z0-9-]{1,15}$/),
        (names, value) => {
          document.body.innerHTML = "";
          const form = document.createElement("form");
          const inputs: HTMLInputElement[] = [];
          for (const name of names) {
            const input = document.createElement("input");
            input.type = "hidden";
            input.name = name;
            input.value = value;
            form.append(input);
            inputs.push(input);
          }
          document.body.append(form);

          hiddenAffiliateSanitizeRule.apply(document.body);
          const firstSnapshot = inputs.map((input) => input.value);
          // Allowlisted entries should be empty; denylisted/other names
          // unchanged.
          for (const [i, name] of names.entries()) {
            if (shouldClearName(name)) {
              expect(firstSnapshot[i]).toBe("");
            } else {
              expect(firstSnapshot[i]).toBe(value);
            }
          }
          hiddenAffiliateSanitizeRule.apply(document.body);
          const secondSnapshot = inputs.map((input) => input.value);
          expect(secondSnapshot).toEqual(firstSnapshot);
          hiddenAffiliateSanitizeRule.teardown();
        },
      ),
      { numRuns: 40 },
    );
  });
});
