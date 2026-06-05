import { HIDDEN_ATTR } from "../../lib/dom-markers";
import { PLACEHOLDER_CLASS } from "../../lib/placeholder";
import {
  __resetShadowRootsForTesting,
  installShadowRootHook,
} from "../../lib/shadow-roots";
import { adsHideRule } from "../ads-hide";

const RULE_ID = "ads-hide";

function expectHidden(element: Element | null): void {
  expect(element?.getAttribute(HIDDEN_ATTR)).toBe(RULE_ID);
  expect((element as HTMLElement | null)?.style.display).toBe("none");
}

const MUTATION_THROTTLE_MS = 250;

async function flushMutations(): Promise<void> {
  await Promise.resolve();
}

const EASYLIST_STYLE_ID = "abs-ads-hide-easylist";

beforeEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  jest.useFakeTimers();
});

afterEach(() => {
  adsHideRule.teardown?.();
  jest.useRealTimers();
});

describe("adsHideRule.apply", () => {
  it("removes an AdSense `ins.adsbygoogle` slot", () => {
    document.body.innerHTML = `
      <main>real content</main>
      <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-1"
           data-ad-slot="123"></ins>
    `;
    adsHideRule.apply(document.body);

    expectHidden(document.querySelector("ins.adsbygoogle"));
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
    expect(document.querySelector("main")?.textContent).toBe("real content");
  });

  it("removes a GPT/GAM `div[id^=div-gpt-ad]` slot", () => {
    document.body.innerHTML = `
      <div id="div-gpt-ad-1234567890123-0"><iframe></iframe></div>
    `;
    adsHideRule.apply(document.body);
    expectHidden(document.querySelector('[id^="div-gpt-ad"]'));
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });

  it("removes a Google Search `#tads` sponsored block without touching organic results", () => {
    document.body.innerHTML = `
      <div id="search">
        <div id="tads">
          <div data-text-ad="1">Sponsored result A</div>
          <div data-text-ad="1">Sponsored result B</div>
        </div>
        <div id="rso">
          <div class="g">Organic result</div>
        </div>
      </div>
    `;
    adsHideRule.apply(document.body);

    // #tads is the outer container being hidden — the data-text-ad descendants
    // become invisible by inheritance, but aren't individually marked.
    expectHidden(document.querySelector("#tads"));
    expect(document.querySelector("#rso .g")?.textContent).toBe(
      "Organic result",
    );
  });

  it("removes an Outbrain widget", () => {
    document.body.innerHTML = `
      <div id="outbrain_widget_1" class="OUTBRAIN">recommended for you</div>
    `;
    adsHideRule.apply(document.body);
    expectHidden(document.querySelector(".OUTBRAIN"));
  });

  it("removes a Taboola widget", () => {
    document.body.innerHTML = `
      <div id="taboola-below-article-thumbnails">around the web</div>
    `;
    adsHideRule.apply(document.body);
    expectHidden(document.querySelector('[id^="taboola-"]'));
  });

  it("removes an Amazon `sp-sponsored-result` card", () => {
    document.body.innerHTML = `
      <div data-component-type="sp-sponsored-result">
        <h2>Sponsored Item</h2>
      </div>
      <div data-asin="ORGANIC">organic listing</div>
    `;
    adsHideRule.apply(document.body);

    expectHidden(
      document.querySelector('[data-component-type="sp-sponsored-result"]'),
    );
    expect(document.querySelector('[data-asin="ORGANIC"]')).not.toBeNull();
  });

  it("does not match an article whose class contains 'ad' but no ad markers", () => {
    // Guard against the generic `[class*='ad-']` false-positives we
    // deliberately did not ship. Class names like "header" / "address" /
    // "load-more" should not be touched.
    document.body.innerHTML = `
      <article class="address-form">postal address form</article>
      <button class="load-more">load more</button>
      <div class="header-adapter">site header</div>
    `;
    adsHideRule.apply(document.body);

    expect(document.querySelector(".address-form")).not.toBeNull();
    expect(document.querySelector(".load-more")).not.toBeNull();
    expect(document.querySelector(".header-adapter")).not.toBeNull();
  });
});

describe("adsHideRule EasyList stylesheet", () => {
  it("injects the EasyList stylesheet on apply()", () => {
    expect(document.querySelector(`#${EASYLIST_STYLE_ID}`)).toBeNull();
    adsHideRule.apply(document.body);
    const style = document.querySelector(`#${EASYLIST_STYLE_ID}`);
    expect(style).not.toBeNull();
    expect(style?.tagName).toBe("STYLE");
    // Sanity-check that the stylesheet contains real selector rules,
    // not just a placeholder. Pick a stable EasyList selector that's
    // been in the list for years.
    expect(style?.textContent).toContain("#AC_ad");
    expect(style?.textContent).toContain("display:none!important");
  });

  it("removes the EasyList stylesheet on teardown()", () => {
    adsHideRule.apply(document.body);
    expect(document.querySelector(`#${EASYLIST_STYLE_ID}`)).not.toBeNull();
    adsHideRule.teardown?.();
    expect(document.querySelector(`#${EASYLIST_STYLE_ID}`)).toBeNull();
  });

  it("does not duplicate the stylesheet when apply() runs twice", () => {
    adsHideRule.apply(document.body);
    adsHideRule.apply(document.body);
    expect(document.querySelectorAll(`#${EASYLIST_STYLE_ID}`).length).toBe(1);
  });

  it("does not leak the adopted shadow sheet when the <style> is externally removed and apply re-runs", () => {
    // Regression for unblocked review on #167: the apply() re-entry
    // guard is `injectedStyle?.isConnected`, so if page JS removes
    // our <style> element, the next apply() reinjects it. The shadow
    // adoption handle was overwritten without calling .remove(),
    // leaving the prior CSSStyleSheet adopted in every shadow root.
    __resetShadowRootsForTesting();
    installShadowRootHook();

    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    document.body.append(host);

    adsHideRule.apply(document.body);
    expect(root.adoptedStyleSheets).toHaveLength(1);
    const firstSheet = root.adoptedStyleSheets[0];

    // Page JS rips out the <style> element.
    document.querySelector(`#${EASYLIST_STYLE_ID}`)?.remove();

    // Re-entry — should NOT accumulate a second adopted sheet.
    adsHideRule.apply(document.body);
    expect(root.adoptedStyleSheets).toHaveLength(1);
    expect(root.adoptedStyleSheets[0]).not.toBe(firstSheet);
  });
});

describe("adsHideRule lazy-loaded slots", () => {
  it("removes an ad iframe injected after apply()", async () => {
    adsHideRule.apply(document.body);

    const lateSlot = document.createElement("div");
    lateSlot.id = "div-gpt-ad-late";
    lateSlot.innerHTML = "<iframe></iframe>";
    document.body.append(lateSlot);

    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    expectHidden(document.querySelector("#div-gpt-ad-late"));
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });
});
