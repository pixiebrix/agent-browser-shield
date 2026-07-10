/**
 * @jest-environment jsdom
 */
import { TRUST_BADGE_ANNOTATED_ATTR as ANNOTATED_ATTR } from "../../lib/dom-markers";
import {
  detectTrustBadge,
  trustBadgeAnnotateRule,
} from "../trust-badge-annotate";

const CHIP_CLASS = "abs-trust-badge-annotate";
const MUTATION_THROTTLE_MS = 250;

async function flushMutations(): Promise<void> {
  await Promise.resolve();
}

function makeImg(
  alt: string,
  attributes: Record<string, string> = {},
): HTMLImageElement {
  const img = document.createElement("img");
  img.setAttribute("alt", alt);
  for (const [key, value] of Object.entries(attributes)) {
    img.setAttribute(key, value);
  }
  return img;
}

function makeSvgWithTitle(titleText: string): SVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("role", "img");
  const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
  title.textContent = titleText;
  svg.append(title);
  return svg;
}

beforeEach(() => {
  document.body.replaceChildren();
  jest.useFakeTimers();
});

afterEach(() => {
  trustBadgeAnnotateRule.teardown();
  jest.useRealTimers();
});

describe("detectTrustBadge — named third-party issuers", () => {
  it("matches Norton Secured in <img alt>", () => {
    const img = makeImg("Norton Secured");
    document.body.append(img);
    const match = detectTrustBadge(img, "example.com");
    expect(match?.phrase).toBe("norton secured");
    expect(match?.issuerDomain).toBe("norton.com");
  });

  it("matches BBB Accredited in <img alt>", () => {
    const img = makeImg("BBB Accredited Business");
    document.body.append(img);
    expect(detectTrustBadge(img, "example.com")?.phrase).toBe("bbb accredited");
  });

  it("matches McAfee SECURE case-insensitively", () => {
    const img = makeImg("McAfee SECURE");
    document.body.append(img);
    expect(detectTrustBadge(img, "example.com")?.phrase).toBe("mcafee secure");
  });

  it("matches TrustPilot brand-only mark", () => {
    const img = makeImg("TrustPilot 5-star rating");
    document.body.append(img);
    expect(detectTrustBadge(img, "example.com")?.phrase).toBe("trustpilot");
  });
});

describe("detectTrustBadge — generic phrases", () => {
  it("matches Verified Seller", () => {
    const img = makeImg("Verified Seller");
    document.body.append(img);
    const match = detectTrustBadge(img, "shop.example");
    expect(match?.phrase).toBe("verified seller");
    expect(match?.issuerDomain).toBeNull();
  });

  it("matches Trusted Store", () => {
    const img = makeImg("Trusted Store");
    document.body.append(img);
    expect(detectTrustBadge(img, "shop.example")?.phrase).toBe("trusted store");
  });

  it("matches 100% Secure", () => {
    const img = makeImg("100% Secure Checkout Badge");
    document.body.append(img);
    expect(detectTrustBadge(img, "shop.example")).not.toBeNull();
  });
});

describe("detectTrustBadge — element shape filter", () => {
  it('matches <svg role="img"> with descendant <title>', () => {
    const svg = makeSvgWithTitle("Norton Secured");
    document.body.append(svg);
    expect(detectTrustBadge(svg, "example.com")?.phrase).toBe("norton secured");
  });

  it('matches an element with aria-label and role="img"', () => {
    const div = document.createElement("div");
    div.setAttribute("role", "img");
    div.setAttribute("aria-label", "Verified Seller");
    document.body.append(div);
    expect(detectTrustBadge(div, "shop.example")?.phrase).toBe(
      "verified seller",
    );
  });

  it("does not match a <span> with a trust phrase (wrong shape)", () => {
    // Amazon-style "Verified Purchase" text labels live in text spans, not
    // image elements. Element-shape filter excludes them so reviews-redact
    // owns that surface.
    const span = document.createElement("span");
    span.textContent = "Verified Seller";
    document.body.append(span);
    expect(detectTrustBadge(span, "shop.example")).toBeNull();
  });

  it('does not match a plain <div> without role="img"', () => {
    const div = document.createElement("div");
    div.setAttribute("aria-label", "Verified Seller");
    document.body.append(div);
    expect(detectTrustBadge(div, "shop.example")).toBeNull();
  });
});

