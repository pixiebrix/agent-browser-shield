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

  it("annotates Person.author with a cross-RD URL but preserves identity", () => {
    const script = jsonLdScript({
      "@type": "Article",
      author: {
        "@type": "Person",
        name: "Sanjay Gupta",
        url: "https://www.cnn.com/profiles/sanjay-gupta",
      },
    });
    document.head.append(script);
    schemaTrustSanitizeRule.apply(document);
    const parsed = parseScript(script) as {
      author: Record<string, unknown>;
    };
    expect(parsed.author["abs:unverified-authority"]).toBe(true);
    // Identity is preserved (unlike Organization, where we blank). The
    // annotation surfaces the domain-binding gap; the agent still sees
    // the name/url so legitimate guest-author bylines render normally.
    expect(parsed.author.name).toBe("Sanjay Gupta");
    expect(parsed.author.url).toBe("https://www.cnn.com/profiles/sanjay-gupta");
  });

  it("leaves Person.author alone when the URL matches the page RD", () => {
    const script = jsonLdScript({
      "@type": "Article",
      author: {
        "@type": "Person",
        name: "House Reporter",
        url: "https://attacker.example/staff/house-reporter",
      },
    });
    document.head.append(script);
    const before = script.textContent;
    schemaTrustSanitizeRule.apply(document);
    expect(script.textContent).toBe(before);
  });

  it("leaves a standalone (non-author) Person block alone even when cross-RD", () => {
    // A personal homepage typed `@type: Person` isn't borrowing anyone's
    // authority — the cross-RD URL would just be the person's own site.
    const script = jsonLdScript({
      "@type": "Person",
      name: "Jane Doe",
      url: "https://janedoe.example/",
    });
    document.head.append(script);
    const before = script.textContent;
    schemaTrustSanitizeRule.apply(document);
    expect(script.textContent).toBe(before);
  });

  it("annotates Person nested under editor / publisher / reviewedBy", () => {
    const script = jsonLdScript({
      "@type": "Article",
      editor: {
        "@type": "Person",
        name: "Editor X",
        url: "https://elsewhere.example/editor-x",
      },
      reviewedBy: {
        "@type": "Person",
        name: "Reviewer Y",
        url: "https://other.example/reviewer-y",
      },
    });
    document.head.append(script);
    schemaTrustSanitizeRule.apply(document);
    const parsed = parseScript(script) as {
      editor: Record<string, unknown>;
      reviewedBy: Record<string, unknown>;
    };
    expect(parsed.editor["abs:unverified-authority"]).toBe(true);
    expect(parsed.reviewedBy["abs:unverified-authority"]).toBe(true);
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

  it("annotates a microdata Person.author with a cross-RD URL", () => {
    document.body.innerHTML = `
      <article itemscope itemtype="https://schema.org/Article">
        <h1 itemprop="headline">Profile</h1>
        <div itemprop="author" itemscope itemtype="https://schema.org/Person">
          <span itemprop="name">Sanjay Gupta</span>
          <link itemprop="url" href="https://www.cnn.com/profiles/sanjay-gupta">
        </div>
      </article>
    `;
    schemaTrustSanitizeRule.apply(document.body);
    const author = document.querySelector('[itemprop="author"]');
    expect(author).toBeInstanceOf(HTMLElement);
    expect((author as HTMLElement).dataset.absSchemaTrustUnverified).toBe(
      "true",
    );
    // Identity preserved.
    expect(author?.querySelector('[itemprop="name"]')?.textContent).toBe(
      "Sanjay Gupta",
    );
    expect(
      author?.querySelector('[itemprop="url"]')?.getAttribute("href"),
    ).toBe("https://www.cnn.com/profiles/sanjay-gupta");
  });

  it("leaves a standalone microdata Person scope alone", () => {
    // No enclosing authority-context itemprop, so the cross-RD URL is
    // the Person's own site, not a borrowed-authority claim.
    document.body.innerHTML = `
      <div itemscope itemtype="https://schema.org/Person">
        <span itemprop="name">Jane Doe</span>
        <link itemprop="url" href="https://janedoe.example/">
      </div>
    `;
    const before = document.body.innerHTML;
    schemaTrustSanitizeRule.apply(document.body);
    expect(document.body.innerHTML).toBe(before);
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
