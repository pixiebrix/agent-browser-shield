// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import {
  DISGUISED_AD_FLAG_CONSIDERED_ATTR,
  HIDDEN_ATTR,
  RULE_ATTR,
} from "../../lib/dom-markers";
import { PLACEHOLDER_CLASS } from "../../lib/placeholder";
import { disguisedAdFlagRule } from "../disguised-ad-flag";

const RULE_ID = "disguised-ad-flag";

function articleCard({
  label,
  heading = "Acme energy drinks are the future of hydration",
  body = "A long-form look at how Acme reformulated its flagship beverage to taste less metallic while keeping the same caffeine load and electrolyte balance.",
  href = "https://example.com/article",
}: {
  label: string;
  heading?: string;
  body?: string;
  href?: string;
}): string {
  return `
    <article class="post" data-fixture="card">
      <span class="label">${label}</span>
      <h2><a href="${href}">${heading}</a></h2>
      <img src="hero.jpg" alt="" />
      <p>${body}</p>
      <a href="${href}">Read more</a>
    </article>
  `;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  disguisedAdFlagRule.teardown();
});

describe("disguisedAdFlagRule positive cases", () => {
  it("hides an article-shaped card with a 'Sponsored' label", () => {
    document.body.innerHTML = articleCard({ label: "Sponsored" });
    disguisedAdFlagRule.apply(document.body);

    expect(document.querySelector('[data-fixture="card"]')).toBeNull();
    const placeholder = document.querySelector(`.${PLACEHOLDER_CLASS}`);
    expect(placeholder).not.toBeNull();
    expect(placeholder?.getAttribute(RULE_ATTR)).toBe(RULE_ID);
  });

  it.each([
    "Promoted",
    "Advertorial",
    "Paid Post",
    "Partner Content",
    "Sponsored Content",
    "Sponsored Post",
    "Branded Content",
  ])("hides a card labeled '%s'", (label) => {
    document.body.innerHTML = articleCard({ label });
    disguisedAdFlagRule.apply(document.body);
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).not.toBeNull();
  });

  it("hides a card with a bracket-form '[Ad]' label", () => {
    document.body.innerHTML = articleCard({ label: "[Ad]" });
    disguisedAdFlagRule.apply(document.body);
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).not.toBeNull();
  });

  it("hides a card with a bracket-form '[AD]' label", () => {
    document.body.innerHTML = articleCard({ label: "[AD]" });
    disguisedAdFlagRule.apply(document.body);
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).not.toBeNull();
  });

  it("hides a card with a parenthesized '(promoted)' label", () => {
    document.body.innerHTML = articleCard({ label: "(promoted)" });
    disguisedAdFlagRule.apply(document.body);
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).not.toBeNull();
  });

  it("hides a card labeled 'Paid for and presented by Acme'", () => {
    document.body.innerHTML = articleCard({
      label: "Paid for and presented by Acme",
    });
    disguisedAdFlagRule.apply(document.body);
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).not.toBeNull();
  });

  it("hides a card labeled 'Sponsored by Acme'", () => {
    document.body.innerHTML = articleCard({ label: "Sponsored by Acme" });
    disguisedAdFlagRule.apply(document.body);
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).not.toBeNull();
  });

  it("hides a card labeled 'Sponsored — Acme Energy'", () => {
    document.body.innerHTML = articleCard({ label: "Sponsored — Acme Energy" });
    disguisedAdFlagRule.apply(document.body);
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).not.toBeNull();
  });

  it("includes the matched phrase in the placeholder label", () => {
    document.body.innerHTML = articleCard({ label: "Sponsored" });
    disguisedAdFlagRule.apply(document.body);
    const placeholder = document.querySelector(`.${PLACEHOLDER_CLASS}`);
    const announcement = placeholder
      ?.querySelector("button")
      ?.getAttribute("aria-label");
    expect(announcement).toContain("sponsored content");
    expect(announcement).toContain("Sponsored");
  });

  it("hides each of several advertorial cards interleaved with editorial cards", () => {
    document.body.innerHTML = `
      ${articleCard({ label: "Sponsored", heading: "Ad card 1" })}
      <article class="post" data-fixture="editorial">
        <h2>Real editorial story</h2>
        <img src="x.jpg" alt="" />
        <p>This is editorial copy about an unrelated topic.</p>
        <a href="/a">Read more</a>
      </article>
      ${articleCard({ label: "[Ad]", heading: "Ad card 2" })}
    `;
    disguisedAdFlagRule.apply(document.body);

    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(2);
    expect(document.querySelector('[data-fixture="editorial"]')).not.toBeNull();
  });

  it("dedupes when a card carries both a badge and a 'Paid for' caption", () => {
    document.body.innerHTML = `
      <article class="post" data-fixture="dual-label">
        <span class="badge">Sponsored</span>
        <h2>Headline</h2>
        <img src="x.jpg" alt="" />
        <p>Body copy that runs long enough to satisfy the prose-length check on the surrounding article ancestor when scanned.</p>
        <span class="caption">Paid for and presented by Acme</span>
      </article>
    `;
    disguisedAdFlagRule.apply(document.body);

    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(1);
    expect(document.querySelector('[data-fixture="dual-label"]')).toBeNull();
  });
});

