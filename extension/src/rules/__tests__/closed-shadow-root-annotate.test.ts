/**
 * @jest-environment jsdom
 */
import { closedShadowRootAnnotateRule } from "../closed-shadow-root-annotate";

const LANDMARK_SELECTOR =
  'section[data-abs-rule="closed-shadow-root-annotate"]';

// chrome.runtime.sendMessage is installed as jest.fn() on globalThis by
// jest-webextension-mock.
const sendMessageMock = chrome.runtime.sendMessage as unknown as jest.Mock;

function detectionCalls(): unknown[] {
  return sendMessageMock.mock.calls
    .map(([message]: [unknown]) => message)
    .filter(
      (message) => (message as { type?: string }).type === "rule-detection",
    );
}

// A unique tag name per test avoids the global customElements registry
// colliding across cases (defining the same name twice throws).
let tagCounter = 0;
function nextTagName(): string {
  tagCounter += 1;
  return `abs-test-element-${tagCounter}`;
}

function defineClosedShadowElement(tagName: string): void {
  class ClosedShadowElement extends HTMLElement {
    constructor() {
      super();
      // Constructor attaches a closed shadow root with content. The host's
      // `shadowRoot` property stays null externally — this is what the
      // rule's heuristic is trying to surface.
      const shadow = this.attachShadow({ mode: "closed" });
      shadow.innerHTML = "<span>secret shadow content</span>";
    }
  }
  customElements.define(tagName, ClosedShadowElement);
}

function defineRenderlessElement(tagName: string): void {
  class RenderlessElement extends HTMLElement {
    // No shadow, no children — the "looks unused" case the visibility
    // gate is meant to filter out. jsdom always reports 0×0 so we mock
    // getBoundingClientRect per-test where needed.
  }
  customElements.define(tagName, RenderlessElement);
}

function mockNonZeroRect(element: Element): void {
  element.getBoundingClientRect = (): DOMRect =>
    ({
      width: 100,
      height: 50,
      top: 0,
      left: 0,
      right: 100,
      bottom: 50,
    }) as DOMRect;
}

function mockZeroRect(element: Element): void {
  element.getBoundingClientRect = (): DOMRect =>
    ({ width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }) as DOMRect;
}

beforeEach(() => {
  document.body.innerHTML = "";
  sendMessageMock.mockReset();
  sendMessageMock.mockResolvedValue(undefined);
});

afterEach(() => {
  closedShadowRootAnnotateRule.teardown();
});

