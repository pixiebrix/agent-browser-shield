/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://hotel.example.com/checkout"}
 */
import {
  countPricedRows,
  findAmountForLabel,
  findOrderSummaryAncestor,
  hiddenFeeAnnotateRule,
  isCurrencyAmount,
  matchFeePhrase,
} from "../hidden-fee-annotate";

const MUTATION_THROTTLE_MS = 250;
const FLAG_CLASS = "abs-hidden-fee-annotate";

async function flushMutations(): Promise<void> {
  await Promise.resolve();
}

beforeEach(() => {
  document.body.innerHTML = "";
  jest.useFakeTimers();
});

afterEach(() => {
  hiddenFeeAnnotateRule.teardown();
  jest.useRealTimers();
});

describe("matchFeePhrase — positive examples", () => {
  it.each([
    ["Service Fee", "service fee"],
    ["service fee", "service fee"],
    ["Convenience Fee", "convenience fee"],
    ["Processing Fee", "processing fee"],
    ["Resort Fee", "resort fee"],
    ["Destination Fee", "destination fee"],
    ["Facility Fee", "facility fee"],
    ["Handling Fee", "handling fee"],
    ["Venue Fee", "venue fee"],
    ["Delivery Surcharge", "delivery surcharge"],
    ["Resort Fee — $45/night", "resort fee"],
    ["Service Fee: per stay", "service fee"],
    ["Resort Fee $45.00", "resort fee"],
    ["Service Fee (mandatory)", "service fee"],
    ["Resort Fee | per night", "resort fee"],
  ])('matches "%s" as %s', (text, expected) => {
    const m = matchFeePhrase(text);
    expect(m?.phrase).toBe(expected);
  });
});

describe("matchFeePhrase — negative examples", () => {
  it.each([
    // Substring mention
    "Customer Service Fee Schedule",
    // Policy paragraph form
    "Our service fee policy applies",
    // Phrase + free-text suffix without a separator
    "Service fee schedule",
    "Service fee applies",
    // Pure subtotal/total rows
    "Subtotal",
    "Total",
    "Grand Total",
    // Legally-required line items
    "Sales Tax",
    "Tax",
    "VAT",
    "GST",
    "Shipping",
    "Delivery",
    "Tip",
    "Gratuity",
    // Composite tax-bearing fee — defense-in-depth via EXCLUDE_RE
    "Service Fee (incl. Tax)",
  ])('rejects "%s"', (text) => {
    expect(matchFeePhrase(text)).toBeNull();
  });
});

describe("isCurrencyAmount", () => {
  it.each([
    ["$45.00", true],
    ["$2.99", true],
    ["$ 1,234.56", true],
    ["£12", true],
    // The integer fragment permits commas as thousands separators, so the
    // EU comma-decimal form like "€9,99" matches as a side effect. The
    // adjacent-amount check is a precision filter for "is there a number
    // here", not a typed parse — false positives on European decimals
    // are harmless.
    ["€9,99", true],
    ["¥1000", true],
    ["$45 USD", true],
    ["45", false],
    ["forty-five", false],
    ["Total: $45.00", false],
    ["", false],
  ])('isCurrencyAmount("%s") === %s', (text, expected) => {
    expect(isCurrencyAmount(text)).toBe(expected);
  });
});

