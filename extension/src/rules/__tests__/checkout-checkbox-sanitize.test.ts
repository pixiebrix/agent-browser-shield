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

  it("does not re-uncheck a cleared box that the agent re-checks", async () => {
    document.body.innerHTML = `<input id="terms" type="checkbox" checked />`;
    checkoutCheckboxSanitizeRule.apply(document.body);

    const checkbox = document.querySelector("#terms") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    // Agent re-checks the box (e.g., after deciding to accept T&C).
    checkbox.checked = true;

    // Trigger a scan: append an unrelated element so the mutation observer fires.
    document.body.append(document.createElement("span"));
    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    expect(checkbox.checked).toBe(true);
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
