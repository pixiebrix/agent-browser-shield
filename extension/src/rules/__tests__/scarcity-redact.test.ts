import { RULE_ATTR } from "../../lib/dom-markers";
import { PLACEHOLDER_CLASS } from "../../lib/placeholder";
import { matchesScarcityPattern, scarcityRedactRule } from "../scarcity-redact";

const MUTATION_THROTTLE_MS = 250;

async function flushMutations(): Promise<void> {
  await Promise.resolve();
}

beforeEach(() => {
  document.body.innerHTML = "";
  jest.useFakeTimers();
});

afterEach(() => {
  scarcityRedactRule.teardown();
  jest.useRealTimers();
});

describe("matchesScarcityPattern", () => {
  it.each([
    "Only 3 left in stock",
    "Only 5 remaining",
    "Only 2 available",
    "3 left in stock",
    "Low stock",
    "Limited stock",
    "Limited inventory",
    "Limited availability",
    "Limited quantities",
    "Stock running low",
    "Stock is running low",
    "5 in stock",
    "12 available",
    "Almost gone",
    "Almost sold out",
    "Nearly gone",
    "Selling fast",
    "Selling out",
    "Going fast",
    "High demand",
    "23 people are viewing this",
    "5 shoppers viewing",
    "12 sold in the last hour",
    "8 purchased in the past day",
    "5 have it in their cart",
    "3 in carts",
  ])("matches urgency phrasing: %s", (text) => {
    expect(matchesScarcityPattern(text)).toBe(true);
  });

  it.each([
    "Out of stock",
    "Sold out",
    "Unavailable",
    "Currently unavailable",
    "No longer available",
    "Not available",
    "Bestseller",
    "Best Seller",
    "Best-seller",
    "Top seller",
    "Top-Seller",
    "In stock",
    "Available",
    "Ships in 2 days",
    "Save 30%",
    "Free shipping",
  ])("leaves non-urgency text alone: %s", (text) => {
    expect(matchesScarcityPattern(text)).toBe(false);
  });
});

describe("scarcityRedactRule", () => {
  it("hides an element containing a low-stock warning", () => {
    document.body.innerHTML = `<span id="t">Only 3 left in stock</span>`;
    scarcityRedactRule.apply(document.body);

    expect(document.querySelector("#t")).toBeNull();
    const placeholder = document.querySelector(`.${PLACEHOLDER_CLASS}`);
    expect(placeholder).not.toBeNull();
    expect(placeholder?.getAttribute(RULE_ATTR)).toBe("scarcity-redact");
    expect(placeholder?.textContent).toContain("scarcity warning hidden");
  });

  it("leaves out-of-stock indicators visible", () => {
    document.body.innerHTML = `
      <span id="oos">Out of stock</span>
      <span id="so">Sold out</span>
      <span id="un">Currently unavailable</span>
    `;
    scarcityRedactRule.apply(document.body);

    expect(document.querySelector("#oos")).not.toBeNull();
    expect(document.querySelector("#so")).not.toBeNull();
    expect(document.querySelector("#un")).not.toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });

  it("leaves bestseller badges visible", () => {
    document.body.innerHTML = `
      <span id="bs">Bestseller</span>
      <span id="ts">Top Seller</span>
    `;
    scarcityRedactRule.apply(document.body);

    expect(document.querySelector("#bs")).not.toBeNull();
    expect(document.querySelector("#ts")).not.toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });

  it("hides 'Almost sold out' (urgency) but keeps 'Sold out' (real OOS)", () => {
    document.body.innerHTML = `
      <span id="urgency">Almost sold out</span>
      <span id="oos">Sold out</span>
    `;
    scarcityRedactRule.apply(document.body);

    expect(document.querySelector("#urgency")).toBeNull();
    expect(document.querySelector("#oos")).not.toBeNull();
    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(1);
  });

  it("hides bare stock counts like '5 in stock'", () => {
    document.body.innerHTML = `<span id="t">5 in stock</span>`;
    scarcityRedactRule.apply(document.body);

    expect(document.querySelector("#t")).toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).not.toBeNull();
  });

  it("hides activity claims like '23 people are viewing this'", () => {
    document.body.innerHTML = `<span id="t">23 people are viewing this</span>`;
    scarcityRedactRule.apply(document.body);

    expect(document.querySelector("#t")).toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).not.toBeNull();
  });

  it("hides the innermost match when nested wrappers also match", () => {
    document.body.innerHTML = `
      <div id="outer">
        Hurry —
        <span id="inner">only 2 left</span>
      </div>
    `;
    scarcityRedactRule.apply(document.body);

    expect(document.querySelector("#outer")).not.toBeNull();
    expect(document.querySelector("#inner")).toBeNull();
    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(1);
  });

  it("ignores text inside SCRIPT or STYLE", () => {
    document.body.innerHTML = `
      <script>const t = "Only 3 left";</script>
      <style>.x::after { content: "Selling fast"; }</style>
    `;
    scarcityRedactRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });

  it("does not re-process content inside an existing placeholder", () => {
    document.body.innerHTML = `
      <div class="${PLACEHOLDER_CLASS}">
        <span id="t">Only 3 left</span>
      </div>
    `;
    scarcityRedactRule.apply(document.body);

    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(1);
    expect(document.querySelector("#t")).not.toBeNull();
  });

  it("skips elements whose text content is too long to be a badge", () => {
    document.body.innerHTML = `<p id="t">Lorem ipsum dolor sit amet, consectetur adipiscing elit — there are only 3 left in stock here for context too.</p>`;
    scarcityRedactRule.apply(document.body);

    expect(document.querySelector("#t")).not.toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });

  it("restores the original element on click", () => {
    document.body.innerHTML = `<span id="t">Selling fast</span>`;
    scarcityRedactRule.apply(document.body);

    const placeholder = document.querySelector<HTMLElement>(
      `.${PLACEHOLDER_CLASS}`,
    );
    expect(placeholder).not.toBeNull();
    placeholder?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
    const restored = document.querySelector("#t");
    expect(restored).not.toBeNull();
    expect(restored?.textContent).toContain("Selling fast");
  });
});

describe("scarcityRedactRule lazy-loaded sections", () => {
  it("hides a scarcity badge injected after apply()", async () => {
    scarcityRedactRule.apply(document.body);

    const lazy = document.createElement("div");
    lazy.innerHTML = `<span id="t">Only 2 left in stock</span>`;
    document.body.append(lazy);

    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    expect(document.querySelector("#t")).toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).not.toBeNull();
  });

  it("coalesces a burst of additions into a single throttled scan", async () => {
    scarcityRedactRule.apply(document.body);

    for (let i = 0; i < 5; i++) {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = `<span class="t" data-i="${i}">Only ${i + 1} left</span>`;
      document.body.append(wrapper);
    }

    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    expect(document.querySelectorAll(".t")).toHaveLength(0);
    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(5);
  });

  it("teardown stops the observer so later additions are ignored", async () => {
    scarcityRedactRule.apply(document.body);
    scarcityRedactRule.teardown();

    const lazy = document.createElement("div");
    lazy.innerHTML = `<span id="t">Only 1 left</span>`;
    document.body.append(lazy);

    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    expect(document.querySelector("#t")).not.toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });

  it("does not loop when its own placeholder is inserted", async () => {
    document.body.innerHTML = `<span id="t">Only 3 left</span>`;
    scarcityRedactRule.apply(document.body);

    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(1);
  });
});
