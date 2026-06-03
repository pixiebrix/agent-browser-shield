/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://www.nytimes.com/subscription/all-access"}
 */
import { hiddenTextStripRule } from "../hidden-text-strip";
import { findWarning, roachMotelAnnotateRule } from "../roach-motel-annotate";

const LANDMARK_SELECTOR = 'section[data-abs-rule="roach-motel-annotate"]';

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  roachMotelAnnotateRule.teardown();
  hiddenTextStripRule.teardown();
});

describe("findWarning", () => {
  // One representative URL per covered host plus a distinctive token from
  // that host's notes (or difficulty) that the test asserts is present.
  it.each<[string, string]>([
    [
      "https://www.amazon.com/amazonprime?ie=UTF8",
      "FTC enforcement (2023, settled 2025)",
    ],
    ["https://www.nytimes.com/subscription/all-access", "retention offers"],
    ["https://www.washingtonpost.com/subscribe/", "retention offers"],
    ["https://www.wsj.com/subscribe?mod=hp_FP", "Phone-based cancellation"],
    ["https://www.care.com/join/families", "FTC enforcement (2024)"],
    [
      "https://www.match.com/registration/membersignup",
      "FTC enforcement (2019)",
    ],
    ["https://www.meetcleo.com/signup", "FTC enforcement (2024)"],
    [
      "https://www.lafitness.com/membership/join",
      "in-person visit or certified mail",
    ],
    [
      "https://www.adobe.com/creativecloud/plans.html",
      "DOJ/FTC enforcement (2024)",
    ],
    ["https://www.vonage.com/checkout/cart", "$100M settlement"],
    [
      "https://www.planetfitness.com/clubs/austin-tx/join",
      "in-person visit to the home club",
    ],
    ["https://www.equinox.com/membership", "certified mail"],
  ])("%s — notice includes %s", (url, token) => {
    const warning = findWarning(url);
    expect(warning).not.toBeNull();
    expect(warning?.notes ?? "").toContain(token);
  });

  it("returns null for non-covered hosts", () => {
    expect(findWarning("https://example.org/subscribe")).toBeNull();
    expect(findWarning("https://news.example.com/")).toBeNull();
  });

  it("returns null for non-signup paths on a covered host", () => {
    expect(
      findWarning("https://www.nytimes.com/2024/05/01/world/article.html"),
    ).toBeNull();
    expect(findWarning("https://www.adobe.com/about-adobe/")).toBeNull();
  });

  it("does not match sibling hosts (washingtonpost vs wsj)", () => {
    expect(findWarning("https://www.washingtonpost.com/world/")).toBeNull();
  });
});

describe("roachMotelAnnotateRule.apply (on nytimes.com/subscription/all-access)", () => {
  it("prepends an sr-only landmark with the NYT notice", () => {
    document.body.innerHTML = `<main id="main">page content</main>`;
    roachMotelAnnotateRule.apply(document.body);

    const landmark = document.querySelector(LANDMARK_SELECTOR);
    expect(landmark).not.toBeNull();
    expect(landmark?.getAttribute("role")).toBe("note");
    expect(landmark?.getAttribute("aria-label")).toBe("abs roach-motel notice");
    expect(landmark?.classList.contains("sr-only")).toBe(true);
    expect(landmark?.textContent).toContain("www.nytimes.com");
    expect(landmark?.textContent).toContain("Cancellation difficulty: hard");
    expect(landmark?.textContent).toContain(
      "https://help.nytimes.com/hc/en-us/articles/115014679508",
    );
    expect(landmark?.textContent).toContain("retention offers");
    // Must be the first child of <body> so it lands at the top of the
    // a11y tree.
    expect(document.body.firstElementChild).toBe(landmark);
  });

  it("applies the structural 1×1 + overflow:hidden + position:absolute envelope inline", () => {
    roachMotelAnnotateRule.apply(document.body);

    const landmark = document.querySelector<HTMLElement>(LANDMARK_SELECTOR);
    expect(landmark).not.toBeNull();
    expect(landmark?.style.position).toBe("absolute");
    expect(landmark?.style.width).toBe("1px");
    expect(landmark?.style.height).toBe("1px");
    expect(landmark?.style.overflow).toBe("hidden");
  });

  it("is idempotent — repeated applies do not stack landmarks", () => {
    roachMotelAnnotateRule.apply(document.body);
    roachMotelAnnotateRule.apply(document.body);
    roachMotelAnnotateRule.apply(document.body);

    expect(document.querySelectorAll(LANDMARK_SELECTOR)).toHaveLength(1);
  });

  it("teardown removes the landmark", () => {
    roachMotelAnnotateRule.apply(document.body);
    expect(document.querySelector(LANDMARK_SELECTOR)).not.toBeNull();

    roachMotelAnnotateRule.teardown();
    expect(document.querySelector(LANDMARK_SELECTOR)).toBeNull();
  });

  // Regression: if hidden-text-strip tightens its allowlist, this rule's
  // landmark must still survive. The two rules ship enabled together.
  it("survives hidden-text-strip on the same page", () => {
    roachMotelAnnotateRule.apply(document.body);
    hiddenTextStripRule.apply(document.body);

    const landmark = document.querySelector(LANDMARK_SELECTOR);
    expect(landmark).not.toBeNull();
    expect(landmark?.textContent).toContain("Cancellation difficulty: hard");
  });
});

