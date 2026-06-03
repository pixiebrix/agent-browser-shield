/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://www.walmart.com/ip/foo/18468558390"}
 */
import { PLACEHOLDER_CLASS } from "../../lib/placeholder";
import { reviewsRedactRule } from "../reviews-redact";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("reviews-redact on walmart.com", () => {
  it("replaces #item-review-section with a placeholder", () => {
    document.body.innerHTML = `
      <section id="item-review-section" data-testid="item-review-section">
        <h2>Customer ratings & reviews</h2>
      </section>
    `;
    reviewsRedactRule.apply(document.body);

    expect(document.querySelector("#item-review-section")).toBeNull();
    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(1);
  });

  it("keeps the inline rating block near the product title visible (not UGC)", () => {
    document.body.innerHTML = `
      <div>
        <h1>Some product</h1>
        <div data-testid="reviews-and-ratings">(4.1) | 8 ratings</div>
      </div>
    `;
    reviewsRedactRule.apply(document.body);

    expect(
      document.querySelector('[data-testid="reviews-and-ratings"]'),
    ).not.toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });

  it("replaces seller ratings and enhanced review sections", () => {
    document.body.innerHTML = `
      <div data-testid="seller-ratings-and-reviews">Seller stars</div>
      <div data-testid="enhanced-review-section">Sponsored reviews</div>
    `;
    reviewsRedactRule.apply(document.body);

    expect(
      document.querySelector('[data-testid="seller-ratings-and-reviews"]'),
    ).toBeNull();
    expect(
      document.querySelector('[data-testid="enhanced-review-section"]'),
    ).toBeNull();
    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(2);
  });

  it("does not match amazon selectors on walmart", () => {
    document.body.innerHTML = `
      <div id="reviewsMedley">Amazon-style markup</div>
      <div id="averageCustomerReviews">4.4 out of 5</div>
    `;
    reviewsRedactRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
    expect(document.querySelector("#reviewsMedley")).not.toBeNull();
  });
});