describe("hiddenFeeAnnotateRule on checkout URLs", () => {
  it("annotates a resort-fee row in a <table>", () => {
    document.body.innerHTML = `
      <table class="order-summary">
        <tr><td>Room rate</td><td>$199.00</td></tr>
        <tr><td>Resort Fee</td><td>$45.00</td></tr>
        <tr><td>Sales Tax</td><td>$22.40</td></tr>
        <tr><td>Total</td><td>$266.40</td></tr>
      </table>
    `;
    hiddenFeeAnnotateRule.apply(document.body);

    const chips = document.querySelectorAll(`.${FLAG_CLASS}`);
    expect(chips.length).toBe(1);
    expect(chips[0]?.textContent).toContain("resort fee");
    expect(chips[0]?.textContent).toContain("$45.00");
  });

  it("annotates a service-fee row in a flex order-summary aside", () => {
    document.body.innerHTML = `
      <aside class="order-summary">
        <div class="row"><span class="title">Concert ticket</span><span class="amount">$120.00</span></div>
        <div class="row"><span class="title">Service Fee</span><span class="amount">$18.50</span></div>
        <div class="row"><span class="title">Total</span><span class="amount">$138.50</span></div>
      </aside>
    `;
    hiddenFeeAnnotateRule.apply(document.body);

    const chip = document.querySelector(`.${FLAG_CLASS}`);
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toContain("service fee");
    expect(chip?.textContent).toContain("$18.50");
  });

  it("does not annotate marketing copy that mentions 'service fee'", () => {
    document.body.innerHTML = `
      <div class="checkout-page">
        <p>Read more about our service fee policy in the FAQ.</p>
        <table class="order-summary">
          <tr><td>Ticket</td><td>$50.00</td></tr>
          <tr><td>Total</td><td>$50.00</td></tr>
        </table>
      </div>
    `;
    hiddenFeeAnnotateRule.apply(document.body);
    expect(document.querySelectorAll(`.${FLAG_CLASS}`).length).toBe(0);
  });

  it("does not annotate a single-item-cart row (fee IS the product)", () => {
    document.body.innerHTML = `
      <div class="cart-container">
        <div class="row"><span>Convenience Fee</span><span>$2.99</span></div>
        <div class="row"><span>Total</span><span>$2.99</span></div>
      </div>
    `;
    hiddenFeeAnnotateRule.apply(document.body);
    expect(document.querySelectorAll(`.${FLAG_CLASS}`).length).toBe(0);
  });

  it("does not annotate a Sales Tax row", () => {
    document.body.innerHTML = `
      <table class="order-summary">
        <tr><td>Item</td><td>$10.00</td></tr>
        <tr><td>Sales Tax</td><td>$0.80</td></tr>
        <tr><td>Total</td><td>$10.80</td></tr>
      </table>
    `;
    hiddenFeeAnnotateRule.apply(document.body);
    expect(document.querySelectorAll(`.${FLAG_CLASS}`).length).toBe(0);
  });

  it("does not annotate a fee phrase that has no adjacent amount", () => {
    document.body.innerHTML = `
      <aside class="order-summary">
        <div class="row"><span>Item A</span><span>$10.00</span></div>
        <div class="row"><span>Item B</span><span>$5.00</span></div>
        <div class="info"><span>Resort Fee</span><span>see details</span></div>
        <div class="row"><span>Total</span><span>$15.00</span></div>
      </aside>
    `;
    hiddenFeeAnnotateRule.apply(document.body);
    expect(document.querySelectorAll(`.${FLAG_CLASS}`).length).toBe(0);
  });

  it("does not double-annotate on a repeat scan", async () => {
    document.body.innerHTML = `
      <table class="order-summary">
        <tr><td>Show ticket</td><td>$45.00</td></tr>
        <tr><td>Venue Fee</td><td>$5.00</td></tr>
        <tr><td>Total</td><td>$50.00</td></tr>
      </table>
    `;
    hiddenFeeAnnotateRule.apply(document.body);

    document.body.append(document.createElement("div"));
    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    expect(document.querySelectorAll(`.${FLAG_CLASS}`).length).toBe(1);
  });

  it("annotates a lazy-loaded order summary", async () => {
    hiddenFeeAnnotateRule.apply(document.body);

    const late = document.createElement("table");
    late.className = "order-summary";
    late.innerHTML = `
      <tr><td>Item</td><td>$25.00</td></tr>
      <tr><td>Handling Fee</td><td>$3.00</td></tr>
      <tr><td>Total</td><td>$28.00</td></tr>
    `;
    document.body.append(late);

    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    expect(document.querySelector(`.${FLAG_CLASS}`)).not.toBeNull();
  });

  it("annotates a label with an embedded amount", () => {
    document.body.innerHTML = `
      <table class="order-summary">
        <tr><td colspan="2">Room rate $199.00</td></tr>
        <tr><td colspan="2">Resort Fee $45.00</td></tr>
        <tr><td colspan="2">Total $244.00</td></tr>
      </table>
    `;
    hiddenFeeAnnotateRule.apply(document.body);
    const chip = document.querySelector(`.${FLAG_CLASS}`);
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toContain("$45.00");
  });

  it("respects schema.org Order microdata as a container signal", () => {
    document.body.innerHTML = `
      <div itemscope itemtype="https://schema.org/Order">
        <div class="row"><span>Concert ticket</span><span>$80.00</span></div>
        <div class="row"><span>Convenience Fee</span><span>$5.00</span></div>
        <div class="row"><span>Total</span><span>$85.00</span></div>
      </div>
    `;
    hiddenFeeAnnotateRule.apply(document.body);
    expect(document.querySelector(`.${FLAG_CLASS}`)).not.toBeNull();
  });
});

