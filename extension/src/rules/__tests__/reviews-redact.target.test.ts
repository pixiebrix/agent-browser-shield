/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://www.target.com/p/apple-magic-mouse-touch-surface/-/A-1010687683"}
 */
import { PLACEHOLDER_CLASS } from "../../lib/placeholder";
import { reviewsRedactRule } from "../reviews-redact";

beforeEach(() => {
  document.body.replaceChildren();
});

describe("reviews-redact on target.com", () => {
  it("replaces the ReviewsDashboard with a placeholder", () => {
    document.body.innerHTML = `
      <div id="Reviews" data-test="ReviewsDashboard">
        <h3 data-test="reviews-heading">Guest ratings & reviews</h3>
        <div>Review cards here</div>
      </div>
    `;
    reviewsRedactRule.apply(document.body);

    expect(document.querySelector("#Reviews")).toBeNull();
    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(1);
  });

  it("keeps the inline rating link near the product title visible", () => {
    document.body.innerHTML = `
      <div>
        <h1>Apple Magic Mouse</h1>
        <a data-test="ratingCountLink" href="#Reviews">4.7 (1,234)</a>
      </div>
    `;
    reviewsRedactRule.apply(document.body);

    expect(
      document.querySelector('[data-test="ratingCountLink"]'),
    ).not.toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });

  it("does not match walmart or amazon selectors on target", () => {
    document.body.innerHTML = `
      <section id="item-review-section">Walmart-style markup</section>
      <div id="reviewsMedley">Amazon-style markup</div>
    `;
    reviewsRedactRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
    expect(document.querySelector("#item-review-section")).not.toBeNull();
    expect(document.querySelector("#reviewsMedley")).not.toBeNull();
  });
});