describe("detectTrustBadge — false-positive avoidance", () => {
  it("does not match long descriptive alt text containing 'verified'", () => {
    const img = makeImg(
      "Photo of trusted hiking sandals on a verified rock surface in Yosemite National Park, taken at golden hour",
    );
    document.body.append(img);
    expect(detectTrustBadge(img, "example.com")).toBeNull();
  });

  it("does not match a bare 'Verified' alt (single-word generic)", () => {
    // Generic phrases are two-word minimum; "Verified" alone is too noisy
    // (review badges, file checkmarks, etc.).
    const img = makeImg("Verified");
    document.body.append(img);
    expect(detectTrustBadge(img, "example.com")).toBeNull();
  });

  it("does not match a padlock icon with no trust keyword", () => {
    const img = makeImg("Padlock");
    document.body.append(img);
    expect(detectTrustBadge(img, "example.com")).toBeNull();
  });

  it("does not match empty alt", () => {
    const img = makeImg("");
    document.body.append(img);
    expect(detectTrustBadge(img, "example.com")).toBeNull();
  });

  it("does not match alt with 'trust' inside an unrelated word", () => {
    const img = makeImg("Mistrust monitor — antitrust analytics dashboard");
    document.body.append(img);
    expect(detectTrustBadge(img, "example.com")).toBeNull();
  });
});

describe("detectTrustBadge — same-issuer exemption", () => {
  it("does not flag a Norton badge on norton.com", () => {
    const img = makeImg("Norton Secured");
    document.body.append(img);
    expect(detectTrustBadge(img, "www.norton.com")).toBeNull();
  });

  it("does not flag a BBB badge on bbb.org", () => {
    const img = makeImg("BBB Accredited Business");
    document.body.append(img);
    expect(detectTrustBadge(img, "bbb.org")).toBeNull();
  });

  it("still flags a Norton badge on a non-Norton domain", () => {
    const img = makeImg("Norton Secured");
    document.body.append(img);
    expect(detectTrustBadge(img, "shop.example")?.phrase).toBe(
      "norton secured",
    );
  });

  it("flags a generic phrase regardless of page domain", () => {
    const img = makeImg("Verified Seller");
    document.body.append(img);
    expect(detectTrustBadge(img, "amazon.com")?.phrase).toBe("verified seller");
  });
});

describe("trustBadgeAnnotateRule.apply", () => {
  it("appends one chip per matching badge on the initial scan", () => {
    document.body.append(
      makeImg("Norton Secured"),
      makeImg("Verified Seller"),
      makeImg("Photo of the product on a white background"),
    );
    trustBadgeAnnotateRule.apply(document.body);
    expect(document.querySelectorAll(`.${CHIP_CLASS}`)).toHaveLength(2);
  });

  it("does not double-chip on re-scan (idempotent via marker)", () => {
    const img = makeImg("Norton Secured");
    document.body.append(img);
    trustBadgeAnnotateRule.apply(document.body);
    trustBadgeAnnotateRule.apply(document.body);
    expect(document.querySelectorAll(`.${CHIP_CLASS}`)).toHaveLength(1);
    expect(img.hasAttribute(ANNOTATED_ATTR)).toBe(true);
  });

  it("annotates badges added after initial scan via the subtree watcher", async () => {
    trustBadgeAnnotateRule.apply(document.body);
    const wrapper = document.createElement("div");
    wrapper.append(makeImg("BBB Accredited Business"));
    document.body.append(wrapper);

    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    expect(document.querySelectorAll(`.${CHIP_CLASS}`)).toHaveLength(1);
  });
});
