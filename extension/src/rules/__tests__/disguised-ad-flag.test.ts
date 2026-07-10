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
  document.body.replaceChildren();
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
    "Featured Listing",
    "From Our Advertisers",
    "Marketing Partner",
  ])("hides a card labeled '%s'", (label) => {
    document.body.innerHTML = articleCard({ label });
    disguisedAdFlagRule.apply(document.body);
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).not.toBeNull();
  });

  it("hides a card labeled 'In partnership with Acme'", () => {
    document.body.innerHTML = articleCard({
      label: "In partnership with Acme",
    });
    disguisedAdFlagRule.apply(document.body);
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).not.toBeNull();
  });

  it("hides a card with lowercase '[ad]'", () => {
    // Audit #203 item 18: lowercase form. Safe because the regex is anchored
    // on the trimmed textContent with no internal whitespace allowed —
    // editorial idioms `[ad hoc]` / `[ad lib]` can't match.
    document.body.innerHTML = articleCard({ label: "[ad]" });
    disguisedAdFlagRule.apply(document.body);
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).not.toBeNull();
  });

  it('hides a card whose heading is a `<div class="headline">` instead of an h*', () => {
    document.body.innerHTML = `
      <article class="post" data-fixture="card">
        <span class="label">Sponsored</span>
        <div class="headline"><a href="/x">Acme energy drinks are the future of hydration</a></div>
        <img src="hero.jpg" alt="" />
        <p>A long-form look at how Acme reformulated its flagship beverage to taste less metallic while keeping the same caffeine load and electrolyte balance.</p>
        <a href="/x">Read more</a>
      </article>
    `;
    disguisedAdFlagRule.apply(document.body);
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).not.toBeNull();
    expect(document.querySelector('[data-fixture="card"]')).toBeNull();
  });

  it("hides a card whose heading is `[role=heading]` on a div", () => {
    document.body.innerHTML = `
      <article class="post" data-fixture="card">
        <span class="label">Sponsored</span>
        <div role="heading" aria-level="2"><a href="/x">Acme drinks are the future</a></div>
        <img src="hero.jpg" alt="" />
        <p>A long-form look at how Acme reformulated its flagship beverage to taste less metallic while keeping the same caffeine load and electrolyte balance.</p>
        <a href="/x">Read more</a>
      </article>
    `;
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

  it("hides a single card whose content sits inside a wrapper div", () => {
    // Regression for the follow-up to #228: with the original
    // `hasOtherCardSubtree` guard, any descendant outside the label's
    // chain with both an `<img>` and an `<a href>` made the rule reject
    // the card. A common card layout puts the label as a sibling to a
    // single content wrapper that holds the heading + image + link,
    // which would trip that guard. The card must still be hidden.
    document.body.innerHTML = `
      <article class="post" data-fixture="wrapped-card">
        <span class="label">Sponsored</span>
        <div class="card-body">
          <h2><a href="/ad">Acme energy drinks are the future of hydration</a></h2>
          <img src="hero.jpg" alt="" />
          <p>A long-form look at how Acme reformulated its flagship beverage to taste less metallic while keeping the same caffeine load and electrolyte balance.</p>
        </div>
      </article>
    `;
    disguisedAdFlagRule.apply(document.body);

    expect(document.querySelector('[data-fixture="wrapped-card"]')).toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).not.toBeNull();
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

  it("does not double-count nested prose elements toward the body length", () => {
    // The card's actual prose ("forty-two chars of nested text here") is
    // ~37 chars, well below MIN_ARTICLE_PROSE_LENGTH (80). If the prose
    // counter walked every <div>/<p>/<span> match, the same text would be
    // counted three times (~111 chars) and the card would be falsely
    // hidden. Leaf-ish filtering keeps that from happening.
    document.body.innerHTML = `
      <article class="post" data-fixture="nested-prose">
        <span class="label">Sponsored</span>
        <h2>Headline</h2>
        <img alt="" src="x.jpg" />
        <div class="body">
          <p>
            <span>forty-two chars of nested text here.</span>
          </p>
        </div>
      </article>
    `;
    disguisedAdFlagRule.apply(document.body);
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
    expect(
      document.querySelector('[data-fixture="nested-prose"]'),
    ).not.toBeNull();
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

describe("disguisedAdFlagRule feed-wrapper guard", () => {
  it("does not replace a feed wrapper when one card lacks its own heading (#228)", () => {
    // Repro from #228 — entire reddit feed replaced as one placeholder.
    // Reddit's <shreddit-feed> contains multiple <shreddit-ad-post>
    // cards. Each ad post carries its title in a
    // <shreddit-dynamic-ad-link class="headline"> element. When a
    // particular ad post momentarily lacks its own headline class (a
    // different ad creative, a mid-hydration burst), the walk from that
    // post's "Promoted" label skips past the post and reaches the feed.
    // Pre-fix, the feed passed isArticleShaped because *sibling* ad
    // posts carry headlines — so the rule replaced the whole feed.
    document.body.innerHTML = `
      <div class="feed" data-fixture="feed">
        <div class="ad-post" data-fixture="ad-headless">
          <span class="label">Promoted</span>
          <img alt="" src="a.jpg" />
          <a href="/a">Visit advertiser</a>
          <p>Ad post body copy that satisfies the prose-length minimum but whose card boundary lacks any heading element.</p>
        </div>
        <div class="ad-post" data-fixture="ad-with-heading-1">
          <span class="label">Promoted</span>
          <h2><a href="/b">Buy our energy drink</a></h2>
          <img alt="" src="b.jpg" />
          <p>A long-form advertorial body that satisfies the prose-length check on its own card boundary.</p>
        </div>
        <div class="ad-post" data-fixture="ad-with-heading-2">
          <span class="label">Promoted</span>
          <h2><a href="/c">Drive the Acme Truck</a></h2>
          <img alt="" src="c.jpg" />
          <p>A second long-form advertorial body that satisfies the prose-length check on its own card boundary.</p>
        </div>
      </div>
    `;
    disguisedAdFlagRule.apply(document.body);

    // Feed wrapper survives.
    expect(document.querySelector('[data-fixture="feed"]')).not.toBeNull();
    // Cards with their own heading are hidden as individual placeholders.
    expect(
      document.querySelector('[data-fixture="ad-with-heading-1"]'),
    ).toBeNull();
    expect(
      document.querySelector('[data-fixture="ad-with-heading-2"]'),
    ).toBeNull();
    // The headless card is left alone (no article-shaped ancestor below
    // the feed). That's the degraded but acceptable outcome — better
    // than replacing the whole feed.
    expect(
      document.querySelector('[data-fixture="ad-headless"]'),
    ).not.toBeNull();
    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(2);
  });

  it("stops at a role='feed' wrapper", () => {
    // ARIA infinite-scroll feed pattern — same boundary semantics as
    // <main>. A label inside a feed item that doesn't resolve to a
    // card-shaped ancestor *below* the feed must not climb to it.
    document.body.innerHTML = `
      <div role="feed" data-fixture="feed">
        <div class="ad-post" data-fixture="ad-headless">
          <span class="label">Promoted</span>
          <img alt="" src="x.jpg" />
          <a href="/x">Visit</a>
          <p>Ad post body without any heading element inside its own card boundary.</p>
        </div>
        <article data-fixture="editorial">
          <h2>Editorial story</h2>
          <img alt="" src="y.jpg" />
          <a href="/y">Read</a>
          <p>Editorial copy that runs long enough to satisfy the prose-length minimum.</p>
        </article>
      </div>
    `;
    disguisedAdFlagRule.apply(document.body);

    expect(document.querySelector('[data-fixture="feed"]')).not.toBeNull();
    expect(document.querySelector('[data-fixture="editorial"]')).not.toBeNull();
    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(0);
  });

  it("does not match a container with multiple headings (long-form section landing)", () => {
    // A wrapper that holds two headings — e.g. an editorial section
    // header plus a card heading — is not a single advertorial card.
    // Even with a "Sponsored" label inside, the rule should not
    // collapse the whole wrapper.
    document.body.innerHTML = `
      <section data-fixture="section">
        <h1>Section header</h1>
        <article data-fixture="card">
          <span class="label">Sponsored</span>
          <h2><a href="/x">Card headline</a></h2>
          <img alt="" src="x.jpg" />
          <p>Card body copy that exceeds the eighty-character prose minimum required by the rule's article-shape check.</p>
        </article>
      </section>
    `;
    disguisedAdFlagRule.apply(document.body);

    // The card itself is the (single-heading) article-shaped ancestor —
    // it gets hidden. The outer section is preserved.
    expect(document.querySelector('[data-fixture="section"]')).not.toBeNull();
    expect(document.querySelector('[data-fixture="card"]')).toBeNull();
    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(1);
  });
});

describe("disguisedAdFlagRule reveal flow", () => {
  it("does not re-hide an article the user revealed via click", () => {
    document.body.innerHTML = articleCard({ label: "Sponsored" });
    disguisedAdFlagRule.apply(document.body);

    const placeholder = document.querySelector<HTMLElement>(
      `.${PLACEHOLDER_CLASS}`,
    );
    expect(placeholder).not.toBeNull();

    // attachReveal in lib/placeholder restores the original element with
    // REVEALED_ATTR stamped on it. A subsequent scan (the second apply
    // call here stands in for the mutation burst the subtree-watcher
    // fans out when the original re-attaches) must not re-wrap the
    // same article — otherwise the placeholder comes back the moment
    // the user clicks reveal.
    placeholder?.click();
    expect(document.querySelector('[data-fixture="card"]')).not.toBeNull();

    disguisedAdFlagRule.apply(document.body);

    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(0);
    expect(document.querySelector('[data-fixture="card"]')).not.toBeNull();
  });

  it("re-hides a freshly-inserted advertorial card after a reveal elsewhere", () => {
    // A reveal on one card must not desensitize the rule for unrelated
    // siblings — only the revealed ancestor (and its descendants) are
    // exempt.
    document.body.innerHTML = `
      ${articleCard({ label: "Sponsored", heading: "First card" })}
      ${articleCard({ label: "Sponsored", heading: "Second card" })}
    `;
    disguisedAdFlagRule.apply(document.body);
    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(2);

    const [first] = document.querySelectorAll<HTMLElement>(
      `.${PLACEHOLDER_CLASS}`,
    );
    first?.click();

    disguisedAdFlagRule.apply(document.body);

    // First card is revealed and stays revealed; second card stays hidden.
    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(1);
    const revealedCards = document.querySelectorAll('[data-fixture="card"]');
    expect(revealedCards).toHaveLength(1);
  });
});
