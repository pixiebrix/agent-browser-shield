/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://attacker.example/article"}
 */
import { schemaTrustSanitizeRule } from "../schema-trust-sanitize";

const MUTATION_THROTTLE_MS = 250;

async function flushMutations(): Promise<void> {
  await Promise.resolve();
}

function jsonLdScript(json: unknown): HTMLScriptElement {
  const script = document.createElement("script");
  script.setAttribute("type", "application/ld+json");
  script.textContent = JSON.stringify(json);
  return script;
}

function parseScript(script: HTMLScriptElement): unknown {
  return JSON.parse(script.textContent);
}

beforeEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  jest.useFakeTimers();
});

afterEach(() => {
  schemaTrustSanitizeRule.teardown();
  jest.useRealTimers();
});

describe("JSON-LD path", () => {
  it("blanks publisher name/url/@id on a mismatched registrable domain", () => {
    const script = jsonLdScript({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "Big news",
      datePublished: "2026-01-01",
      publisher: {
        "@type": "NewsMediaOrganization",
        name: "The New York Times",
        url: "https://www.nytimes.com",
        "@id": "https://www.nytimes.com/#publisher",
        logo: { "@type": "ImageObject", url: "https://nytimes.com/logo.png" },
      },
    });
    document.head.append(script);
    schemaTrustSanitizeRule.apply(document);

    const parsed = parseScript(script) as {
      headline: string;
      datePublished: string;
      publisher: Record<string, unknown>;
    };
    expect(parsed.publisher.name).toBe("");
    expect(parsed.publisher.url).toBe("");
    expect(parsed.publisher["@id"]).toBe("");
    // Structural / non-identifying fields stay.
    expect(parsed.headline).toBe("Big news");
    expect(parsed.datePublished).toBe("2026-01-01");
    expect(parsed.publisher["@type"]).toBe("NewsMediaOrganization");
    expect(parsed.publisher.logo).toBeDefined();
  });

  it("leaves matching publisher claims alone", () => {
    const script = jsonLdScript({
      "@type": "Article",
      publisher: {
        "@type": "Organization",
        name: "Attacker Example",
        url: "https://www.attacker.example/about",
      },
    });
    document.head.append(script);
    const before = script.textContent;
    schemaTrustSanitizeRule.apply(document);
    expect(script.textContent).toBe(before);
  });

  it("sanitizes ClaimReview.author when its URL is off-domain", () => {
    const script = jsonLdScript({
      "@type": "ClaimReview",
      claimReviewed: "Vaccines cause X",
      reviewRating: { "@type": "Rating", ratingValue: 1 },
      author: {
        "@type": "Organization",
        name: "Snopes",
        url: "https://www.snopes.com",
      },
    });
    document.body.append(script);
    schemaTrustSanitizeRule.apply(document);
    const parsed = parseScript(script) as {
      author: Record<string, unknown>;
      reviewRating: Record<string, unknown>;
    };
    expect(parsed.author.name).toBe("");
    expect(parsed.author.url).toBe("");
    expect(parsed.reviewRating.ratingValue).toBe(1);
  });

  it("sanitizes a top-level Organization brand-impersonation claim", () => {
    const script = jsonLdScript({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Apple Inc.",
      url: "https://www.apple.com",
    });
    document.head.append(script);
    schemaTrustSanitizeRule.apply(document);
    const parsed = parseScript(script) as Record<string, unknown>;
    expect(parsed.name).toBe("");
    expect(parsed.url).toBe("");
  });

  it("walks @graph collections", () => {
    const script = jsonLdScript({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Article",
          headline: "Hello",
          publisher: {
            "@type": "NewsMediaOrganization",
            name: "Reuters",
            url: "https://www.reuters.com",
          },
        },
        { "@type": "WebPage", name: "Story" },
      ],
    });
    document.head.append(script);
    schemaTrustSanitizeRule.apply(document);
    const parsed = parseScript(script) as {
      "@graph": Array<{
        publisher?: Record<string, unknown>;
        headline?: string;
        name?: string;
      }>;
    };
    expect(parsed["@graph"][0]?.publisher?.name).toBe("");
    expect(parsed["@graph"][0]?.publisher?.url).toBe("");
    expect(parsed["@graph"][0]?.headline).toBe("Hello");
    expect(parsed["@graph"][1]?.name).toBe("Story");
  });

  it("does not touch Person.author (out of V1 scope)", () => {
    const script = jsonLdScript({
      "@type": "Article",
      author: {
        "@type": "Person",
        name: "Jane Doe",
        url: "https://janedoe.example/bio",
      },
    });
    document.head.append(script);
    const before = script.textContent;
    schemaTrustSanitizeRule.apply(document);
    expect(script.textContent).toBe(before);
  });

  it("does nothing when the Organization claim has no URL anchor", () => {
    const script = jsonLdScript({
      "@type": "Article",
      publisher: {
        "@type": "Organization",
        name: "The New York Times",
      },
    });
    document.head.append(script);
    const before = script.textContent;
    schemaTrustSanitizeRule.apply(document);
    expect(script.textContent).toBe(before);
  });

  it("leaves malformed JSON-LD alone", () => {
    const script = document.createElement("script");
    script.setAttribute("type", "application/ld+json");
    script.textContent = "{ not really json";
    document.head.append(script);
    schemaTrustSanitizeRule.apply(document);
    expect(script.textContent).toBe("{ not really json");
  });

  it("sanitizes JSON-LD scripts inserted after apply via the watcher", async () => {
    schemaTrustSanitizeRule.apply(document);
    const script = jsonLdScript({
      "@type": "Article",
      publisher: {
        "@type": "Organization",
        name: "BBC",
        url: "https://www.bbc.co.uk",
      },
    });
    document.body.append(script);
    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);
    const parsed = parseScript(script) as {
      publisher: Record<string, unknown>;
    };
    expect(parsed.publisher.name).toBe("");
  });
});

