// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { PLACEHOLDER_CLASS, RULE_ATTR } from "../../lib/placeholder";
import { reviewsHideRule, selectorsFor } from "../reviews-hide";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("selectorsFor", () => {
  it("includes schema.org/Review selector regardless of URL", () => {
    const selectors = selectorsFor("https://random.example.com/product");
    expect(selectors).toContain('[itemtype*="schema.org/Review"]');
  });

  it("does not target schema.org/AggregateRating — that's the summary node", () => {
    const selectors = selectorsFor("https://random.example.com/product");
    expect(selectors).not.toContain('[itemtype*="schema.org/AggregateRating"]');
  });

  it("adds amazon-specific selectors on www.amazon.com", () => {
    const selectors = selectorsFor("https://www.amazon.com/dp/B0BV241H3F/");
    expect(selectors).toContain("#reviewsMedley");
    expect(selectors).toContain('[data-hook="review"]');
  });

  it("keeps the inline near-title aggregate visible on amazon", () => {
    const selectors = selectorsFor("https://www.amazon.com/dp/B0BV241H3F/");
    expect(selectors).not.toContain("#averageCustomerReviews");
  });

  it("adds amazon selectors on apex amazon.com", () => {
    const selectors = selectorsFor("https://amazon.com/dp/B0BV241H3F/");
    expect(selectors).toContain("#reviewsMedley");
  });

  it("adds amazon selectors on smile.amazon.com subdomain", () => {
    const selectors = selectorsFor("https://smile.amazon.com/dp/B0BV241H3F/");
    expect(selectors).toContain("#reviewsMedley");
  });

  it("does not add amazon selectors on unrelated sites", () => {
    const selectors = selectorsFor("https://example.com/dp/123");
    expect(selectors).not.toContain("#reviewsMedley");
  });

  it("does not match look-alike hostnames", () => {
    const selectors = selectorsFor("https://notamazon.com/dp/123");
    expect(selectors).not.toContain("#reviewsMedley");
  });

  it("adds walmart-specific selectors on www.walmart.com", () => {
    const selectors = selectorsFor("https://www.walmart.com/ip/foo/123");
    expect(selectors).toContain("#item-review-section");
    expect(selectors).toContain('[data-testid="seller-ratings-and-reviews"]');
    expect(selectors).toContain('[data-testid="enhanced-review-section"]');
  });

  it("keeps the inline near-title aggregate visible on walmart", () => {
    const selectors = selectorsFor("https://www.walmart.com/ip/foo/123");
    expect(selectors).not.toContain('[data-testid="reviews-and-ratings"]');
  });

  it("adds walmart selectors on apex walmart.com", () => {
    const selectors = selectorsFor("https://walmart.com/ip/foo/123");
    expect(selectors).toContain("#item-review-section");
  });

  it("does not add walmart selectors on look-alike hostnames", () => {
    const selectors = selectorsFor("https://notwalmart.com/ip/foo/123");
    expect(selectors).not.toContain("#item-review-section");
  });

  it("does not cross-pollute selectors between sites", () => {
    const walmart = selectorsFor("https://www.walmart.com/ip/foo/123");
    expect(walmart).not.toContain("#reviewsMedley");
    const amazon = selectorsFor("https://www.amazon.com/dp/123");
    expect(amazon).not.toContain("#item-review-section");
  });
});

describe("reviews-hide", () => {
  it("replaces elements with schema.org/Review itemtype", () => {
    document.body.innerHTML = `
      <article itemscope itemtype="http://schema.org/Review">
        <p>Great product, 5 stars.</p>
      </article>
    `;
    reviewsHideRule.apply(document.body);

    expect(document.querySelector("article")).toBeNull();
    const placeholder = document.querySelector(`.${PLACEHOLDER_CLASS}`);
    expect(placeholder).not.toBeNull();
    expect(placeholder?.getAttribute(RULE_ATTR)).toBe("reviews-hide");
  });

  it("leaves standalone schema.org/AggregateRating elements visible", () => {
    document.body.innerHTML = `
      <div itemscope itemtype="https://schema.org/AggregateRating">
        4.5 stars (200 ratings)
      </div>
    `;
    reviewsHideRule.apply(document.body);

    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(0);
    expect(document.querySelector("div")).not.toBeNull();
  });

  it("hides a Review wrapper containing a nested AggregateRating", () => {
    document.body.innerHTML = `
      <section itemscope itemtype="http://schema.org/Review">
        <div itemscope itemtype="http://schema.org/AggregateRating">
          4.5 stars
        </div>
        <p>Body</p>
      </section>
    `;
    reviewsHideRule.apply(document.body);

    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(1);
    expect(document.querySelector("section")).toBeNull();
  });

  it("ignores elements without matching microdata", () => {
    document.body.innerHTML = `<div>Just a div</div>`;
    reviewsHideRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });

  it("restores the original element on click", () => {
    document.body.innerHTML = `
      <article itemscope itemtype="http://schema.org/Review" id="r1">
        Original review
      </article>
    `;
    reviewsHideRule.apply(document.body);

    const placeholder = document.querySelector<HTMLElement>(
      `.${PLACEHOLDER_CLASS}`,
    );
    placeholder?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const restored = document.getElementById("r1");
    expect(restored).not.toBeNull();
    expect(restored?.textContent).toContain("Original review");
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });
});
