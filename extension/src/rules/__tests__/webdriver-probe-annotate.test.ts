/**
 * @jest-environment jsdom
 */
// The rule now reports via the typed `lib/messenger` wrappers instead of raw
// `chrome.runtime.sendMessage`. Mock the module so the suites assert on the
// semantic call (`requestPageWorldInject("webdriver-probe")`,
// `recordDetection({...})`) rather than a wire envelope — and so the real
// `webext-messenger` never loads in jsdom.
jest.mock("../../lib/messenger", () => ({
  recordDetection: jest.fn(),
  requestPageWorldInject: jest.fn(),
}));

import { recordDetection, requestPageWorldInject } from "../../lib/messenger";
import { installProbe } from "../../lib/webdriver-probe-source";
import { hiddenTextStripRule } from "../hidden-text-strip";
import {
  EVENT_NAME,
  webdriverProbeAnnotateRule,
} from "../webdriver-probe-annotate";

const LANDMARK_SELECTOR = 'section[data-abs-rule="webdriver-probe-annotate"]';

function dispatchProbe(): void {
  document.dispatchEvent(new CustomEvent(EVENT_NAME));
}

// The rule drives two distinct flows: `requestPageWorldInject` on every apply
// (background-side executeScript fallback) and `recordDetection` after a
// landmark is stamped (popup detections panel). `clearMocks: true` resets both
// between tests.
const requestInjectMock = requestPageWorldInject as jest.Mock;
const recordDetectionMock = recordDetection as jest.Mock;

beforeEach(() => {
  document.body.replaceChildren();
});

afterEach(() => {
  webdriverProbeAnnotateRule.teardown();
});

describe("webdriverProbeAnnotateRule.apply", () => {
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

describe("webdriverProbeAnnotateRule inject-probe request", () => {
  // The rule's apply asks the background worker to run installProbe on
  // the active frame via chrome.scripting.executeScript. The request is
  // the only thing the rule controls; the actual injection is asserted
  // by inspection at the background-side handler.
  it("asks the background worker to inject the probe on apply", () => {
    webdriverProbeAnnotateRule.apply(document.body);
    expect(requestInjectMock).toHaveBeenCalledTimes(1);
    expect(requestInjectMock).toHaveBeenCalledWith("webdriver-probe");
  });

  // Re-apply after teardown should ask again — the page-world probe is
  // self-deduplicating via `__abs_webdriver_probe_installed`, so a
  // redundant request is a no-op in the page world but still cheaper
  // than tracking injection state across enable/disable cycles here.
  it("re-requests injection on each apply", () => {
    webdriverProbeAnnotateRule.apply(document.body);
    webdriverProbeAnnotateRule.teardown();
    webdriverProbeAnnotateRule.apply(document.body);

    expect(requestInjectMock).toHaveBeenCalledTimes(2);
  });

  // Resilience to a sleeping service worker now lives in the messenger's
  // notifier (fire-and-forget, no rejection), so apply can't throw from the
  // request path.
  it("does not throw when requesting injection", () => {
    expect(() => {
      webdriverProbeAnnotateRule.apply(document.body);
    }).not.toThrow();
  });
});

describe("webdriverProbeAnnotateRule rule-detection emission", () => {
  it("does not emit on apply alone — only on observed reads", () => {
    webdriverProbeAnnotateRule.apply(document.body);
    expect(recordDetectionMock).not.toHaveBeenCalled();
  });

  it("records a detection on the first probe event", () => {
    webdriverProbeAnnotateRule.apply(document.body);
    dispatchProbe();

    expect(recordDetectionMock).toHaveBeenCalledTimes(1);
    expect(recordDetectionMock).toHaveBeenCalledWith({
      kind: "webdriver-probe",
      host: location.hostname,
      url: location.href,
    });
  });

  it("does not re-emit on subsequent probe events for the same document", () => {
    webdriverProbeAnnotateRule.apply(document.body);
    dispatchProbe();
    dispatchProbe();
    dispatchProbe();

    expect(recordDetectionMock).toHaveBeenCalledTimes(1);
  });

  it("re-emits after teardown + re-apply on the same document", () => {
    webdriverProbeAnnotateRule.apply(document.body);
    dispatchProbe();
    expect(recordDetectionMock).toHaveBeenCalledTimes(1);

    webdriverProbeAnnotateRule.teardown();
    webdriverProbeAnnotateRule.apply(document.body);
    dispatchProbe();

    expect(recordDetectionMock).toHaveBeenCalledTimes(2);
  });
});

describe("page-world probe", () => {
  const PROBE_FLAG = "__abs_webdriver_probe_installed";

  beforeEach(() => {
    Reflect.deleteProperty(Navigator.prototype, "webdriver");
    Reflect.deleteProperty(globalThis, PROBE_FLAG);
  });

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
    expect(installProbe.toString()).toContain(`"${EVENT_NAME}"`);
  });
});
