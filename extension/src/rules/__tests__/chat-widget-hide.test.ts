import { HIDDEN_ATTR, PLACEHOLDER_CLASS } from "../../lib/placeholder";
import { chatWidgetHideRule } from "../chat-widget-hide";

const RULE_ID = "chat-widget-hide";

function expectHidden(element: Element | null): void {
  expect(element?.getAttribute(HIDDEN_ATTR)).toBe(RULE_ID);
  expect((element as HTMLElement | null)?.style.display).toBe("none");
}

const MUTATION_THROTTLE_MS = 250;

async function flushMutations(): Promise<void> {
  await Promise.resolve();
}

beforeEach(() => {
  document.body.innerHTML = "";
  jest.useFakeTimers();
});

afterEach(() => {
  chatWidgetHideRule.teardown?.();
  jest.useRealTimers();
});

describe("chatWidgetHideRule", () => {
  it("removes an Intercom container", () => {
    document.body.innerHTML = `
      <main>page</main>
      <div id="intercom-container"><iframe></iframe></div>
    `;
    chatWidgetHideRule.apply(document.body);

    // Node stays in the DOM (so we don't break React's fiber) but is marked
    // hidden in-place via display:none.
    expectHidden(document.getElementById("intercom-container"));
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
    expect(document.querySelector("button#launcher")).not.toBeNull();
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

    expectHidden(document.getElementById("hubspot-messages-iframe-container"));
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

    expect(document.querySelector("iframe")).not.toBeNull();
  });

  // Vendor scripts (HubSpot's conversations-embed.js, Intercom's loader, etc.)
  // insert their widget container after document_idle. The rule relies on a
  // MutationObserver to catch them — these tests lock that down.
  describe("lazily-injected widgets", () => {
    it("removes a HubSpot container appended after apply()", async () => {
      chatWidgetHideRule.apply(document.body);

      // Mirrors what HubSpot's loader does on pixiebrix.com: append the
      // container directly to <body> after the embed script loads.
      const container = document.createElement("div");
      container.id = "hubspot-messages-iframe-container";
      container.className = "widget-align-right";
      container.innerHTML = `
        <iframe id="hubspot-conversations-iframe" title="Chat Widget" src="https://app.hubspot.com/conversations-visitor/..."></iframe>
      `;
      document.body.appendChild(container);

      await flushMutations();
      jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

      expectHidden(
        document.getElementById("hubspot-messages-iframe-container"),
      );
      expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
    });

    it("removes an Intercom iframe injected after apply()", async () => {
      chatWidgetHideRule.apply(document.body);

      const iframe = document.createElement("iframe");
      iframe.name = "intercom-frame-1234";
      document.body.appendChild(iframe);

      await flushMutations();
      jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

      expectHidden(document.querySelector("iframe"));
    });

    it("teardown stops the observer so later additions are ignored", async () => {
      chatWidgetHideRule.apply(document.body);
      chatWidgetHideRule.teardown?.();

      const container = document.createElement("div");
      container.id = "intercom-container";
      document.body.appendChild(container);

      await flushMutations();
      jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

      const stillThere = document.getElementById("intercom-container");
      expect(stillThere).not.toBeNull();
      // And it should not have been touched by the rule.
      expect(stillThere?.getAttribute(HIDDEN_ATTR)).toBeNull();
      expect(stillThere?.style.display).toBe("");
    });
  });
});
