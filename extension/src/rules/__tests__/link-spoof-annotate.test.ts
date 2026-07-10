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
  document.body.replaceChildren();
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

describe("detectSpoof single-script homograph (#203 item 16)", () => {
  it("flags a fully-Cyrillic domain that skeletons to a Latin brand", () => {
    // Every letter Cyrillic: а р р ӏ е — visually "apple.com".
    const anchor = makeAnchor("аррӏе.com", "https://attacker.example/");
    const triggers = detectSpoof(anchor);
    expect(triggers).not.toBeNull();
    expect(triggers?.homoglyphWord).toBe("аррӏе.com");
    expect(triggers?.homoglyphSkeleton).toBe("apple.com");
  });

  it("flags a fully-Cyrillic homograph even when href is the matching IDN domain", () => {
    // Attacker bought the IDN form; text and href agree on registrable
    // identity, but the visible domain still mimics a Latin brand.
    const anchor = makeAnchor("аррӏе.com", "https://xn--80ak6aa92e.com/");
    const triggers = detectSpoof(anchor);
    expect(triggers?.homoglyphWord).toBe("аррӏе.com");
    expect(triggers?.homoglyphSkeleton).toBe("apple.com");
    // No text/href mismatch — RDs are identical after punycode.
    expect(triggers?.textDomain).toBeNull();
  });

  it("does not flag a legitimate IDN whose skeleton is not pure Latin", () => {
    // 'п', 'з', 'и', 'д', 'н', 'т', 'ф' have no Latin confusable; the
    // skeleton retains Cyrillic and so isn't read as a Latin mimic.
    const anchor = makeAnchor(
      "президент.рф",
      "https://xn--d1abbgf6aiiy.xn--p1ai/",
    );
    expect(detectSpoof(anchor)).toBeNull();
  });

  it("does not flag pure-Latin domains via the skeleton check", () => {
    const anchor = makeAnchor("apple.com", "https://apple.com/");
    expect(detectSpoof(anchor)).toBeNull();
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

  // The previous last-two-labels heuristic collapsed any host to its
  // tail bigram, so `foo.co.uk` and `bar.co.uk` both flattened to
  // `co.uk` and a real cross-site mismatch was missed. The PSL-backed
  // helper distinguishes them.
  it("flags mismatched sites that share a multi-part ICANN suffix", () => {
    const anchor = makeAnchor(
      "Sign in at bank.co.uk",
      "https://evil.co.uk/login",
    );
    const triggers = detectSpoof(anchor);
    expect(triggers?.textDomain).toBe("bank.co.uk");
    expect(triggers?.hrefHost).toBe("evil.co.uk");
  });

  it("does not flag subdomains under a multi-part ICANN suffix", () => {
    const anchor = makeAnchor("bank.co.uk", "https://login.bank.co.uk/account");
    expect(detectSpoof(anchor)).toBeNull();
  });

  // The reverse case: PSL Private entries like `github.io` should not be
  // treated as registrable suffixes for trust purposes, so two pages on
  // `*.github.io` collapse to the same identity and the visible-text
  // claim isn't surfaced as a mismatch.
  it("does not flag mismatched github.io subdomains as cross-site", () => {
    const anchor = makeAnchor(
      "owner.github.io",
      "https://other.github.io/path",
    );
    expect(detectSpoof(anchor)).toBeNull();
  });

  it("flags an IDN visible-text domain pointing at an unrelated ASCII host (#203 item 16)", () => {
    // Same homograph attack as the skeleton check, but the attacker
    // pointed the link at a plain ASCII domain — the text/href
    // comparison surfaces the mismatch independently.
    const anchor = makeAnchor("аррӏе.com", "https://evil.example.com/");
    const triggers = detectSpoof(anchor);
    expect(triggers?.textDomain).toBe("аррӏе.com");
    expect(triggers?.hrefHost).toBe("evil.example.com");
  });

  it("does not flag a legitimate IDN link whose href is the punycode form", () => {
    const anchor = makeAnchor(
      "президент.рф",
      "https://xn--d1abbgf6aiiy.xn--p1ai/",
    );
    expect(detectSpoof(anchor)).toBeNull();
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

  it("chip surfaces the Latin mimic for a single-script homograph (#203 item 16)", () => {
    const anchor = makeAnchor("аррӏе.com", "https://xn--80ak6aa92e.com/");
    document.body.append(anchor);
    linkSpoofAnnotateRule.apply(document.body);

    const chip = document.querySelector(`.${FLAG_CLASS}`);
    expect(chip?.textContent).toContain("аррӏе.com");
    expect(chip?.textContent).toContain("apple.com");
  });
});