describe("hiddenFeeAnnotateRule URL gating", () => {
  it("does not annotate on a non-checkout URL", () => {
    const originalHref = location.href;
    history.replaceState({}, "", "/hotel/details");

    try {
      document.body.innerHTML = `
        <table class="order-summary">
          <tr><td>Item</td><td>$10.00</td></tr>
          <tr><td>Service Fee</td><td>$2.00</td></tr>
          <tr><td>Total</td><td>$12.00</td></tr>
        </table>
      `;
      hiddenFeeAnnotateRule.apply(document.body);
      expect(document.querySelectorAll(`.${FLAG_CLASS}`).length).toBe(0);
    } finally {
      history.replaceState({}, "", originalHref);
    }
  });
});

describe("findOrderSummaryAncestor", () => {
  it("walks up to a <table>", () => {
    document.body.innerHTML = `
      <table class="cart"><tr><td><span id="label">Resort Fee</span></td><td>$45</td></tr></table>
    `;
    const label = document.querySelector("#label") as HTMLElement;
    expect(findOrderSummaryAncestor(label)?.tagName).toBe("TABLE");
  });

  it("walks up to an [role=region] with order-summary labelling", () => {
    document.body.innerHTML = `
      <section role="region" aria-label="Order Summary">
        <div><span id="label">Service Fee</span><span>$2.00</span></div>
      </section>
    `;
    const label = document.querySelector("#label") as HTMLElement;
    expect(findOrderSummaryAncestor(label)?.getAttribute("role")).toBe(
      "region",
    );
  });

  it("tolerates aria-labelledby with leading/trailing whitespace", () => {
    // jsdom in this project does not expose the `CSS` global; polyfill so
    // the labelledby resolution path can execute. Identity escape is fine
    // here — the test only inserts known-safe id values. Read via `globalThis`
    // so the absent global reads as `undefined` instead of throwing.
    const previousCss = (globalThis as { CSS?: unknown }).CSS;
    (globalThis as { CSS?: { escape: (input: string) => string } }).CSS = {
      escape: (input: string) => input,
    };
    try {
      document.body.innerHTML = `
        <h2 id="heading-a">Order</h2>
        <h2 id="heading-b">Summary</h2>
        <section role="region" aria-labelledby="  heading-a heading-b  ">
          <div><span id="label">Service Fee</span><span>$2.00</span></div>
        </section>
      `;
      const label = document.querySelector("#label") as HTMLElement;
      // Splitting "  heading-a heading-b  " on \s+ yields empty-string IDs.
      // `CSS.escape("")` is "", so `querySelector("#")` would throw with a
      // DOMException if we didn't skip empty ids. The region must still
      // resolve as an order-summary container.
      expect(() => findOrderSummaryAncestor(label)).not.toThrow();
      expect(findOrderSummaryAncestor(label)?.getAttribute("role")).toBe(
        "region",
      );
    } finally {
      (globalThis as { CSS?: unknown }).CSS = previousCss;
    }
  });

  it("returns null when label is inside a <nav>", () => {
    document.body.innerHTML = `
      <nav><a><span id="label">Service Fee FAQ</span></a></nav>
    `;
    const label = document.querySelector("#label") as HTMLElement;
    expect(findOrderSummaryAncestor(label)).toBeNull();
  });
});

describe("findAmountForLabel", () => {
  it("finds sibling currency text", () => {
    document.body.innerHTML = `
      <div><span id="label">Service Fee</span><span>$2.99</span></div>
    `;
    const label = document.querySelector("#label") as HTMLElement;
    expect(findAmountForLabel(label)).toBe("$2.99");
  });

  it("returns null when no sibling amount exists", () => {
    document.body.innerHTML = `
      <div><span id="label">Service Fee</span><span>see policy</span></div>
    `;
    const label = document.querySelector("#label") as HTMLElement;
    expect(findAmountForLabel(label)).toBeNull();
  });
});

describe("countPricedRows", () => {
  it("counts table rows with amounts, excluding total rows", () => {
    document.body.innerHTML = `
      <table id="t">
        <tr><td>Item</td><td>$10.00</td></tr>
        <tr><td>Fee</td><td>$2.00</td></tr>
        <tr><td>Total</td><td>$12.00</td></tr>
      </table>
    `;
    const t = document.querySelector("#t") as HTMLElement;
    expect(countPricedRows(t)).toBe(2);
  });

  it("returns 1 for a single-item cart", () => {
    document.body.innerHTML = `
      <div id="c">
        <div><span>Convenience Fee</span><span>$2.99</span></div>
        <div><span>Total</span><span>$2.99</span></div>
      </div>
    `;
    const c = document.querySelector("#c") as HTMLElement;
    expect(countPricedRows(c)).toBe(1);
  });
});
