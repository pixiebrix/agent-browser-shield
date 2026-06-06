/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://shop.example.com/checkout"}
 */
import { HIDDEN_AFFILIATE_CLEARED_ATTR as CLEARED_ATTR } from "../../lib/dom-markers";
import {
  hiddenAffiliateSanitizeRule,
  isAffiliateName,
  isDenylistedName,
  shouldClearName,
} from "../hidden-affiliate-sanitize";

const MUTATION_THROTTLE_MS = 250;

async function flushMutations(): Promise<void> {
  await Promise.resolve();
}

beforeEach(() => {
  document.body.innerHTML = "";
  jest.useFakeTimers();
});

afterEach(() => {
  hiddenAffiliateSanitizeRule.teardown();
  jest.useRealTimers();
});

describe("isAffiliateName — positive examples", () => {
  it.each([
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "utm-source",
    "UTM_SOURCE",
    "aff",
    "aff_id",
    "affid",
    "affiliate",
    "affiliate_id",
    "affiliate_code",
    "ref",
    "ref_id",
    "refid",
    "referrer",
    "referral_code",
    "promo",
    "promo_code",
    "promotion_id",
    "promocode",
    "coupon",
    "coupon_code",
    "coupon_id",
    "discount_code",
    "discount_id",
    "source_id",
    "campaign_id",
    "partner_code",
    "click_id",
    "gclid",
    "fbclid",
    "msclkid",
  ])("matches %s", (name) => {
    expect(isAffiliateName(name)).toBe(true);
  });
});

describe("isAffiliateName — negative examples", () => {
  it.each([
    "email",
    "address",
    "phone",
    "first_name",
    "last_name",
    "quantity",
    "item_id",
    "product_sku",
    "country",
    "state",
    "city",
    "zipcode",
    "subscribe",
    // The word "refrigerator" contains "ref" but the regex is anchored
    // and requires whole-name match — must reject.
    "refrigerator",
    // Substring sneaks
    "preferred_payment",
    "preferences",
  ])("rejects %s", (name) => {
    expect(isAffiliateName(name)).toBe(false);
  });
});

describe("isDenylistedName — preserves CSRF/session/cart shapes", () => {
  it.each([
    "csrf",
    "csrf_token",
    "authenticity_token",
    "_csrf",
    "nonce",
    "state",
    "signature",
    "sig",
    "hmac",
    "request_token",
    "x_token",
    "antiforgery",
    "verification_token",
    "verify_token",
    "cart_id",
    "order_id",
    "session_id",
    "session",
    "_token",
  ])("denies %s", (name) => {
    expect(isDenylistedName(name)).toBe(true);
  });
});

describe("shouldClearName — allowlist trimmed by denylist", () => {
  it.each([
    "utm_source",
    "ref",
    "promo_code",
    "coupon_id",
    "gclid",
  ])("clears %s", (name) => {
    expect(shouldClearName(name)).toBe(true);
  });

  it.each([
    "csrf_token",
    "authenticity_token",
    "cart_id",
    "order_id",
    "session_id",
    "nonce",
    "state",
    "_token",
  ])("never clears %s, even if allowlisted by overlap", (name) => {
    expect(shouldClearName(name)).toBe(false);
  });

  it("rejects empty name", () => {
    expect(shouldClearName("")).toBe(false);
  });
});

