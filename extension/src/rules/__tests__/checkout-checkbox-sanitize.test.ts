/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://shop.example.com/checkout"}
 */
// The rule requests page-world injection via the typed `lib/messenger` wrapper;
// mock the module so the suite asserts on
// `requestPageWorldInject("checkout-checkbox-defense")` and the real
// `webext-messenger` never loads in jsdom.
jest.mock("../../lib/messenger", () => ({
  requestPageWorldInject: jest.fn(),
}));

import { installCheckoutCheckboxDefense } from "../../lib/checkout-checkbox-defense-source";
import { isCheckoutUrl } from "../../lib/checkout-url";
import { CHECKOUT_CHECKBOX_CLEARED_ATTR as CLEARED_ATTR } from "../../lib/dom-markers";
import { requestPageWorldInject } from "../../lib/messenger";
import { checkoutCheckboxSanitizeRule } from "../checkout-checkbox-sanitize";

const requestInjectMock = requestPageWorldInject as jest.Mock;

const MUTATION_THROTTLE_MS = 250;

async function flushMutations(): Promise<void> {
  await Promise.resolve();
}

beforeAll(() => {
  // In production the defense is shipped into the page world via a
  // separate bundle registered by the background worker; jsdom has a
  // single world, so installing the source here gives the rule's
  // unchecked boxes the same prototype-wrap defense they'd see at
  // runtime. Idempotent — safe to call once per file.
  installCheckoutCheckboxDefense.call(globalThis as unknown as Window);
});

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

  it("requests page-world defense injection on apply", () => {
    document.body.innerHTML = `<input type="checkbox" checked />`;

    checkoutCheckboxSanitizeRule.apply(document.body);

    expect(requestInjectMock).toHaveBeenCalledWith("checkout-checkbox-defense");
  });

  it("still scans even though the inject request is fire-and-forget", async () => {
    document.body.innerHTML = `<input id="x" type="checkbox" checked />`;

    checkoutCheckboxSanitizeRule.apply(document.body);
    await flushMutations();

    const checkbox = document.querySelector("#x") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(checkbox.hasAttribute(CLEARED_ATTR)).toBe(true);
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

describe("end-to-end with the page-world defense installed", () => {
  // The rule clears the box and stamps the marker; the source-side
  // prototype wrap then defends that marker against programmatic
  // re-checks. These tests exercise the integration in jsdom's
  // single-world environment, which mirrors how the two pieces interact
  // at runtime once the defense bundle has been injected.

  it("a page-script .checked = true after sanitize is reverted", () => {
    document.body.innerHTML = `<input id="upsell" type="checkbox" checked />`;
    const checkbox = document.querySelector("#upsell") as HTMLInputElement;

    checkoutCheckboxSanitizeRule.apply(document.body);
    expect(checkbox.checked).toBe(false);

    checkbox.checked = true;

    expect(checkbox.checked).toBe(false);
  });

  it("an agent .click() on a cleared box re-checks (escape hatch)", () => {
    document.body.innerHTML = `<input id="terms" type="checkbox" checked />`;
    const checkbox = document.querySelector("#terms") as HTMLInputElement;

    checkoutCheckboxSanitizeRule.apply(document.body);
    checkbox.click();

    expect(checkbox.checked).toBe(true);
  });

  it("removing the marker manually releases the lock", () => {
    document.body.innerHTML = `<input id="terms" type="checkbox" checked />`;
    const checkbox = document.querySelector("#terms") as HTMLInputElement;

    checkoutCheckboxSanitizeRule.apply(document.body);
    checkbox.removeAttribute(CLEARED_ATTR);
    checkbox.checked = true;

    expect(checkbox.checked).toBe(true);
  });
});
