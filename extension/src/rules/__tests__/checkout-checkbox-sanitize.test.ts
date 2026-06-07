/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://shop.example.com/checkout"}
 */
import { isCheckoutUrl } from "../../lib/checkout-url";
import { CHECKOUT_CHECKBOX_CLEARED_ATTR as CLEARED_ATTR } from "../../lib/dom-markers";
import { checkoutCheckboxSanitizeRule } from "../checkout-checkbox-sanitize";

const MUTATION_THROTTLE_MS = 250;

async function flushMutations(): Promise<void> {
  await Promise.resolve();
}

beforeEach(() => {
  document.body.innerHTML = "";
  jest.useFakeTimers();
});

afterEach(() => {
  checkoutCheckboxSanitizeRule.teardown();
  jest.useRealTimers();
});

describe("isCheckoutUrl", () => {
  it.each([
    "https://shop.example.com/cart",
    "https://shop.example.com/cart/",
    "https://shop.example.com/checkout",
    "https://shop.example.com/checkout/shipping",
    "https://shop.example.com/basket",
    "https://shop.example.com/bag",
    "https://shop.example.com/payment",
    "https://shop.example.com/order",
    "https://shop.example.com/order/confirmation",
  ])("matches checkout-like URL: %s", (url) => {
    expect(isCheckoutUrl(url)).toBe(true);
  });

  it.each([
    "https://shop.example.com/",
    "https://shop.example.com/product/123",
    "https://shop.example.com/products/cart-bag", // 'cart' not a segment
    "https://shop.example.com/orders", // history, not checkout
    "https://shop.example.com/orders/123",
    "https://shop.example.com/account",
  ])("does not match non-checkout URL: %s", (url) => {
    expect(isCheckoutUrl(url)).toBe(false);
  });
});

describe("checkoutCheckboxSanitizeRule.apply", () => {
  it("unchecks a pre-checked enabled checkbox and fires change", () => {
    document.body.innerHTML = `
      <input id="warranty" type="checkbox" checked />
    `;
    const checkbox = document.querySelector("#warranty") as HTMLInputElement;
    const changeSpy = jest.fn();
    checkbox.addEventListener("change", changeSpy);

    checkoutCheckboxSanitizeRule.apply(document.body);

    expect(checkbox.checked).toBe(false);
    expect(checkbox.hasAttribute(CLEARED_ATTR)).toBe(true);
    expect(changeSpy).toHaveBeenCalledTimes(1);
  });

  it("leaves disabled checkboxes alone", () => {
    document.body.innerHTML = `
      <input id="locked" type="checkbox" checked disabled />
    `;
    const checkbox = document.querySelector("#locked") as HTMLInputElement;

    checkoutCheckboxSanitizeRule.apply(document.body);

    expect(checkbox.checked).toBe(true);
    expect(checkbox.hasAttribute(CLEARED_ATTR)).toBe(false);
  });

  it("leaves already-unchecked checkboxes alone", () => {
    document.body.innerHTML = `
      <input id="optional" type="checkbox" />
    `;
    const checkbox = document.querySelector("#optional") as HTMLInputElement;
    const changeSpy = jest.fn();
    checkbox.addEventListener("change", changeSpy);

    checkoutCheckboxSanitizeRule.apply(document.body);

    expect(checkbox.checked).toBe(false);
    expect(checkbox.hasAttribute(CLEARED_ATTR)).toBe(false);
    expect(changeSpy).not.toHaveBeenCalled();
  });

  it("ignores non-checkbox inputs", () => {
    document.body.innerHTML = `
      <input id="r" type="radio" checked />
      <input id="t" type="text" value="hello" />
    `;
    const radio = document.querySelector("#r") as HTMLInputElement;
    const text = document.querySelector("#t") as HTMLInputElement;

    checkoutCheckboxSanitizeRule.apply(document.body);

    expect(radio.checked).toBe(true);
    expect(text.value).toBe("hello");
  });
});

describe("checkoutCheckboxSanitizeRule lazy-loaded sections", () => {
  it("unchecks a checkbox injected after apply()", async () => {
    checkoutCheckboxSanitizeRule.apply(document.body);

    const lazy = document.createElement("div");
    lazy.innerHTML = `<input id="late" type="checkbox" checked />`;
    document.body.append(lazy);

    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    const checkbox = document.querySelector("#late") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(checkbox.hasAttribute(CLEARED_ATTR)).toBe(true);
  });

  it("teardown stops the observer so later additions are ignored", async () => {
    checkoutCheckboxSanitizeRule.apply(document.body);
    checkoutCheckboxSanitizeRule.teardown();

    const lazy = document.createElement("div");
    lazy.innerHTML = `<input id="late" type="checkbox" checked />`;
    document.body.append(lazy);

    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    const checkbox = document.querySelector("#late") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    expect(checkbox.hasAttribute(CLEARED_ATTR)).toBe(false);
  });
});