describe("disguisedAdFlagRule false-positive guards", () => {
  it("leaves editorial prose mentioning 'sponsored by' alone", () => {
    document.body.innerHTML = `
      <article class="post" data-fixture="editorial">
        <h2>Acme signs new sponsorship deal</h2>
        <img src="x.jpg" alt="" />
        <p>The team is sponsored by Adidas this season, but the announcement was not received warmly by long-time fans of the franchise.</p>
        <a href="/full-story">Read more</a>
      </article>
    `;
    disguisedAdFlagRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
    expect(document.querySelector('[data-fixture="editorial"]')).not.toBeNull();
  });

  it("leaves a sort-by filter button labeled 'Sponsored' alone", () => {
    document.body.innerHTML = `
      <div class="filters">
        <button type="button" data-fixture="filter">Sponsored</button>
        <button type="button">Organic</button>
      </div>
      <article class="post" data-fixture="real">
        <h2>Editorial headline</h2>
        <img src="x.jpg" alt="" />
        <p>Editorial body copy without any disclosure label.</p>
        <a href="/a">Read more</a>
      </article>
    `;
    disguisedAdFlagRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
    expect(document.querySelector('[data-fixture="filter"]')).not.toBeNull();
  });

  it("leaves a nav link 'Sponsored Content' alone", () => {
    document.body.innerHTML = `
      <nav data-fixture="nav">
        <a href="/sponsored">Sponsored Content</a>
        <a href="/news">News</a>
      </nav>
      <article class="post"><h2>x</h2><img alt=""/><p>body</p></article>
    `;
    disguisedAdFlagRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
    expect(document.querySelector('[data-fixture="nav"]')).not.toBeNull();
  });

  it("leaves a label with no article-shaped ancestor alone", () => {
    document.body.innerHTML = `
      <aside data-fixture="loose-label">
        <span>Sponsored</span>
      </aside>
    `;
    disguisedAdFlagRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
    expect(
      document.querySelector('[data-fixture="loose-label"]'),
    ).not.toBeNull();
    // Negative caches the decision so re-scans don't re-evaluate.
    const span = document
      .querySelector('[data-fixture="loose-label"]')
      ?.querySelector("span");
    expect(span?.hasAttribute(DISGUISED_AD_FLAG_CONSIDERED_ATTR)).toBe(true);
  });

  it("does not match the English preposition 'ad' in '[ad hoc]'", () => {
    document.body.innerHTML = `
      <article class="post" data-fixture="latin">
        <h2>An [ad hoc] committee was convened</h2>
        <img src="x.jpg" alt="" />
        <p>The committee was assembled to investigate the matter without delay.</p>
        <a href="/a">Read more</a>
      </article>
    `;
    disguisedAdFlagRule.apply(document.body);
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });

  it("skips a label inside an ads-hide-marked ancestor", () => {
    document.body.innerHTML = `
      <div data-abs-hidden="ads-hide" style="display:none">
        ${articleCard({ label: "Sponsored", heading: "Hidden by ads-hide" })}
      </div>
    `;
    disguisedAdFlagRule.apply(document.body);
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
    // The ads-hide-marked wrapper still exists; we didn't touch it.
    expect(
      document.querySelector(`[${HIDDEN_ATTR}="ads-hide"]`),
    ).not.toBeNull();
  });

  it("skips an article without a heading even if labeled 'Sponsored'", () => {
    document.body.innerHTML = `
      <article class="post" data-fixture="no-heading">
        <span class="label">Sponsored</span>
        <p>Just a paragraph without a heading.</p>
        <a href="/a">Read more</a>
      </article>
    `;
    disguisedAdFlagRule.apply(document.body);
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });

  it("skips a card with too-short prose body", () => {
    document.body.innerHTML = `
      <article class="post" data-fixture="thin">
        <span class="label">Sponsored</span>
        <h2>Title</h2>
        <img alt="" src="x.jpg" />
        <p>Short.</p>
      </article>
    `;
    disguisedAdFlagRule.apply(document.body);
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });
});
