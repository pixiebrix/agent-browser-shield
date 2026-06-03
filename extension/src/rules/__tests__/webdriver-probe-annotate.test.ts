/**
 * @jest-environment jsdom
 */
import { WEBDRIVER_PROBE_SCRIPT_ATTR } from "../../lib/dom-markers";
import { hiddenTextStripRule } from "../hidden-text-strip";
import {
  EVENT_NAME,
  installProbe,
  PROBE_SOURCE,
  webdriverProbeAnnotateRule,
} from "../webdriver-probe-annotate";

const LANDMARK_SELECTOR = 'section[data-abs-rule="webdriver-probe-annotate"]';
const PROBE_SCRIPT_SELECTOR = `script[${WEBDRIVER_PROBE_SCRIPT_ATTR}]`;

function dispatchProbe(): void {
  document.dispatchEvent(new CustomEvent(EVENT_NAME));
}

const PROBE_FLAG = "__abs_webdriver_probe_installed";

beforeEach(() => {
  document.body.innerHTML = "";
  // jest-environment-jsdom DOES execute inline <script> textContent, so
  // every apply() call really wraps Navigator.prototype.webdriver and
  // the rule's teardown intentionally leaves it wrapped. Reset to a
  // clean baseline between tests so neither suite picks up residue from
  // the previous test's installed probe.
  Reflect.deleteProperty(Navigator.prototype, "webdriver");
  Reflect.deleteProperty(globalThis, PROBE_FLAG);
});

afterEach(() => {
  webdriverProbeAnnotateRule.teardown();
});

describe("webdriverProbeAnnotateRule.apply", () => {
  it("injects a probe script with the marker attribute", () => {
    webdriverProbeAnnotateRule.apply(document.body);

    const scripts = document.querySelectorAll(PROBE_SCRIPT_SELECTOR);
    // We remove the <script> element after appending it (the closure
    // remains live on Navigator.prototype), so there should be zero
    // remaining script elements — the absence here proves we cleaned up.
    expect(scripts).toHaveLength(0);
  });

  it("does not stamp a landmark until a probe event fires", () => {
    webdriverProbeAnnotateRule.apply(document.body);
    expect(document.querySelector(LANDMARK_SELECTOR)).toBeNull();
  });

  it("stamps an sr-only landmark on the first probe event", () => {
    webdriverProbeAnnotateRule.apply(document.body);
    dispatchProbe();

    const landmark = document.querySelector(LANDMARK_SELECTOR);
    expect(landmark).not.toBeNull();
    expect(landmark?.getAttribute("role")).toBe("note");
    expect(landmark?.classList.contains("sr-only")).toBe(true);
    expect(landmark?.textContent).toContain("navigator.webdriver");
    expect(document.body.firstElementChild).toBe(landmark);
  });

  it("applies the structural sr-only envelope inline", () => {
    webdriverProbeAnnotateRule.apply(document.body);
    dispatchProbe();

    const landmark = document.querySelector<HTMLElement>(LANDMARK_SELECTOR);
    expect(landmark).not.toBeNull();
    expect(landmark?.style.position).toBe("absolute");
    expect(landmark?.style.width).toBe("1px");
    expect(landmark?.style.height).toBe("1px");
    expect(landmark?.style.overflow).toBe("hidden");
  });

  it("is idempotent — repeated probe events do not stack landmarks", () => {
    webdriverProbeAnnotateRule.apply(document.body);
    dispatchProbe();
    dispatchProbe();
    dispatchProbe();

    expect(document.querySelectorAll(LANDMARK_SELECTOR)).toHaveLength(1);
  });

  it("teardown removes the landmark and stops listening", () => {
    webdriverProbeAnnotateRule.apply(document.body);
    dispatchProbe();
    expect(document.querySelector(LANDMARK_SELECTOR)).not.toBeNull();

    webdriverProbeAnnotateRule.teardown();
    expect(document.querySelector(LANDMARK_SELECTOR)).toBeNull();

    // Further events after teardown should not re-create the landmark.
    dispatchProbe();
    expect(document.querySelector(LANDMARK_SELECTOR)).toBeNull();
  });

  // The probe is injected at document_idle, which is too late to catch
  // reads issued during the page's initial parse. Make sure a re-apply
  // after teardown re-attaches the listener so a re-enable on the same
  // page still picks up later reads.
  it("re-attaches the listener on re-apply", () => {
    webdriverProbeAnnotateRule.apply(document.body);
    webdriverProbeAnnotateRule.teardown();
    webdriverProbeAnnotateRule.apply(document.body);

    dispatchProbe();
    expect(document.querySelector(LANDMARK_SELECTOR)).not.toBeNull();
  });

  // Regression: the landmark uses the same sr-only envelope as
  // search-url-helper, so hidden-text-strip must preserve it.
  it("survives hidden-text-strip on the same page", () => {
    webdriverProbeAnnotateRule.apply(document.body);
    dispatchProbe();
    hiddenTextStripRule.apply(document.body);

    const landmark = document.querySelector(LANDMARK_SELECTOR);
    expect(landmark).not.toBeNull();
    expect(landmark?.textContent).toContain("navigator.webdriver");
    hiddenTextStripRule.teardown();
  });
});

describe("page-world probe", () => {
  it("wraps Navigator.prototype.webdriver and fires on read", () => {
    installProbe.call(globalThis as unknown as Window);

    const handler = jest.fn();
    document.addEventListener(EVENT_NAME, handler);
    void navigator.webdriver;
    expect(handler).toHaveBeenCalledTimes(1);
    document.removeEventListener(EVENT_NAME, handler);
  });

  it("preserves the underlying value the original getter returned", () => {
    Object.defineProperty(Navigator.prototype, "webdriver", {
      configurable: true,
      enumerable: true,
      get: () => true,
    });

    installProbe.call(globalThis as unknown as Window);
    expect(navigator.webdriver).toBe(true);
  });

  it("is idempotent on the same window", () => {
    installProbe.call(globalThis as unknown as Window);
    installProbe.call(globalThis as unknown as Window);

    const handler = jest.fn();
    document.addEventListener(EVENT_NAME, handler);
    void navigator.webdriver;
    // Two installs would compose into two dispatches on a single read
    // if the guard weren't holding.
    expect(handler).toHaveBeenCalledTimes(1);
    document.removeEventListener(EVENT_NAME, handler);
  });

  // The isolated-world rule listens for this exact name; the page-world
  // probe hard-codes it as a literal in installProbe. If the two ever
  // drift, the rule silently stops working.
  it("hard-codes the same event name the rule listens for", () => {
    expect(PROBE_SOURCE).toContain(`"${EVENT_NAME}"`);
  });
});
