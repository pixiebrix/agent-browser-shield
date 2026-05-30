// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://www.amazon.com/dp/B01MUAGZ49"}
 */
import { hiddenTextStripRule } from "../hidden-text-strip";
import { findRecipe, searchUrlHelperRule } from "../search-url-helper";

const LANDMARK_SELECTOR = 'section[data-abs-rule="search-url-helper"]';

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  searchUrlHelperRule.teardown?.();
  hiddenTextStripRule.teardown?.();
});

describe("findRecipe", () => {
  // One representative URL per covered host plus a distinctive token from
  // that host's recipe that the test will assert appears in the matched
  // text. Tokens are chosen to be unique to the site so accidental
  // cross-matches show up as failures.
  it.each<[string, string]>([
    ["https://www.amazon.com/s?k=headphones", "p_89:{brandName}"],
    ["https://smile.amazon.com/dp/B01MUAGZ49", "p_89:{brandName}"],
    ["https://www.bestbuy.com/site/searchpage.jsp?st=4k", "skuidsaas"],
    ["https://www.etsy.com/search?q=wallet", "marketplace={handmade"],
    ["https://www.ikea.com/us/en/search/?q=billy", "PRICE_LOW_HIGH"],
    ["https://www.homedepot.com/s/cordless%20drill", "Nao="],
    ["https://www.rei.com/search?q=tent", "minTrailWeight"],
    [
      "https://github.com/facebook/react/issues?q=is%3Aissue+label%3Abug",
      "is:draft",
    ],
    ["https://en.wikipedia.org/wiki/Albert_Einstein", "Special:Search"],
    ["https://news.ycombinator.com/", "hn.algolia.com"],
    ["https://hn.algolia.com/?q=rust", "byPopularity"],
    [
      "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map",
      "/{locale}/docs/",
    ],
    ["https://www.npmjs.com/package/react", "activeTab="],
    [
      "https://forecast.weather.gov/MapClick.php?lat=40.7142&lon=-74.0064",
      "lat=40.7142",
    ],
    ["https://arxiv.org/list/cs.AI/recent", "searchtype="],
    ["https://docs.python.org/3/library/functions.html#len", "/3/search.html"],
    ["https://www.bbc.com/news", "/news/world"],
  ])("%s — recipe contains %s", (url, token) => {
    const recipe = findRecipe(url);
    expect(recipe).not.toBeNull();
    expect(recipe).toContain(token);
  });

  it("returns null for uncovered hosts", () => {
    expect(findRecipe("https://example.org/anything")).toBeNull();
    expect(findRecipe("https://news.example.com/")).toBeNull();
  });

  it("does not match wikipedia.org siblings like wikimedia.org", () => {
    expect(
      findRecipe("https://commons.wikimedia.org/wiki/Main_Page"),
    ).toBeNull();
  });
});

describe("searchUrlHelperRule.apply (on amazon.com)", () => {
  it("prepends an sr-only landmark with the amazon recipe", () => {
    document.body.innerHTML = `<main id="main">page content</main>`;
    searchUrlHelperRule.apply(document.body);

    const landmark = document.querySelector(LANDMARK_SELECTOR);
    expect(landmark).not.toBeNull();
    expect(landmark?.getAttribute("role")).toBe("note");
    expect(landmark?.getAttribute("aria-label")).toBe("abs URL helper");
    expect(landmark?.classList.contains("sr-only")).toBe(true);
    expect(landmark?.textContent).toContain("/s?k={query}");
    expect(landmark?.textContent).toContain("/dp/{ASIN}");
    // Must be the first child of <body> so it lands at the top of the
    // a11y tree.
    expect(document.body.firstElementChild).toBe(landmark);
  });

  it("applies the structural 1×1 + overflow:hidden + position:absolute envelope inline", () => {
    searchUrlHelperRule.apply(document.body);

    const landmark = document.querySelector<HTMLElement>(LANDMARK_SELECTOR);
    expect(landmark).not.toBeNull();
    // Belt-and-suspenders: both signals hidden-text-strip uses to
    // preserve sr-only content must be present.
    expect(landmark?.style.position).toBe("absolute");
    expect(landmark?.style.width).toBe("1px");
    expect(landmark?.style.height).toBe("1px");
    expect(landmark?.style.overflow).toBe("hidden");
  });

  it("is idempotent — repeated applies do not stack landmarks", () => {
    searchUrlHelperRule.apply(document.body);
    searchUrlHelperRule.apply(document.body);
    searchUrlHelperRule.apply(document.body);

    expect(document.querySelectorAll(LANDMARK_SELECTOR)).toHaveLength(1);
  });

  it("teardown removes the landmark", () => {
    searchUrlHelperRule.apply(document.body);
    expect(document.querySelector(LANDMARK_SELECTOR)).not.toBeNull();

    searchUrlHelperRule.teardown?.();
    expect(document.querySelector(LANDMARK_SELECTOR)).toBeNull();
  });

  // Regression: if hidden-text-strip tightens its allowlist or starts
  // matching the structural envelope differently, this rule's landmark
  // must still survive. The two rules ship enabled together by default.
  it("survives hidden-text-strip on the same page", () => {
    searchUrlHelperRule.apply(document.body);
    hiddenTextStripRule.apply(document.body);

    const landmark = document.querySelector(LANDMARK_SELECTOR);
    expect(landmark).not.toBeNull();
    expect(landmark?.textContent).toContain("/s?k={query}");
  });
});