describe("hiddenAffiliateSanitizeRule on checkout URLs", () => {
  it("clears value on an allowlisted hidden input", () => {
    document.body.innerHTML = `
      <form>
        <input type="hidden" name="utm_source" value="email-newsletter">
        <input type="hidden" name="csrf_token" value="abc123">
        <button type="submit">Submit</button>
      </form>
    `;
    hiddenAffiliateSanitizeRule.apply(document.body);

    const utm = document.querySelector(
      'input[name="utm_source"]',
    ) as HTMLInputElement;
    const csrf = document.querySelector(
      'input[name="csrf_token"]',
    ) as HTMLInputElement;
    expect(utm.value).toBe("");
    expect(utm.getAttribute(CLEARED_ATTR)).toBe("");
    expect(csrf.value).toBe("abc123");
    // CSRF should be stamped as skipped so we don't re-evaluate.
    expect(csrf.getAttribute(CLEARED_ATTR)).toBe("skipped");
  });

  it("never clears a denylisted name that happens to overlap the allowlist", () => {
    // A field literally named `state` would match the allowlist's
    // overlap with denied names. Denylist takes precedence.
    document.body.innerHTML = `
      <form>
        <input type="hidden" name="state" value="OAUTH_NONCE_xyz">
      </form>
    `;
    hiddenAffiliateSanitizeRule.apply(document.body);
    const state = document.querySelector(
      'input[name="state"]',
    ) as HTMLInputElement;
    expect(state.value).toBe("OAUTH_NONCE_xyz");
  });

  it("preserves a value containing 'signature' in name", () => {
    document.body.innerHTML = `
      <form>
        <input type="hidden" name="apple_pay_signature" value="MIIBxz...">
      </form>
    `;
    hiddenAffiliateSanitizeRule.apply(document.body);
    const node = document.querySelector(
      'input[name="apple_pay_signature"]',
    ) as HTMLInputElement;
    expect(node.value).toBe("MIIBxz...");
  });

  it("skips hidden inputs outside a form (likely JS-only carriers)", () => {
    document.body.innerHTML = `
      <div>
        <input type="hidden" name="utm_source" value="not-in-form">
      </div>
    `;
    hiddenAffiliateSanitizeRule.apply(document.body);
    const node = document.querySelector(
      'input[name="utm_source"]',
    ) as HTMLInputElement;
    expect(node.value).toBe("not-in-form");
  });

  it("clears via the prototype's native setter so React/Vue see the change", () => {
    document.body.innerHTML = `
      <form>
        <input id="utm" type="hidden" name="utm_source" value="email">
      </form>
    `;
    const utm = document.querySelector("#utm") as HTMLInputElement;
    // Wrap the native setter to detect that we're calling it. The rule
    // resolves the setter at module load via getOwnPropertyDescriptor,
    // so we can't trivially mock that out — instead, after the rule
    // runs, the live `.value` must be the empty string.
    hiddenAffiliateSanitizeRule.apply(document.body);
    expect(utm.value).toBe("");
  });

  it("does not double-clear on a repeat scan", async () => {
    document.body.innerHTML = `
      <form>
        <input id="utm" type="hidden" name="utm_source" value="email">
      </form>
    `;
    hiddenAffiliateSanitizeRule.apply(document.body);
    const utm = document.querySelector("#utm") as HTMLInputElement;
    expect(utm.value).toBe("");
    // Re-set the value as if a page script tried to repopulate it.
    utm.removeAttribute(CLEARED_ATTR);
    utm.value = "repopulated";
    // Restore CLEARED_ATTR — the actual marker that prevents re-clear.
    utm.setAttribute(CLEARED_ATTR, "");

    document.body.append(document.createElement("div"));
    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    expect(utm.value).toBe("repopulated");
  });

  it("clears a lazy-loaded hidden affiliate input", async () => {
    hiddenAffiliateSanitizeRule.apply(document.body);
    const late = document.createElement("form");
    late.innerHTML = `<input id="late" type="hidden" name="ref" value="affsite-42">`;
    document.body.append(late);
    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);
    const node = document.querySelector("#late") as HTMLInputElement;
    expect(node.value).toBe("");
  });

  it("clears a hidden input that is itself the subtree root (appended directly into an existing form)", async () => {
    // querySelectorAll only walks descendants — a single input appended
    // straight into an existing form is delivered to the watcher as the
    // root element, not as a descendant of a larger subtree. The rule
    // must check the root itself or the input slips through unscrubbed.
    document.body.innerHTML = `<form id="checkout"></form>`;
    hiddenAffiliateSanitizeRule.apply(document.body);

    const form = document.querySelector("#checkout") as HTMLFormElement;
    const late = document.createElement("input");
    late.type = "hidden";
    late.name = "utm_source";
    late.value = "email";
    form.append(late);

    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    expect(late.value).toBe("");
    expect(late.hasAttribute(CLEARED_ATTR)).toBe(true);
  });

  it("does not run on a non-checkout URL", () => {
    const originalHref = globalThis.location.href;
    globalThis.history.replaceState({}, "", "/blog/post");
    try {
      document.body.innerHTML = `
        <form>
          <input id="utm" type="hidden" name="utm_source" value="email">
        </form>
      `;
      hiddenAffiliateSanitizeRule.apply(document.body);
      const utm = document.querySelector("#utm") as HTMLInputElement;
      expect(utm.value).toBe("email");
    } finally {
      globalThis.history.replaceState({}, "", originalHref);
    }
  });

  it("skips empty values (already-empty short-circuit)", () => {
    document.body.innerHTML = `
      <form>
        <input id="utm" type="hidden" name="utm_source" value="">
      </form>
    `;
    hiddenAffiliateSanitizeRule.apply(document.body);
    const utm = document.querySelector("#utm") as HTMLInputElement;
    expect(utm.getAttribute(CLEARED_ATTR)).toBe("already-empty");
  });

  it("works for inputs associated with a form via the `form` attribute", () => {
    document.body.innerHTML = `
      <form id="checkout"></form>
      <input id="utm" type="hidden" name="utm_source" value="email" form="checkout">
    `;
    hiddenAffiliateSanitizeRule.apply(document.body);
    const utm = document.querySelector("#utm") as HTMLInputElement;
    expect(utm.value).toBe("");
  });
});