describe("closedShadowRootAnnotateRule.apply", () => {
  it("stamps an sr-only landmark when a custom element with a closed shadow is present", () => {
    const tag = nextTagName();
    defineClosedShadowElement(tag);
    const host = document.createElement(tag);
    document.body.append(host);

    closedShadowRootAnnotateRule.apply(document.body);

    const landmark = document.querySelector(LANDMARK_SELECTOR);
    expect(landmark).not.toBeNull();
    expect(landmark?.getAttribute("role")).toBe("note");
    expect(landmark?.classList.contains("sr-only")).toBe(true);
    expect(landmark?.textContent).toContain("closed shadow root");
  });

  it("applies the structural sr-only envelope inline", () => {
    const tag = nextTagName();
    defineClosedShadowElement(tag);
    document.body.append(document.createElement(tag));

    closedShadowRootAnnotateRule.apply(document.body);

    const landmark = document.querySelector<HTMLElement>(LANDMARK_SELECTOR);
    expect(landmark).not.toBeNull();
    expect(landmark?.style.position).toBe("absolute");
    expect(landmark?.style.width).toBe("1px");
    expect(landmark?.style.height).toBe("1px");
    expect(landmark?.style.overflow).toBe("hidden");
  });

  it("is idempotent — multiple hosts do not stack landmarks", () => {
    const tag = nextTagName();
    defineClosedShadowElement(tag);
    document.body.append(document.createElement(tag));
    document.body.append(document.createElement(tag));
    document.body.append(document.createElement(tag));

    closedShadowRootAnnotateRule.apply(document.body);

    expect(document.querySelectorAll(LANDMARK_SELECTOR)).toHaveLength(1);
  });

  it("does not stamp a landmark when no custom elements are present", () => {
    document.body.innerHTML = "<div><p>regular content</p></div>";

    closedShadowRootAnnotateRule.apply(document.body);

    expect(document.querySelector(LANDMARK_SELECTOR)).toBeNull();
  });

  it("does not stamp when the custom element has an open shadow root", () => {
    const tag = nextTagName();
    class OpenShadowElement extends HTMLElement {
      constructor() {
        super();
        this.attachShadow({ mode: "open" });
      }
    }
    customElements.define(tag, OpenShadowElement);
    document.body.append(document.createElement(tag));

    closedShadowRootAnnotateRule.apply(document.body);

    expect(document.querySelector(LANDMARK_SELECTOR)).toBeNull();
  });

  it("does not stamp when the custom element has light-DOM children", () => {
    const tag = nextTagName();
    defineClosedShadowElement(tag);
    const host = document.createElement(tag);
    host.append(document.createElement("span"));
    document.body.append(host);

    closedShadowRootAnnotateRule.apply(document.body);

    // Light children mean the agent can see *some* of the content; the
    // heuristic is intentionally conservative about flagging in that case.
    expect(document.querySelector(LANDMARK_SELECTOR)).toBeNull();
  });

  it("does not stamp when the custom element has non-whitespace text content", () => {
    const tag = nextTagName();
    defineClosedShadowElement(tag);
    const host = document.createElement(tag);
    host.append(document.createTextNode("visible label"));
    document.body.append(host);

    closedShadowRootAnnotateRule.apply(document.body);

    expect(document.querySelector(LANDMARK_SELECTOR)).toBeNull();
  });

  it("ignores hyphenated tags that are not upgraded custom elements", () => {
    // Hyphenated tag with no matching customElements.define — the constructor
    // never ran, so it can't have called attachShadow.
    const host = document.createElement("never-defined-element");
    document.body.append(host);

    closedShadowRootAnnotateRule.apply(document.body);

    expect(document.querySelector(LANDMARK_SELECTOR)).toBeNull();
  });

  it("ignores built-in elements with UA shadows (no hyphen in tag name)", () => {
    // `<input type=range>` and `<details>` have UA shadow roots but their
    // tag names don't contain hyphens, so the heuristic filters them out
    // before any other check.
    document.body.innerHTML = `
      <input type="range" />
      <details><summary>collapsed</summary><p>body</p></details>
      <video></video>
    `;

    closedShadowRootAnnotateRule.apply(document.body);

    expect(document.querySelector(LANDMARK_SELECTOR)).toBeNull();
  });

  it("does not stamp when the host has zero size in a real browser", () => {
    // Distinct from jsdom's default 0×0 — here we explicitly mock the rect
    // to assert the "rendered" gate filters defined-but-invisible elements.
    const tag = nextTagName();
    defineRenderlessElement(tag);
    const host = document.createElement(tag);
    document.body.append(host);
    // In jsdom, rect is 0×0 by default — the rule bypasses the gate there.
    // Override to non-zero ZERO would still match; we instead simulate a
    // browser-like 0-but-not-jsdom by mocking width=0/height=1 explicitly.
    host.getBoundingClientRect = (): DOMRect =>
      ({
        width: 0,
        height: 1,
        top: 0,
        left: 0,
        right: 0,
        bottom: 1,
      }) as DOMRect;

    closedShadowRootAnnotateRule.apply(document.body);

    expect(document.querySelector(LANDMARK_SELECTOR)).toBeNull();
  });

  it("stamps when getBoundingClientRect reports a non-zero box (real browser path)", () => {
    const tag = nextTagName();
    defineClosedShadowElement(tag);
    const host = document.createElement(tag);
    document.body.append(host);
    mockNonZeroRect(host);

    closedShadowRootAnnotateRule.apply(document.body);

    expect(document.querySelector(LANDMARK_SELECTOR)).not.toBeNull();
  });

  it("bypasses the visibility gate when rect is exactly 0×0 (jsdom)", () => {
    const tag = nextTagName();
    defineClosedShadowElement(tag);
    const host = document.createElement(tag);
    document.body.append(host);
    mockZeroRect(host);

    closedShadowRootAnnotateRule.apply(document.body);

    // Same convention as newsletter-modal-hide: a 0×0 rect is treated as
    // "we don't know" rather than "definitely hidden," so the rule does
    // not refuse to stamp in jsdom.
    expect(document.querySelector(LANDMARK_SELECTOR)).not.toBeNull();
  });

  it("teardown removes the landmark", () => {
    const tag = nextTagName();
    defineClosedShadowElement(tag);
    document.body.append(document.createElement(tag));

    closedShadowRootAnnotateRule.apply(document.body);
    expect(document.querySelector(LANDMARK_SELECTOR)).not.toBeNull();

    closedShadowRootAnnotateRule.teardown();
    expect(document.querySelector(LANDMARK_SELECTOR)).toBeNull();
  });

  it("skips the descendant walk once the landmark exists", () => {
    // Once stamped, scan() should short-circuit before walking descendants
    // — there's no second landmark to add and the rect/qsa work is wasted
    // on every subsequent mutation tick for the page's lifetime.
    const tag = nextTagName();
    defineClosedShadowElement(tag);
    document.body.append(document.createElement(tag));
    closedShadowRootAnnotateRule.apply(document.body);
    expect(document.querySelector(LANDMARK_SELECTOR)).not.toBeNull();

    const qsaSpy = jest.spyOn(document.body, "querySelectorAll");
    // Re-applying without teardown is the cheapest way to drive scan()
    // again on the already-stamped document.
    closedShadowRootAnnotateRule.apply(document.body);
    expect(qsaSpy).not.toHaveBeenCalled();
    qsaSpy.mockRestore();
  });

  it("re-apply after teardown re-stamps on the same document", () => {
    const tag = nextTagName();
    defineClosedShadowElement(tag);
    document.body.append(document.createElement(tag));

    closedShadowRootAnnotateRule.apply(document.body);
    closedShadowRootAnnotateRule.teardown();
    closedShadowRootAnnotateRule.apply(document.body);

    expect(document.querySelector(LANDMARK_SELECTOR)).not.toBeNull();
  });
});

