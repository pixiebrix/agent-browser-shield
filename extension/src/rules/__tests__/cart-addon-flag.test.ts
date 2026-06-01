/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://shop.example.com/cart"}
 */
import { cartAddonFlagRule, matchAddon } from "../cart-addon-flag";

const MUTATION_THROTTLE_MS = 250;
const FLAGGED_ATTR = "data-abs-cart-addon-flagged";
const FLAG_CLASS = "abs-cart-addon-flag";

async function flushMutations(): Promise<void> {
  await Promise.resolve();
}

beforeEach(() => {
  document.body.innerHTML = "";
  jest.useFakeTimers();
});

afterEach(() => {
  cartAddonFlagRule.teardown();
  jest.useRealTimers();
});

describe("matchAddon", () => {
  it.each([
    ["Add 2-year protection plan", "protection plan"],
    ["3-Year Extended Warranty", "warranty"],
    ["Add SquareTrade Protection Plan ($14.99)", "protection plan"],
    ["AppleCare+ for iPhone", "AppleCare"],
    ["Asurion Home+ Plan", "Asurion"],
    ["Round up to nearest dollar — donates to charity", "round-up"],
    ["Donate $1 to Feeding America", "donation"],
    ["Gift wrap (+$5)", "gift wrap"],
    ["Add a gift message", "gift message"],
    ["Carbon-neutral shipping", "carbon offset"],
    ["Route Package Protection", "Route protection"],
    ["Shipping Protection by Seel", "shipping / package protection"],
    ["Add a driver tip", "driver / courier tip"],
  ])('matches "%s" as %s', (text, expectedLabel) => {
    const match = matchAddon(text);
    expect(match?.label).toBe(expectedLabel);
  });

  it.each([
    "Free 30-day returns",
    "Ships in 2 business days",
    "Add to cart",
    "Continue to payment",
    "Subtotal: $42.99",
    "About our warranty policy", // policy phrasing still matches `warranty` —
    // intentional. Cap on element size on /cart pages is the real gate.
  ])('does not falsely match "%s" (except policy)', (text) => {
    const match = matchAddon(text);
    if (text.includes("warranty")) {
      expect(match?.label).toBe("warranty");
    } else {
      expect(match).toBeNull();
    }
  });
});

describe("cartAddonFlagRule on checkout URLs", () => {
  it("annotates a protection-plan line item", () => {
    document.body.innerHTML = `
      <ul class="cart">
        <li class="line-item"><img/><span class="title">Wireless Mouse</span><span class="price">$24.99</span></li>
        <li class="line-item"><span class="title">2-Year Protection Plan</span><span class="price">$4.99</span></li>
      </ul>
    `;
    cartAddonFlagRule.apply(document.body);

    const flagged = document.querySelectorAll(`[${FLAGGED_ATTR}]`);
    expect(flagged.length).toBeGreaterThan(0);
    const chip = document.querySelector(`.${FLAG_CLASS}`);
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toContain("abs");
    expect(chip?.textContent).toContain("protection plan");
  });

  it("annotates the innermost matching node, not its parent <li>", () => {
    document.body.innerHTML = `
      <li class="line-item">
        <span class="title">Extended Warranty</span>
        <span class="price">$9.99</span>
      </li>
    `;
    cartAddonFlagRule.apply(document.body);

    const title = document.querySelector(".title") as HTMLElement;
    const li = document.querySelector(".line-item") as HTMLElement;
    expect(title.hasAttribute(FLAGGED_ATTR)).toBe(true);
    expect(li.hasAttribute(FLAGGED_ATTR)).toBe(false);
  });

  it("annotates a round-up donation line", () => {
    document.body.innerHTML = `
      <div class="line">
        <label>Round up to the nearest dollar for charity</label>
        <span>$0.42</span>
      </div>
    `;
    cartAddonFlagRule.apply(document.body);
    expect(document.querySelector(`.${FLAG_CLASS}`)).not.toBeNull();
  });

  it("does not double-flag on a repeat scan", async () => {
    document.body.innerHTML = `
      <div class="line"><span>AppleCare+ for iPhone</span></div>
    `;
    cartAddonFlagRule.apply(document.body);

    // Trigger another scan via an unrelated mutation.
    document.body.append(document.createElement("div"));
    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    expect(document.querySelectorAll(`.${FLAG_CLASS}`).length).toBe(1);
  });

  it("annotates a lazy-loaded cart row", async () => {
    cartAddonFlagRule.apply(document.body);

    const late = document.createElement("div");
    late.innerHTML = `<span>Route Package Protection</span><span>$0.98</span>`;
    document.body.append(late);

    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    expect(document.querySelector(`.${FLAG_CLASS}`)).not.toBeNull();
  });

  it("skips elements that contain a flagged descendant", () => {
    document.body.innerHTML = `
      <div class="outer">
        <div class="line"><span class="title">SquareTrade Protection Plan</span></div>
        <div class="other">unrelated text</div>
      </div>
    `;
    cartAddonFlagRule.apply(document.body);

    // Only the innermost element (the span.title) should be flagged. The
    // .outer container shares the text via textContent inheritance but is
    // guarded by the contains-flagged-descendant check.
    const flagged = document.querySelectorAll(`[${FLAGGED_ATTR}]`);
    expect(flagged.length).toBe(1);
    expect(flagged[0]?.tagName).toBe("SPAN");
  });

  it("skips elements with too many descendants (cart-wide container)", () => {
    // Build a container that has the keyword in its aggregate textContent
    // but is too large to be a single line item.
    const big = document.createElement("div");
    big.className = "whole-cart";
    for (let i = 0; i < 60; i++) {
      const row = document.createElement("div");
      row.textContent = i === 30 ? "Add SquareTrade Protection Plan" : "row";
      big.append(row);
    }
    document.body.append(big);

    cartAddonFlagRule.apply(document.body);

    // The 60-child container is skipped. The single matching row (div with
    // the keyword text, no children) is annotated instead.
    expect(big.hasAttribute(FLAGGED_ATTR)).toBe(false);
    const flagged = document.querySelectorAll(`[${FLAGGED_ATTR}]`);
    expect(flagged.length).toBe(1);
  });
});

describe("cartAddonFlagRule URL gating", () => {
  it("does not annotate on a non-checkout URL", () => {
    const originalHref = globalThis.location.href;
    // jsdom doesn't allow direct href assignment in all paths; use the
    // history API to navigate within the same origin.
    globalThis.history.replaceState({}, "", "/product/widget");

    try {
      document.body.innerHTML = `
        <div class="pdp">
          <p>Includes a 2-year warranty.</p>
          <p>Add a SquareTrade Protection Plan at checkout.</p>
        </div>
      `;
      cartAddonFlagRule.apply(document.body);

      expect(document.querySelectorAll(`[${FLAGGED_ATTR}]`).length).toBe(0);
      expect(document.querySelector(`.${FLAG_CLASS}`)).toBeNull();
    } finally {
      globalThis.history.replaceState({}, "", originalHref);
    }
  });
});
