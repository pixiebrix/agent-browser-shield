/**
 * @jest-environment jsdom
 */
import { LINK_SPOOF_ANNOTATED_ATTR as FLAGGED_ATTR } from "../../lib/dom-markers";
import { detectSpoof, linkSpoofAnnotateRule } from "../link-spoof-annotate";

const FLAG_CLASS = "abs-link-spoof-annotate";
const MUTATION_THROTTLE_MS = 250;

async function flushMutations(): Promise<void> {
  await Promise.resolve();
}

function makeAnchor(text: string, href: string): HTMLAnchorElement {
  const anchor = document.createElement("a");
  // setAttribute (not the `.href` setter) so the test can plant raw
  // values like "#" or "" that mimic real-world inert anchors without
  // jsdom resolving them against the page URL.
  anchor.setAttribute("href", href);
  anchor.textContent = text;
  return anchor;
}

beforeEach(() => {
  document.body.innerHTML = "";
  jest.useFakeTimers();
});

afterEach(() => {
  linkSpoofAnnotateRule.teardown();
  jest.useRealTimers();
});

describe("detectSpoof homoglyph check", () => {
  it("flags a Cyrillic letter substituted into a Latin word", () => {
    // Cyrillic 'р' (U+0440) + Latin 'aypal.com'
    const anchor = makeAnchor("рaypal.com", "https://evil.example.com/");
    const triggers = detectSpoof(anchor);
    expect(triggers?.homoglyphWord).not.toBeNull();
  });

  it("flags a Greek letter substituted into a Latin word", () => {
    // Greek 'Ο' (U+039F) + Latin 'mega'
    const anchor = makeAnchor("Οmega.example", "https://evil.example/");
    expect(detectSpoof(anchor)?.homoglyphWord).not.toBeNull();
  });

  it("does not flag pure-Latin text", () => {
    const anchor = makeAnchor("Click here", "https://example.com/");
    expect(detectSpoof(anchor)).toBeNull();
  });

  it("does not flag a pure-Cyrillic word separated from Latin by whitespace", () => {
    // "Проект example" — two distinct words, no within-word mixing.
    const anchor = makeAnchor("Проект example", "https://example.com/");
    expect(detectSpoof(anchor)?.homoglyphWord ?? null).toBeNull();
  });
});

describe("detectSpoof href/text domain mismatch", () => {
  it("flags when visible text shows a different apex than the href", () => {
    const anchor = makeAnchor(
      "Sign in at paypal.com",
      "https://evil.example.com/login",
    );
    const triggers = detectSpoof(anchor);
    expect(triggers?.textDomain).toBe("paypal.com");
    expect(triggers?.hrefHost).toBe("evil.example.com");
  });

  it("does not flag when text and href share an apex", () => {
    const anchor = makeAnchor("paypal.com", "https://www.paypal.com/login");
    expect(detectSpoof(anchor)).toBeNull();
  });

  it("does not flag when href is a subdomain of the text-displayed apex", () => {
    const anchor = makeAnchor("github.com/foo", "https://api.github.com/repos");
    expect(detectSpoof(anchor)).toBeNull();
  });

  it("does not flag when visible text has no domain shape", () => {
    const anchor = makeAnchor("Sign in here", "https://evil.example.com/");
    expect(detectSpoof(anchor)).toBeNull();
  });

  it("ignores non-http hrefs (mailto, tel, fragment)", () => {
    expect(detectSpoof(makeAnchor("paypal.com", "#"))).toBeNull();
    expect(
      detectSpoof(makeAnchor("paypal.com", "mailto:x@evil.example.com")),
    ).toBeNull();
    expect(
      detectSpoof(makeAnchor("paypal.com", "tel:+15555550100")),
    ).toBeNull();
  });
});

describe("linkSpoofAnnotateRule", () => {
  it("appends a visible chip immediately after the spoofed link", () => {
    const anchor = makeAnchor("paypal.com", "https://evil.example.com/login");
    document.body.append(anchor);
    linkSpoofAnnotateRule.apply(document.body);

    expect(anchor.hasAttribute(FLAGGED_ATTR)).toBe(true);
    const chip = document.querySelector(`.${FLAG_CLASS}`);
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toContain("paypal.com");
    expect(chip?.textContent).toContain("evil.example.com");
    expect(chip?.previousElementSibling).toBe(anchor);
  });

  it("does not double-flag on a repeat apply", () => {
    const anchor = makeAnchor("рaypal.com", "https://evil.example.com/");
    document.body.append(anchor);
    linkSpoofAnnotateRule.apply(document.body);
    linkSpoofAnnotateRule.apply(document.body);

    expect(document.querySelectorAll(`.${FLAG_CLASS}`).length).toBe(1);
  });

  it("flags a lazily inserted anchor via the subtree watcher", async () => {
    linkSpoofAnnotateRule.apply(document.body);

    const late = document.createElement("div");
    late.append(makeAnchor("paypal.com", "https://evil.example.com/"));
    document.body.append(late);

    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    expect(document.querySelector(`.${FLAG_CLASS}`)).not.toBeNull();
  });

  it("leaves benign links alone", () => {
    document.body.innerHTML = `
      <a href="/about">About us</a>
      <a href="https://api.github.com/repos">github.com/repos</a>
      <a href="https://www.paypal.com/signin">paypal.com</a>
      <a href="https://example.com/">Click here</a>
    `;
    linkSpoofAnnotateRule.apply(document.body);

    expect(document.querySelectorAll(`.${FLAG_CLASS}`).length).toBe(0);
  });
});