describe("checkoutCheckboxSanitizeRule prototype defense patch", () => {
  it("reverts a programmatic .checked = true on a cleared box", () => {
    document.body.innerHTML = `<input id="upsell" type="checkbox" checked />`;
    const checkbox = document.querySelector("#upsell") as HTMLInputElement;

    checkoutCheckboxSanitizeRule.apply(document.body);
    expect(checkbox.checked).toBe(false);

    // Simulate the page's hydration / controlled-input reconcile loop
    // writing the pre-selected state back onto the input.
    checkbox.checked = true;

    expect(checkbox.checked).toBe(false);
    expect(checkbox.hasAttribute(CLEARED_ATTR)).toBe(true);
  });

  it("reverts repeated re-check attempts on a cleared box", () => {
    document.body.innerHTML = `<input id="upsell" type="checkbox" checked />`;
    const checkbox = document.querySelector("#upsell") as HTMLInputElement;

    checkoutCheckboxSanitizeRule.apply(document.body);

    for (let index = 0; index < 5; index++) {
      checkbox.checked = true;
      expect(checkbox.checked).toBe(false);
    }
  });

  it("allows .click() to legitimately re-check a cleared box", () => {
    document.body.innerHTML = `<input id="terms" type="checkbox" checked />`;
    const checkbox = document.querySelector("#terms") as HTMLInputElement;

    checkoutCheckboxSanitizeRule.apply(document.body);
    expect(checkbox.checked).toBe(false);

    // .click() routes through the native activation behavior, not the
    // patched JS setter — this is the documented agent escape hatch.
    checkbox.click();

    expect(checkbox.checked).toBe(true);
  });

  it("allows re-check after the cleared marker is removed", () => {
    document.body.innerHTML = `<input id="terms" type="checkbox" checked />`;
    const checkbox = document.querySelector("#terms") as HTMLInputElement;

    checkoutCheckboxSanitizeRule.apply(document.body);

    checkbox.removeAttribute(CLEARED_ATTR);
    checkbox.checked = true;

    expect(checkbox.checked).toBe(true);
  });

  it("does not interfere with non-cleared checkboxes", () => {
    document.body.innerHTML = `<input id="fresh" type="checkbox" />`;
    const checkbox = document.querySelector("#fresh") as HTMLInputElement;

    checkoutCheckboxSanitizeRule.apply(document.body);

    checkbox.checked = true;

    expect(checkbox.checked).toBe(true);
    expect(checkbox.hasAttribute(CLEARED_ATTR)).toBe(false);
  });

  it("allows setting .checked = false on a cleared box (no-op pass-through)", () => {
    document.body.innerHTML = `<input id="upsell" type="checkbox" checked />`;
    const checkbox = document.querySelector("#upsell") as HTMLInputElement;

    checkoutCheckboxSanitizeRule.apply(document.body);

    checkbox.checked = false;

    expect(checkbox.checked).toBe(false);
  });

  it("does not interfere with non-checkbox inputs that happen to gain the marker", () => {
    // CLEARED_ATTR is only ever stamped on checkboxes by the rule, but
    // the prototype patch's selectivity rests on the marker — verify a
    // text input wearing the marker still accepts arbitrary value writes
    // (the patch gates by `.checked` writes only, never `.value`).
    document.body.innerHTML = `<input id="oddball" type="text" />`;
    const input = document.querySelector("#oddball") as HTMLInputElement;

    checkoutCheckboxSanitizeRule.apply(document.body);

    input.setAttribute(CLEARED_ATTR, "");
    input.value = "hello";

    expect(input.value).toBe("hello");
  });
});

describe("checkoutCheckboxSanitizeRule URL gate on the patch", () => {
  it("does not defend cleared boxes once the SPA route leaves checkout", () => {
    // Sanitize a checkout box, then SPA-navigate away. The patch's URL
    // gate releases the lock so the page's own state can drive the box
    // again on a non-checkout route.
    globalThis.history.replaceState({}, "", "/checkout");
    document.body.innerHTML = `<input id="upsell" type="checkbox" checked />`;
    const checkbox = document.querySelector("#upsell") as HTMLInputElement;

    checkoutCheckboxSanitizeRule.apply(document.body);
    expect(checkbox.checked).toBe(false);

    globalThis.history.replaceState({}, "", "/account");
    try {
      checkbox.checked = true;
      expect(checkbox.checked).toBe(true);
    } finally {
      globalThis.history.replaceState({}, "", "/checkout");
    }
  });
});
