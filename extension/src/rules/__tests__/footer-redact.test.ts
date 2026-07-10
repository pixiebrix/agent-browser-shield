/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://www.amazon.com/dp/B0CN6JSMCW"}
 */
import { RULE_ATTR } from "../../lib/dom-markers";
import { PLACEHOLDER_CLASS } from "../../lib/placeholder";
import { footerRedactRule, selectorsFor } from "../footer-redact";

const MUTATION_THROTTLE_MS = 250;

async function flushMutations(): Promise<void> {
  await Promise.resolve();
}

beforeEach(() => {
  document.body.replaceChildren();
});

afterEach(() => {
  footerRedactRule.teardown?.();
});

describe("selectorsFor", () => {
  it("includes semantic + conventional selectors on any URL", () => {
    const selectors = selectorsFor("https://example.com/");
    expect(selectors).toContain("footer");
    expect(selectors).toContain('[role="contentinfo"]');
    expect(selectors).toContain("#footer");
    expect(selectors).toContain(".site-footer");
  });

  it("adds #navFooter on amazon.com", () => {
    expect(selectorsFor("https://www.amazon.com/dp/X")).toContain("#navFooter");
    expect(selectorsFor("https://smile.amazon.com/")).toContain("#navFooter");
  });

  it("adds #navFooter on amazon international storefronts", () => {
    expect(selectorsFor("https://www.amazon.co.uk/dp/X")).toContain(
      "#navFooter",
    );
    expect(selectorsFor("https://www.amazon.de/dp/X")).toContain("#navFooter");
  });

  it("does not add #navFooter on unrelated sites", () => {
    expect(selectorsFor("https://example.com/")).not.toContain("#navFooter");
    expect(selectorsFor("https://notamazon.com/")).not.toContain("#navFooter");
  });
});

