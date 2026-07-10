/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://news.google.com/articles/abc"}
 */

// Separate file so the jsdom URL — and therefore location.hostname —
// can be set declaratively. The page host is `news.google.com`, which is
// on the rule's syndicator skip list; mismatched publisher claims on
// aggregator pages are expected, not suspicious.

import { schemaTrustSanitizeRule } from "../schema-trust-sanitize";

afterEach(() => {
  schemaTrustSanitizeRule.teardown();
  document.body.replaceChildren();
  document.head.replaceChildren();
});

it("leaves a mismatched publisher claim alone when the page host is a known syndicator", () => {
  const script = document.createElement("script");
  script.setAttribute("type", "application/ld+json");
  script.textContent = JSON.stringify({
    "@type": "Article",
    publisher: {
      "@type": "NewsMediaOrganization",
      name: "The New York Times",
      url: "https://www.nytimes.com",
    },
  });
  document.head.append(script);
  const before = script.textContent;

  schemaTrustSanitizeRule.apply(document);

  expect(script.textContent).toBe(before);
});
