import { HIDDEN_ATTR } from "../../lib/dom-markers";
import { PLACEHOLDER_CLASS } from "../../lib/placeholder";
import { cookieBannerHideRule } from "../cookie-banner-hide";

const RULE_ID = "cookie-banner-hide";

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  cookieBannerHideRule.teardown?.();
});

describe("cookieBannerHideRule", () => {
  it("removes OneTrust banner when fixed-positioned", () => {
    document.body.innerHTML = `
      <main>main content</main>
      <div id="onetrust-banner-sdk" style="position: fixed">consent UI</div>
    `;
    cookieBannerHideRule.apply(document.body);

    const banner = document.querySelector<HTMLElement>("#onetrust-banner-sdk");
    // Node stays in the DOM (so we don't break React's fiber) but is marked
    // hidden in-place via display:none.
    expect(banner?.getAttribute(HIDDEN_ATTR)).toBe(RULE_ID);
    expect(banner?.style.display).toBe("none");
    // Overlays don't get an in-flow placeholder.
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
    expect(document.querySelector("main")).not.toBeNull();
  });

  it("removes Cookiebot dialog", () => {
    document.body.innerHTML = `
      <div id="CybotCookiebotDialog" style="position: fixed">accept?</div>
    `;
    cookieBannerHideRule.apply(document.body);

    const dialog = document.querySelector<HTMLElement>("#CybotCookiebotDialog");
    expect(dialog?.getAttribute(HIDDEN_ATTR)).toBe(RULE_ID);
    expect(dialog?.style.display).toBe("none");
  });

  it("removes a generic [aria-label*=cookie][role=dialog]", () => {
    document.body.innerHTML = `
      <div role="dialog" aria-label="Cookie preferences">…</div>
    `;
    cookieBannerHideRule.apply(document.body);

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute(HIDDEN_ATTR)).toBe(RULE_ID);
    expect((dialog as HTMLElement | null)?.style.display).toBe("none");
  });

  it("removes a Sourcepoint container with prefixed id", () => {
    document.body.innerHTML = `
      <div id="sp_message_container_12345" style="position: fixed">…</div>
    `;
    cookieBannerHideRule.apply(document.body);

    const container = document.querySelector<HTMLElement>(
      '[id^="sp_message_container_"]',
    );
    expect(container?.getAttribute(HIDDEN_ATTR)).toBe(RULE_ID);
    expect(container?.style.display).toBe("none");
  });

  it("leaves an in-flow .cookie-banner container alone (no fixed/sticky)", () => {
    document.body.innerHTML = `
      <article>
        <h1>About Cookies</h1>
        <div class="cookie-banner-explainer">In-flow educational content.</div>
      </article>
    `;
    cookieBannerHideRule.apply(document.body);

    expect(document.querySelector(".cookie-banner-explainer")).not.toBeNull();
  });

  it("does not remove content nested inside an existing placeholder", () => {
    // Defensive: if another rule has wrapped a region in its own placeholder,
    // we shouldn't yank a matching descendant out of it.
    document.body.innerHTML = `
      <div class="${PLACEHOLDER_CLASS}">
        <div id="onetrust-banner-sdk" style="position: fixed">…</div>
      </div>
    `;
    cookieBannerHideRule.apply(document.body);

    expect(document.querySelector("#onetrust-banner-sdk")).not.toBeNull();
  });
});