describe("microdata path", () => {
  it("blanks publisher name/url/itemid on a mismatched item", () => {
    document.body.innerHTML = `
      <article itemscope itemtype="https://schema.org/Article">
        <h1 itemprop="headline">Big news</h1>
        <div itemprop="publisher" itemscope itemtype="https://schema.org/NewsMediaOrganization" itemid="https://www.nytimes.com/#publisher">
          <meta itemprop="name" content="The New York Times">
          <link itemprop="url" href="https://www.nytimes.com">
        </div>
      </article>
    `;
    schemaTrustSanitizeRule.apply(document.body);

    const publisher = document.querySelector('[itemprop="publisher"]');
    expect(publisher?.getAttribute("itemid")).toBe("");
    expect(
      publisher?.querySelector('[itemprop="name"]')?.getAttribute("content"),
    ).toBe("");
    expect(
      publisher?.querySelector('[itemprop="url"]')?.getAttribute("href"),
    ).toBe("");
    expect(document.querySelector('[itemprop="headline"]')?.textContent).toBe(
      "Big news",
    );
  });

  it("leaves microdata items with matching URLs alone", () => {
    document.body.innerHTML = `
      <div itemscope itemtype="https://schema.org/Organization">
        <span itemprop="name">Attacker Example</span>
        <link itemprop="url" href="https://www.attacker.example/">
      </div>
    `;
    const before = document.body.innerHTML;
    schemaTrustSanitizeRule.apply(document.body);
    expect(document.body.innerHTML).toBe(before);
  });

  it("blanks textContent of a span carrying the name", () => {
    document.body.innerHTML = `
      <div itemscope itemtype="https://schema.org/Organization">
        <span itemprop="name">Reuters</span>
        <a itemprop="url" href="https://www.reuters.com">site</a>
      </div>
    `;
    schemaTrustSanitizeRule.apply(document.body);
    expect(document.querySelector('[itemprop="name"]')?.textContent).toBe("");
    expect(
      document.querySelector('[itemprop="url"]')?.getAttribute("href"),
    ).toBe("");
  });

  it("does not descend into nested itemscope when reading the item's own URL", () => {
    // The outer Organization has no scoped `url` itemprop of its own —
    // the nested logo's url belongs to the ImageObject's scope and
    // should not be borrowed as the Organization's claim URL.
    document.body.innerHTML = `
      <div itemscope itemtype="https://schema.org/Organization">
        <span itemprop="name">Reuters</span>
        <div itemprop="logo" itemscope itemtype="https://schema.org/ImageObject">
          <link itemprop="url" href="https://www.reuters.com/logo.png">
        </div>
      </div>
    `;
    const before = document.body.innerHTML;
    schemaTrustSanitizeRule.apply(document.body);
    expect(document.body.innerHTML).toBe(before);
  });
});
