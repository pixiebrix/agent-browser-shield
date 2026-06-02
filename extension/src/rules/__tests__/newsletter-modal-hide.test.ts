import { HIDDEN_ATTR } from "../../lib/dom-markers";
import { PLACEHOLDER_CLASS } from "../../lib/placeholder";
import { newsletterModalHideRule } from "../newsletter-modal-hide";

const RULE_ID = "newsletter-modal-hide";

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  newsletterModalHideRule.teardown?.();
});

describe("newsletterModalHideRule", () => {
  it("removes a fixed dialog with newsletter copy + email input", () => {
    document.body.innerHTML = `
      <main>page</main>
      <div role="dialog" style="position: fixed">
        <h2>Subscribe to our newsletter</h2>
        <form><input type="email" /><button>Sign up</button></form>
      </div>
    `;
    newsletterModalHideRule.apply(document.body);

    const dialog = document.querySelector('[role="dialog"]');
    // Node stays in the DOM (so we don't break React's fiber) but is marked
    // hidden in-place via display:none.
    expect(dialog?.getAttribute(HIDDEN_ATTR)).toBe(RULE_ID);
    expect((dialog as HTMLElement | null)?.style.display).toBe("none");
    // Overlays don't get an in-flow placeholder.
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
    expect(document.querySelector("main")).not.toBeNull();
  });

  it("removes a Privy container that matches the heuristic", () => {
    document.body.innerHTML = `
      <div id="privy-container" style="position: fixed">
        <h2>Don't miss out — join our newsletter</h2>
        <input type="email" />
      </div>
    `;
    newsletterModalHideRule.apply(document.body);

    const container = document.querySelector<HTMLElement>("#privy-container");
    expect(container?.getAttribute(HIDDEN_ATTR)).toBe(RULE_ID);
    expect(container?.style.display).toBe("none");
  });

  it("leaves a login dialog alone (no newsletter copy)", () => {
    document.body.innerHTML = `
      <div role="dialog" style="position: fixed">
        <h2>Log in</h2>
        <form><input type="email" /><input type="password" /></form>
      </div>
    `;
    newsletterModalHideRule.apply(document.body);

    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it("leaves a subscribe dialog without any email input alone", () => {
    document.body.innerHTML = `
      <div role="dialog" style="position: fixed">
        <h2>Subscribe to alerts</h2>
        <button>Enable browser notifications</button>
      </div>
    `;
    newsletterModalHideRule.apply(document.body);

    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it("leaves an in-flow signup form alone (not fixed/sticky)", () => {
    document.body.innerHTML = `
      <section>
        <h2>Subscribe to our newsletter</h2>
        <form><input type="email" /></form>
      </section>
    `;
    newsletterModalHideRule.apply(document.body);

    expect(document.querySelector("section")).not.toBeNull();
  });

  it("does not remove content nested inside an existing placeholder", () => {
    document.body.innerHTML = `
      <div class="${PLACEHOLDER_CLASS}">
        <div role="dialog" style="position: fixed">
          <h2>Subscribe to our newsletter</h2>
          <input type="email" />
        </div>
      </div>
    `;
    newsletterModalHideRule.apply(document.body);

    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });
});
