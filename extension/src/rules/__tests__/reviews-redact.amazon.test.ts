/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://www.amazon.com/dp/B0BV241H3F/"}
 */
import { PLACEHOLDER_CLASS } from "../../lib/placeholder";
import { reviewsRedactRule } from "../reviews-redact";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("reviews-redact on amazon.com", () => {
  it("replaces #reviewsMedley with a placeholder", () => {
    document.body.innerHTML = `
      <div id="reviewsMedley">
        <div data-hook="review">Review body</div>
      </div>
    `;
    reviewsRedactRule.apply(document.body);

    expect(document.querySelector("#reviewsMedley")).toBeNull();
    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(1);
  });

  it("keeps the aggregate rating block near the product title visible (not UGC)", () => {
    document.body.innerHTML = `
      <div id="titleBlock">
        <h1 id="productTitle">Some product</h1>
        <div id="averageCustomerReviews">
          <span id="acrPopover">4.4 out of 5</span>
          <span id="acrCustomerReviewText">(6,777)</span>
        </div>
      </div>
    `;
    reviewsRedactRule.apply(document.body);

    expect(document.querySelector("#averageCustomerReviews")).not.toBeNull();
    expect(document.querySelector("#productTitle")).not.toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });

  it("replaces standalone review cards on the product-reviews page", () => {
    document.body.innerHTML = `
      <div id="cm_cr-review_list">
        <div data-hook="review" id="R1">First</div>
        <div data-hook="review" id="R2">Second</div>
      </div>
    `;
    reviewsRedactRule.apply(document.body);

    expect(document.querySelectorAll('[data-hook="review"]')).toHaveLength(0);
    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(2);
  });

  it("only replaces the outermost match when review cards are nested in the medley", () => {
    document.body.innerHTML = `
      <div id="reviewsMedley">
        <div data-hook="review" id="R1">First</div>
        <div data-hook="review" id="R2">Second</div>
      </div>
    `;
    reviewsRedactRule.apply(document.body);

    expect(document.querySelector("#reviewsMedley")).toBeNull();
    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(1);
  });
});
