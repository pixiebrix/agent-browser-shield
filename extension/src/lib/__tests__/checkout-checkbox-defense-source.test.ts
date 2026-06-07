/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://shop.example.com/checkout"}
 */
// Tests for the page-world checkout-checkbox defense — the prototype
// wrap on HTMLInputElement.prototype.checked plus the capture-phase
// `change` listener that releases the lock on trusted user gestures.
// Mirrors how webdriver-probe-source is shipped: the function runs
// inside the page world in production; jsdom's single-world model means
// installing it in the test world exercises the same code path.

import { installCheckoutCheckboxDefense } from "../checkout-checkbox-defense-source";
import { isCheckoutUrl } from "../checkout-url";
import { CHECKOUT_CHECKBOX_CLEARED_ATTR as CLEARED_ATTR } from "../dom-markers";

beforeAll(() => {
  installCheckoutCheckboxDefense.call(globalThis as unknown as Window);
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("installCheckoutCheckboxDefense — prototype wrap", () => {
  it("reverts a programmatic .checked = true on a marked box", () => {
    document.body.innerHTML = `<input id="upsell" type="checkbox" />`;
    const checkbox = document.querySelector("#upsell") as HTMLInputElement;
    checkbox.setAttribute(CLEARED_ATTR, "");

    // Simulate the page's hydration / controlled-input reconcile loop
    // writing the pre-selected state back onto the input.
    checkbox.checked = true;

    expect(checkbox.checked).toBe(false);
    expect(checkbox.hasAttribute(CLEARED_ATTR)).toBe(true);
  });

  it("reverts repeated re-check attempts on a marked box", () => {
    document.body.innerHTML = `<input id="upsell" type="checkbox" />`;
    const checkbox = document.querySelector("#upsell") as HTMLInputElement;
    checkbox.setAttribute(CLEARED_ATTR, "");

    for (let index = 0; index < 5; index++) {
      checkbox.checked = true;
      expect(checkbox.checked).toBe(false);
    }
  });

  it("allows .click() to legitimately re-check a marked box", () => {
    document.body.innerHTML = `<input id="terms" type="checkbox" />`;
    const checkbox = document.querySelector("#terms") as HTMLInputElement;
    checkbox.setAttribute(CLEARED_ATTR, "");

    // .click() routes through the native activation behavior, not the
    // patched JS setter.
    checkbox.click();

    expect(checkbox.checked).toBe(true);
  });

  it("allows re-check after the marker is removed", () => {
    document.body.innerHTML = `<input id="terms" type="checkbox" />`;
    const checkbox = document.querySelector("#terms") as HTMLInputElement;
    checkbox.setAttribute(CLEARED_ATTR, "");

    checkbox.removeAttribute(CLEARED_ATTR);
    checkbox.checked = true;

    expect(checkbox.checked).toBe(true);
  });

  it("does not interfere with unmarked checkboxes", () => {
    document.body.innerHTML = `<input id="fresh" type="checkbox" />`;
    const checkbox = document.querySelector("#fresh") as HTMLInputElement;

    checkbox.checked = true;

    expect(checkbox.checked).toBe(true);
    expect(checkbox.hasAttribute(CLEARED_ATTR)).toBe(false);
  });

  it("allows .checked = false on a marked box (no-op pass-through)", () => {
    document.body.innerHTML = `<input id="upsell" type="checkbox" />`;
    const checkbox = document.querySelector("#upsell") as HTMLInputElement;
    checkbox.setAttribute(CLEARED_ATTR, "");

    checkbox.checked = false;

    expect(checkbox.checked).toBe(false);
  });

  it("does not gate writes to .value on a marked non-checkbox input", () => {
    // The marker is only ever stamped on checkboxes by the rule, but the
    // patch's selectivity must hold even if a hostile page somehow gets
    // the marker onto a text input.
    document.body.innerHTML = `<input id="oddball" type="text" />`;
    const input = document.querySelector("#oddball") as HTMLInputElement;
    input.setAttribute(CLEARED_ATTR, "");

    input.value = "hello";

    expect(input.value).toBe("hello");
  });
});

describe("installCheckoutCheckboxDefense — URL gate", () => {
  it("does not defend marked boxes once the SPA route leaves checkout", () => {
    document.body.innerHTML = `<input id="upsell" type="checkbox" />`;
    const checkbox = document.querySelector("#upsell") as HTMLInputElement;
    checkbox.setAttribute(CLEARED_ATTR, "");

    globalThis.history.replaceState({}, "", "/account");
    try {
      checkbox.checked = true;
      expect(checkbox.checked).toBe(true);
    } finally {
      globalThis.history.replaceState({}, "", "/checkout");
    }
  });
});

describe("installCheckoutCheckboxDefense — change listener", () => {
  // jsdom installs `Event.isTrusted` as a per-instance unforgeable
  // property, so a forged-trusted event can't be dispatched through the
  // document listener. The negative path (untrusted dispatch keeps the
  // marker) is verified here; the positive trusted-gesture path is
  // covered in the isolated-world rule's tests by calling the handler
  // shape directly.

  it("ignores untrusted change events from page-script dispatch", () => {
    document.body.innerHTML = `<input id="upsell" type="checkbox" />`;
    const checkbox = document.querySelector("#upsell") as HTMLInputElement;
    checkbox.setAttribute(CLEARED_ATTR, "");

    checkbox.dispatchEvent(new Event("change", { bubbles: true }));

    expect(checkbox.hasAttribute(CLEARED_ATTR)).toBe(true);
    checkbox.checked = true;
    expect(checkbox.checked).toBe(false);
  });
});

describe("installCheckoutCheckboxDefense — idempotency", () => {
  it("is a no-op when called a second time", () => {
    // Already installed in beforeAll. A second invocation must not
    // double-wrap (which would capture the prior wrap as "native" and
    // lead to layered setter logic). The FLAG on globalThis
    // short-circuits the body — verify behavior remains correct.
    installCheckoutCheckboxDefense.call(globalThis as unknown as Window);

    document.body.innerHTML = `<input id="upsell" type="checkbox" />`;
    const checkbox = document.querySelector("#upsell") as HTMLInputElement;
    checkbox.setAttribute(CLEARED_ATTR, "");
    checkbox.checked = true;
    expect(checkbox.checked).toBe(false);
  });
});

describe("parity with the isolated-world rule", () => {
  it("CLEARED_ATTR matches the dom-markers registry constant", () => {
    // The page-world source hard-codes the literal because it has no
    // module imports at runtime; assert here that the registry constant
    // still agrees so a future rename doesn't silently break the
    // defense.
    // eslint-disable-next-line no-restricted-syntax
    expect(CLEARED_ATTR).toBe("data-abs-cleared");
  });

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
  ])("the page-world URL gate accepts the same checkout shapes: %s", (url) => {
    expect(isCheckoutUrl(url)).toBe(true);
    document.body.innerHTML = `<input id="t" type="checkbox" />`;
    const checkbox = document.querySelector("#t") as HTMLInputElement;
    checkbox.setAttribute(CLEARED_ATTR, "");
    const originalHref = globalThis.location.href;
    globalThis.history.replaceState({}, "", new URL(url).pathname);
    try {
      checkbox.checked = true;
      expect(checkbox.checked).toBe(false);
    } finally {
      globalThis.history.replaceState({}, "", originalHref);
    }
  });

  it.each([
    "https://shop.example.com/",
    "https://shop.example.com/product/123",
    "https://shop.example.com/products/cart-bag",
    "https://shop.example.com/orders",
    "https://shop.example.com/orders/123",
    "https://shop.example.com/account",
  ])("the page-world URL gate rejects non-checkout shapes: %s", (url) => {
    expect(isCheckoutUrl(url)).toBe(false);
    document.body.innerHTML = `<input id="t" type="checkbox" />`;
    const checkbox = document.querySelector("#t") as HTMLInputElement;
    checkbox.setAttribute(CLEARED_ATTR, "");
    const originalHref = globalThis.location.href;
    globalThis.history.replaceState({}, "", new URL(url).pathname);
    try {
      checkbox.checked = true;
      expect(checkbox.checked).toBe(true);
    } finally {
      globalThis.history.replaceState({}, "", originalHref);
    }
  });
});
