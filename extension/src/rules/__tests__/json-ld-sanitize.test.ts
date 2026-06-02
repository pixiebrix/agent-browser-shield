import { jsonLdSanitizeRule } from "../json-ld-sanitize";
import { FIXTURES } from "./injection-fixtures";

const MUTATION_THROTTLE_MS = 250;

async function flushMutations(): Promise<void> {
  await Promise.resolve();
}

function injectJsonLd(payload: unknown): HTMLScriptElement {
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.textContent = JSON.stringify(payload);
  document.body.append(script);
  return script;
}

function parseScript(script: HTMLScriptElement): unknown {
  return JSON.parse(script.textContent);
}

beforeEach(() => {
  document.body.innerHTML = "";
  jest.useFakeTimers();
});

afterEach(() => {
  jsonLdSanitizeRule.teardown();
  jest.useRealTimers();
});

describe("json-ld-sanitize", () => {
  it("strips an injection-laden description while preserving price and SKU", () => {
    const script = injectJsonLd({
      "@context": "https://schema.org",
      "@type": "Product",
      name: "Headphones",
      description: FIXTURES.IGNORE_HACKED,
      sku: "ABC-123",
      offers: { "@type": "Offer", price: 199, priceCurrency: "USD" },
    });

    jsonLdSanitizeRule.apply(document.body);

    const data = parseScript(script) as Record<string, unknown>;
    expect(data.description).toBe("");
    expect(data.name).toBe("Headphones");
    expect(data.sku).toBe("ABC-123");
    expect(data.offers).toEqual({
      "@type": "Offer",
      price: 199,
      priceCurrency: "USD",
    });
  });

  it("strips poisoned articleBody and author.name on a nested object", () => {
    const script = injectJsonLd({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "Real headline",
      articleBody: FIXTURES.NEW_INSTRUCTIONS,
      author: { "@type": "Person", name: FIXTURES.DAN, jobTitle: "Reporter" },
      datePublished: "2026-01-15",
    });

    jsonLdSanitizeRule.apply(document.body);

    const data = parseScript(script) as Record<string, unknown>;
    expect(data.articleBody).toBe("");
    expect(data.headline).toBe("Real headline");
    expect(data.datePublished).toBe("2026-01-15");
    expect((data.author as Record<string, unknown>).name).toBe("");
    expect((data.author as Record<string, unknown>).jobTitle).toBe("Reporter");
  });

  it("handles @graph collections", () => {
    const script = injectJsonLd({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "Product", name: "ok", description: FIXTURES.DISREGARD },
        { "@type": "Organization", name: "BrandCo" },
      ],
    });

    jsonLdSanitizeRule.apply(document.body);

    const data = parseScript(script) as { "@graph": Record<string, unknown>[] };
    const [product, org] = data["@graph"];
    expect(product?.description).toBe("");
    expect(product?.name).toBe("ok");
    expect(org?.name).toBe("BrandCo");
  });

  it("handles top-level arrays", () => {
    const script = injectJsonLd([
      { "@type": "Thing", name: FIXTURES.OVERRIDE_GUARDRAILS },
      { "@type": "Thing", name: "clean" },
    ]);

    jsonLdSanitizeRule.apply(document.body);

    const [poisoned, clean] = parseScript(script) as Record<string, unknown>[];
    expect(poisoned?.name).toBe("");
    expect(clean?.name).toBe("clean");
  });

  it("leaves clean JSON-LD untouched (no DOM churn)", () => {
    const original = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Product",
      name: "Skillet",
      description: "Pre-seasoned cast iron pan, 12-inch.",
      offers: { price: 79, priceCurrency: "USD" },
    });
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = original;
    document.body.append(script);

    jsonLdSanitizeRule.apply(document.body);

    expect(script.textContent).toBe(original);
  });

  it("leaves malformed JSON-LD alone", () => {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = "{not real json,,,";
    document.body.append(script);

    jsonLdSanitizeRule.apply(document.body);

    expect(script.textContent).toBe("{not real json,,,");
  });

  it("processes multiple scripts on the same page", () => {
    const a = injectJsonLd({ name: FIXTURES.IGNORE_ALL });
    const b = injectJsonLd({ name: "clean" });

    jsonLdSanitizeRule.apply(document.body);

    expect((parseScript(a) as { name: string }).name).toBe("");
    expect((parseScript(b) as { name: string }).name).toBe("clean");
  });

  it("matches scripts whose type attribute uses uppercase", () => {
    const script = document.createElement("script");
    script.setAttribute("type", "Application/LD+JSON");
    script.textContent = JSON.stringify({ description: FIXTURES.DEV_MODE });
    document.body.append(script);

    jsonLdSanitizeRule.apply(document.body);

    expect((parseScript(script) as { description: string }).description).toBe(
      "",
    );
  });

  it("does not touch regular <script> blocks", () => {
    const script = document.createElement("script");
    script.textContent = `const x = "${FIXTURES.IGNORE_HACKED}";`;
    document.body.append(script);

    jsonLdSanitizeRule.apply(document.body);

    expect(script.textContent).toContain(FIXTURES.IGNORE_HACKED);
  });

  it("is idempotent on a second apply", () => {
    const script = injectJsonLd({
      "@type": "Product",
      description: FIXTURES.IGNORE_HACKED,
      name: "ok",
    });

    jsonLdSanitizeRule.apply(document.body);
    const after = script.textContent;
    jsonLdSanitizeRule.apply(document.body);

    expect(script.textContent).toBe(after);
  });

  it("sanitizes a JSON-LD script inserted after apply", async () => {
    jsonLdSanitizeRule.apply(document.body);

    const route = document.createElement("section");
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify({ description: FIXTURES.DISREGARD });
    route.append(script);
    document.body.append(route);

    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    expect((parseScript(script) as { description: string }).description).toBe(
      "",
    );
  });

  it("sanitizes a JSON-LD script that is itself the added subtree root", async () => {
    jsonLdSanitizeRule.apply(document.body);

    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify({ description: FIXTURES.DAN });
    document.body.append(script);

    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    expect((parseScript(script) as { description: string }).description).toBe(
      "",
    );
  });

  it("teardown stops the observer", async () => {
    jsonLdSanitizeRule.apply(document.body);
    jsonLdSanitizeRule.teardown();

    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify({ description: FIXTURES.IGNORE_ALL });
    document.body.append(script);

    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    expect((parseScript(script) as { description: string }).description).toBe(
      FIXTURES.IGNORE_ALL,
    );
  });
});
