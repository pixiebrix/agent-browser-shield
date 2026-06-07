import { skeleton } from "../confusables";

describe("skeleton", () => {
  it("collapses a fully-Cyrillic homograph to its Latin form", () => {
    // а р р ӏ е — every letter Cyrillic, visually mimics "apple".
    expect(skeleton("аррӏе.com")).toBe("apple.com");
  });

  it("collapses a mixed Cyrillic + Latin word to Latin", () => {
    // 'р' Cyrillic; rest Latin.
    expect(skeleton("рaypal.com")).toBe("paypal.com");
  });

  it("collapses Greek-mimicked Latin", () => {
    // ο ρ ε α (Greek) → "orea"
    expect(skeleton("Οmega.example")).toBe("omega.example");
  });

  it("leaves pure Latin text unchanged after lowercasing", () => {
    expect(skeleton("Paypal.COM")).toBe("paypal.com");
  });

  it("preserves non-confusable Cyrillic glyphs in the skeleton", () => {
    // 'п', 'з', 'и', 'д', 'н', 'т', 'ф' are not Latin-confusables, so the
    // skeleton still contains Cyrillic — downstream code should require the
    // skeleton to be pure ASCII before treating it as a homograph.
    const result = skeleton("президент.рф");
    expect(/^[ -~]+$/.test(result)).toBe(false);
  });

  it("returns the original (lowercased) for text with no confusables", () => {
    expect(skeleton("hello world")).toBe("hello world");
  });
});
