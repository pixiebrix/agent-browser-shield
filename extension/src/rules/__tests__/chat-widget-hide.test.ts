import { PLACEHOLDER_CLASS } from "../../lib/placeholder";
import { chatWidgetHideRule } from "../chat-widget-hide";

const STYLE_ID = "abs-chat-widget-hide";

function expectHidden(element: Element | null): void {
  // CSS-first hides apply via the injected stylesheet, not inline style or
  // an attribute marker — assert via the computed style.
  expect(element).not.toBeNull();
  expect(globalThis.getComputedStyle(element as Element).display).toBe("none");
}

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  chatWidgetHideRule.teardown();
});

describe("chatWidgetHideRule", () => {
  it("removes an Intercom container", () => {
    document.body.innerHTML = `
      <main>page</main>
      <div id="intercom-container"><iframe></iframe></div>
    `;
    chatWidgetHideRule.apply(document.body);

    // Node stays in the DOM (so we don't break React's fiber) but is hidden
    // via display:none in the injected stylesheet.
    expectHidden(document.querySelector("#intercom-container"));
    // Overlays don't get an in-flow placeholder.
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
    expect(document.querySelector("main")).not.toBeNull();
  });

  it("removes Intercom iframes by name prefix", () => {
    document.body.innerHTML = `
      <iframe name="intercom-frame-1234"></iframe>
    `;
    chatWidgetHideRule.apply(document.body);

    expectHidden(document.querySelector("iframe"));
  });

  it("removes the Zendesk launcher iframe but not a generic #launcher button", () => {
    document.body.innerHTML = `
      <iframe id="launcher" title="Messaging window"></iframe>
      <button id="launcher" type="button">Generic launcher button</button>
    `;
    chatWidgetHideRule.apply(document.body);

    expectHidden(document.querySelector("iframe#launcher"));
    const button = document.querySelector("button#launcher");
    expect(button).not.toBeNull();
    expect(globalThis.getComputedStyle(button as Element).display).not.toBe(
      "none",
    );
  });

  it("removes Tawk.to via iframe src match", () => {
    document.body.innerHTML = `
      <iframe src="https://embed.tawk.to/abc/widget"></iframe>
    `;
    chatWidgetHideRule.apply(document.body);

    expectHidden(document.querySelector("iframe"));
  });

  it("removes HubSpot conversations container", () => {
    document.body.innerHTML = `
      <div id="hubspot-messages-iframe-container"><iframe></iframe></div>
    `;
    chatWidgetHideRule.apply(document.body);

    expectHidden(document.querySelector("#hubspot-messages-iframe-container"));
  });

  it("removes Drift widget frame by id prefix", () => {
    document.body.innerHTML = `
      <iframe id="drift-frame-controller"></iframe>
    `;
    chatWidgetHideRule.apply(document.body);

    expectHidden(document.querySelector("iframe"));
  });

  it("leaves unrelated iframes alone", () => {
    document.body.innerHTML = `
      <iframe src="https://example.com/embed" title="video"></iframe>
    `;
    chatWidgetHideRule.apply(document.body);

    const iframe = document.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(globalThis.getComputedStyle(iframe as Element).display).not.toBe(
      "none",
    );
  });

  it("injects the hide stylesheet on apply", () => {
    expect(document.querySelector(`#${STYLE_ID}`)).toBeNull();
    chatWidgetHideRule.apply(document.body);
    const style = document.querySelector(`#${STYLE_ID}`);
    expect(style).not.toBeNull();
    expect(style?.textContent).toContain("display:none!important");
  });

  // Vendor scripts (HubSpot's conversations-embed.js, Intercom's loader, etc.)
  // insert their widget container after document_idle. Because the rule is
  // CSS-first, lazily injected matches are hidden as soon as the browser
  // parses them — no observer or throttle delay involved.
  describe("lazily-injected widgets", () => {
    it("hides a HubSpot container appended after apply()", () => {
      chatWidgetHideRule.apply(document.body);

      const container = document.createElement("div");
      container.id = "hubspot-messages-iframe-container";
      container.className = "widget-align-right";
      container.innerHTML = `
        <iframe id="hubspot-conversations-iframe" title="Chat Widget" src="https://app.hubspot.com/conversations-visitor/..."></iframe>
      `;
      document.body.append(container);

      expectHidden(
        document.querySelector("#hubspot-messages-iframe-container"),
      );
      expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
    });

    it("hides an Intercom iframe injected after apply()", () => {
      chatWidgetHideRule.apply(document.body);

      const iframe = document.createElement("iframe");
      iframe.name = "intercom-frame-1234";
      document.body.append(iframe);

      expectHidden(document.querySelector("iframe"));
    });

    it("teardown removes the stylesheet so later additions stay visible", () => {
      chatWidgetHideRule.apply(document.body);
      chatWidgetHideRule.teardown();

      const container = document.createElement("div");
      container.id = "intercom-container";
      document.body.append(container);

      const stillThere = document.querySelector<HTMLElement>(
        "#intercom-container",
      );
      expect(stillThere).not.toBeNull();
      expect(
        globalThis.getComputedStyle(stillThere as Element).display,
      ).not.toBe("none");
      expect(document.querySelector(`#${STYLE_ID}`)).toBeNull();
    });
  });
});