describe("warning entry shape", () => {
  it("carries null for cancellationUrl when the YAML omits it", () => {
    // care.com YAML has notes but no cancellationUrl — verifies that the
    // codegen emits null (not undefined) so the buildNoteText omit-line
    // branch has a stable check.
    const warning = findWarning("https://www.care.com/join/families");
    expect(warning).not.toBeNull();
    expect(warning?.cancellationUrl).toBeNull();
  });

  it("carries the cancellationUrl string when the YAML provides it", () => {
    const warning = findWarning(
      "https://www.nytimes.com/subscription/all-access",
    );
    expect(warning?.cancellationUrl).toBe(
      "https://help.nytimes.com/hc/en-us/articles/115014679508",
    );
  });
});

describe("JustDeleteMe fallback", () => {
  // Alibaba is in the JDM snapshot (graded "hard") but has no curated
  // YAML entry. It exercises the fallback path end-to-end.
  it("fires on a JDM-only host when path is signup-y", () => {
    const warning = findWarning("https://www.alibaba.com/checkout/cart");
    expect(warning).not.toBeNull();
    expect(warning?.difficulty).toBe("hard");
    expect(warning?.notes ?? "").toContain(
      "Source: JustDeleteMe (justdelete.me)",
    );
  });

  it("does not fire on a JDM host when path is not signup-y", () => {
    expect(findWarning("https://www.alibaba.com/about")).toBeNull();
    expect(findWarning("https://www.alibaba.com/")).toBeNull();
  });

  it("normalizes www. when matching JDM hosts", () => {
    // JDM stores `alibaba.com`; both apex and www. variants should match.
    const withWww = findWarning("https://www.alibaba.com/signup");
    const withoutWww = findWarning("https://alibaba.com/signup");
    expect(withWww).not.toBeNull();
    expect(withoutWww).not.toBeNull();
    expect(withWww?.difficulty).toBe(withoutWww?.difficulty);
  });

  it("curated entries take precedence over JDM on overlapping hosts", () => {
    // amazon.com is in BOTH the curated YAML (with /amazonprime* etc.)
    // and the JDM snapshot. On /amazonprime* the curated entry should win
    // — its notes mention FTC enforcement and have NO JustDeleteMe
    // attribution.
    const warning = findWarning("https://www.amazon.com/amazonprime?ie=UTF8");
    expect(warning).not.toBeNull();
    expect(warning?.notes ?? "").toContain("FTC enforcement");
    expect(warning?.notes ?? "").not.toContain("JustDeleteMe");
  });

  it("returns null when neither curated nor JDM matches", () => {
    expect(findWarning("https://example.org/signup")).toBeNull();
    expect(findWarning("https://unknown-host-xyz.test/subscribe")).toBeNull();
  });

  it("falls back to JDM for amazon.com on a checkout path not covered by curated", () => {
    // /checkout* isn't in amazon.yaml's curated pathnames (which are
    // /amazonprime*, /prime*, /gp/prime*). The JDM entry for amazon.com
    // should kick in via the signup-y heuristic.
    const warning = findWarning("https://www.amazon.com/checkout/p/something");
    expect(warning).not.toBeNull();
    expect(warning?.notes ?? "").toContain("JustDeleteMe");
  });
});