describe("closedShadowRootAnnotateRule main-world probe integration", () => {
  it("stamps the landmark when the probe dispatches abs:closed-shadow-attached with no heuristic match", () => {
    // No custom-element hosts in the page — the heuristic would never
    // trip — but the page-world probe fires the event directly. This
    // covers the case the heuristic would miss: a closed shadow on a
    // non-custom-element (e.g. a `<div>`), which the future-work probe
    // was specifically introduced to catch.
    document.body.innerHTML = "<div><p>plain content</p></div>";

    closedShadowRootAnnotateRule.apply(document.body);
    expect(document.querySelector(LANDMARK_SELECTOR)).toBeNull();

    document.dispatchEvent(new CustomEvent("abs:closed-shadow-attached"));

    expect(document.querySelector(LANDMARK_SELECTOR)).not.toBeNull();
  });

  it("requests probe injection on apply (background fallback for the active tab)", () => {
    closedShadowRootAnnotateRule.apply(document.body);

    const requested = sendMessageMock.mock.calls.some(
      ([message]: [unknown]) =>
        (message as { type?: string }).type === "inject-shadow-root-probe",
    );
    expect(requested).toBe(true);
  });

  it("does not re-stamp on subsequent probe events (per-document dedupe)", () => {
    closedShadowRootAnnotateRule.apply(document.body);

    document.dispatchEvent(new CustomEvent("abs:closed-shadow-attached"));
    document.dispatchEvent(new CustomEvent("abs:closed-shadow-attached"));
    document.dispatchEvent(new CustomEvent("abs:closed-shadow-attached"));

    expect(document.querySelectorAll(LANDMARK_SELECTOR)).toHaveLength(1);
  });

  it("stops listening for probe events after teardown", () => {
    closedShadowRootAnnotateRule.apply(document.body);
    closedShadowRootAnnotateRule.teardown();

    document.dispatchEvent(new CustomEvent("abs:closed-shadow-attached"));

    expect(document.querySelector(LANDMARK_SELECTOR)).toBeNull();
  });

  it("emits exactly one rule-detection when the probe is the trigger", () => {
    document.body.innerHTML = "<div><p>plain</p></div>";
    closedShadowRootAnnotateRule.apply(document.body);
    sendMessageMock.mockClear();

    document.dispatchEvent(new CustomEvent("abs:closed-shadow-attached"));

    expect(detectionCalls()).toHaveLength(1);
    expect(detectionCalls()[0]).toEqual({
      type: "rule-detection",
      payload: {
        kind: "closed-shadow-root",
        host: globalThis.location.hostname,
        url: globalThis.location.href,
      },
    });
  });
});

describe("closedShadowRootAnnotateRule rule-detection emission", () => {
  it("does not emit on apply when no hosts match", () => {
    document.body.innerHTML = "<p>plain content</p>";
    closedShadowRootAnnotateRule.apply(document.body);
    expect(detectionCalls()).toHaveLength(0);
  });

  it("emits exactly one detection on first match", () => {
    const tag = nextTagName();
    defineClosedShadowElement(tag);
    document.body.append(document.createElement(tag));
    document.body.append(document.createElement(tag));

    closedShadowRootAnnotateRule.apply(document.body);

    expect(detectionCalls()).toHaveLength(1);
    expect(detectionCalls()[0]).toEqual({
      type: "rule-detection",
      payload: {
        kind: "closed-shadow-root",
        host: globalThis.location.hostname,
        url: globalThis.location.href,
      },
    });
  });

  it("does not re-emit on subsequent apply calls (landmark short-circuit)", () => {
    const tag = nextTagName();
    defineClosedShadowElement(tag);
    document.body.append(document.createElement(tag));

    closedShadowRootAnnotateRule.apply(document.body);
    closedShadowRootAnnotateRule.apply(document.body);

    expect(detectionCalls()).toHaveLength(1);
  });

  it("swallows sendMessage rejections", () => {
    sendMessageMock.mockRejectedValueOnce(new Error("no receiver"));
    const tag = nextTagName();
    defineClosedShadowElement(tag);
    document.body.append(document.createElement(tag));

    expect(() => {
      closedShadowRootAnnotateRule.apply(document.body);
    }).not.toThrow();
  });
});