describe("footerRedactRule", () => {
  it("replaces a top-level <footer> with a placeholder", () => {
    document.body.innerHTML = `
      <main>main content</main>
      <footer id="f">© 2026 Example Inc.</footer>
    `;
    footerRedactRule.apply(document.body);

    expect(document.querySelector("#f")).toBeNull();
    const placeholder = document.querySelector(`.${PLACEHOLDER_CLASS}`);
    expect(placeholder).not.toBeNull();
    expect(placeholder?.getAttribute(RULE_ATTR)).toBe("footer-redact");
    expect(placeholder?.textContent).toContain("footer hidden");
  });

  it("replaces an element with role=contentinfo", () => {
    document.body.innerHTML = `<div role="contentinfo" id="f">links</div>`;
    footerRedactRule.apply(document.body);

    expect(document.querySelector("#f")).toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).not.toBeNull();
  });

  it("replaces .footer-container (Webflow / no-code marketing-site convention)", () => {
    // Mirrors the pixiebrix.com markup: two sibling .footer-container divs
    // (link grid + copyright block) under a generic wrapper, no semantic
    // <footer> tag or role=contentinfo.
    document.body.innerHTML = `
      <main>page</main>
      <div class="section-in-remove-top">
        <div class="container-1280 footer-container padding-top-20 footer">
          <div class="grid-7-columns footer-grid">links…</div>
        </div>
        <div class="container-1280 footer-container w-container">
          <div class="footer-logo-block">© 2026 Example Inc.</div>
        </div>
      </div>
    `;
    footerRedactRule.apply(document.body);

    expect(document.querySelectorAll(".footer-container")).toHaveLength(0);
    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(2);
    expect(document.querySelector("main")).not.toBeNull();
  });

  it("replaces conventional #footer / .site-footer / #page-footer", () => {
    document.body.innerHTML = `
      <div id="footer">a</div>
      <div class="site-footer">b</div>
      <div id="page-footer">c</div>
    `;
    footerRedactRule.apply(document.body);

    expect(document.querySelector("#footer")).toBeNull();
    expect(document.querySelector(".site-footer")).toBeNull();
    expect(document.querySelector("#page-footer")).toBeNull();
    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(3);
  });

  it("hides Amazon's <div id='navFooter'> on amazon.com", () => {
    // Test file runs with location.href on amazon.com
    document.body.innerHTML = `
      <div id="a-page">
        <main>product</main>
        <div id="navFooter" class="navLeftFooter">links</div>
      </div>
    `;
    footerRedactRule.apply(document.body);

    expect(document.querySelector("#navFooter")).toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).not.toBeNull();
  });

  it("leaves per-article footers visible", () => {
    document.body.innerHTML = `
      <article>
        <h1>Post</h1>
        <footer id="byline">Posted by Alice</footer>
      </article>
    `;
    footerRedactRule.apply(document.body);

    expect(document.querySelector("#byline")).not.toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });

  it("leaves footers nested inside <section>, <aside>, or <nav> visible", () => {
    document.body.innerHTML = `
      <section><footer id="s">section foot</footer></section>
      <aside><footer id="a">aside foot</footer></aside>
      <nav><footer id="n">nav foot</footer></nav>
    `;
    footerRedactRule.apply(document.body);

    expect(document.querySelector("#s")).not.toBeNull();
    expect(document.querySelector("#a")).not.toBeNull();
    expect(document.querySelector("#n")).not.toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });

  it("hides the page footer even when sibling articles have their own footers", () => {
    document.body.innerHTML = `
      <article><footer id="byline">byline</footer></article>
      <footer id="page">page footer</footer>
    `;
    footerRedactRule.apply(document.body);

    expect(document.querySelector("#byline")).not.toBeNull();
    expect(document.querySelector("#page")).toBeNull();
    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(1);
  });

  it("hides only the outermost when contentinfo wraps a <footer>", () => {
    document.body.innerHTML = `
      <div role="contentinfo" id="outer">
        <footer id="inner">links</footer>
      </div>
    `;
    footerRedactRule.apply(document.body);

    expect(document.querySelector("#outer")).toBeNull();
    expect(document.querySelector("#inner")).toBeNull();
    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(1);
  });

  it("restores the original footer on click", () => {
    document.body.innerHTML = `<footer id="f">© 2026</footer>`;
    footerRedactRule.apply(document.body);

    const placeholder = document.querySelector<HTMLElement>(
      `.${PLACEHOLDER_CLASS}`,
    );
    placeholder?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
    expect(document.querySelector("#f")?.textContent).toBe("© 2026");
  });

  it("does not re-process content inside an existing placeholder", () => {
    document.body.innerHTML = `
      <div class="${PLACEHOLDER_CLASS}">
        <footer id="f">© 2026</footer>
      </div>
    `;
    footerRedactRule.apply(document.body);

    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(1);
    expect(document.querySelector("#f")).not.toBeNull();
  });

  // Costco's Next.js footer lives inside a Suspense boundary that bails to
  // client-side rendering — React tears down the SSR subtree (and any
  // placeholder we installed) on hydration and re-mounts the footer fresh.
  // These tests lock down the subtree-watcher rescan.
  describe("lazily-mounted footers", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("hides a <footer> appended after apply()", async () => {
      document.body.innerHTML = `<main>page</main>`;
      footerRedactRule.apply(document.body);

      const footer = document.createElement("footer");
      footer.id = "late-footer";
      footer.textContent = "© 2026";
      document.body.append(footer);

      await flushMutations();
      jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

      expect(document.querySelector("#late-footer")).toBeNull();
      expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).not.toBeNull();
    });

    it("hides a freshly-mounted footer that replaces an earlier placeholder (SSR→CSR bailout)", async () => {
      // First pass: rule replaces the SSR footer.
      document.body.innerHTML = `
        <main>page</main>
        <footer id="ssr-footer">© 2026</footer>
      `;
      footerRedactRule.apply(document.body);
      expect(document.querySelector("#ssr-footer")).toBeNull();

      // React tears down the placeholder subtree and mounts a fresh footer.
      document.body.querySelector(`.${PLACEHOLDER_CLASS}`)?.remove();
      const replacement = document.createElement("footer");
      replacement.id = "csr-footer";
      replacement.textContent = "© 2026";
      document.body.append(replacement);

      await flushMutations();
      jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

      expect(document.querySelector("#csr-footer")).toBeNull();
      expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(
        1,
      );
    });

    it("teardown stops the watcher so later footers are left visible", async () => {
      footerRedactRule.apply(document.body);
      footerRedactRule.teardown?.();

      const footer = document.createElement("footer");
      footer.id = "after-teardown";
      document.body.append(footer);

      await flushMutations();
      jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

      expect(document.querySelector("#after-teardown")).not.toBeNull();
    });
  });
});
