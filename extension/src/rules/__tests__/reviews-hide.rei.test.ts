/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://www.rei.com/product/C05679/brooks-ghost-18-road-running-shoes-womens"}
 */
import { PLACEHOLDER_CLASS } from "../../lib/placeholder";
import { reviewsHideRule } from "../reviews-hide";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("reviews-hide on rei.com", () => {
  it("replaces the product-reviews accordion with a placeholder", () => {
    document.body.innerHTML = `
      <div id="product-reviews-accordion" data-ui="product-reviews">
        <div id="product-reviews">Reviews (52)</div>
        <div id="product-reviews-collapsible">
          <section class="product-reviews__product-rating">4.2</section>
          <div class="review-card">Great shoes! - Reviewer</div>
        </div>
      </div>
    `;
    reviewsHideRule.apply(document.body);

    expect(document.getElementById("product-reviews-accordion")).toBeNull();
    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(1);
  });

  it("keeps the inline review summary near the product title visible", () => {
    document.body.innerHTML = `
      <div>
        <h1>Brooks Ghost 18</h1>
        <div data-ui="review-summary">(52) 4.2 out of 5 stars</div>
      </div>
    `;
    reviewsHideRule.apply(document.body);

    expect(document.querySelector('[data-ui="review-summary"]')).not.toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });

  it("does not match walmart or amazon selectors on rei", () => {
    document.body.innerHTML = `
      <section id="item-review-section">Walmart-style markup</section>
      <div id="reviewsMedley">Amazon-style markup</div>
    `;
    reviewsHideRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
    expect(document.getElementById("item-review-section")).not.toBeNull();
    expect(document.getElementById("reviewsMedley")).not.toBeNull();
  });
});
