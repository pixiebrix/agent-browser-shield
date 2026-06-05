// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// `nanoid` and `abort-utils` are pure-ESM. ts-jest with `useESM: false` can't
// transform them, so mock at the boundary before importing the rule (which
// transitively pulls them in via automation-element-reference). The rule's
// async lifecycle relies on `ReusableAbortController.abortAndReset()`, which
// the catalog test's minimal stub doesn't model — provide a working version.
jest.mock("nanoid", () => {
  let counter = 0;
  return {
    nanoid: () => `ref-${++counter}`,
  };
});
jest.mock("abort-utils", () => ({
  ReusableAbortController: class {
    private controller = new AbortController();
    get signal(): AbortSignal {
      return this.controller.signal;
    }
    abort(): void {
      this.controller.abort();
    }
    abortAndReset(): void {
      this.controller.abort();
      this.controller = new AbortController();
    }
  },
  onAbort: (): (() => void) => () => {
    // noop
  },
}));
// LLM client wraps a chrome.runtime port. Mock the function so tests control
// classifier output directly without touching ports or fetch.
jest.mock("../../lib/llm-client");
// `createApiKeyAvailability` is only consumed by the engine when checking if
// the rule should run — the rule's apply/teardown don't invoke it. But the
// real module re-imports the rules barrel (for RuleId), which makes loading
// this single-rule test file mid-chain trip on a circular reference. Stub it.
jest.mock("../../lib/availability", () => ({
  createApiKeyAvailability: () => ({
    get() {
      return Promise.resolve({ available: true });
    },
    subscribe() {
      return () => {
        // noop
      };
    },
  }),
}));

import { getReferenceForElement } from "../../lib/automation-element-reference";
import { classifyIrrelevantSections } from "../../lib/llm-client";
import { PLACEHOLDER_CLASS } from "../../lib/placeholder";
import { irrelevantSectionsRedactRule } from "../irrelevant-sections-redact";

const RULE_ID = "irrelevant-sections-redact";
const SETTLE_QUIET_MS = 500;
const SCROLL_DEBOUNCE_MS = 600;

const mockClassify = classifyIrrelevantSections as jest.MockedFunction<
  typeof classifyIrrelevantSections
>;

function getRulePlaceholders(): HTMLElement[] {
  return [
    ...document.querySelectorAll<HTMLElement>(
      `.${PLACEHOLDER_CLASS}[data-abs-rule="${RULE_ID}"]`,
    ),
  ];
}

// Throwing variant of querySelector so tests can opt out of non-null
// assertions on fixture lookups.
function pick(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) {
    throw new Error(`pick("${selector}") matched no element`);
  }
  return element;
}

interface DeferredClassifyResponse {
  promise: Promise<{ irrelevant: { ref: string; summary: string }[] }>;
  resolve: (value: { irrelevant: { ref: string; summary: string }[] }) => void;
}

function createDeferredClassifyResponse(): DeferredClassifyResponse {
  // The Promise executor runs synchronously, but the type system doesn't
  // know that — initialize with a noop so `resolveFunction` is always defined.
  let resolveFunction: DeferredClassifyResponse["resolve"] = () => {
    // overwritten by the executor below
  };
  const promise = new Promise<{
    irrelevant: { ref: string; summary: string }[];
  }>((resolve) => {
    resolveFunction = resolve;
  });
  return { promise, resolve: resolveFunction };
}

// jsdom's getBoundingClientRect returns zeros. The rule's "taller than 70% of
// viewport" check needs a controllable height; this stub lets each test
// override it for a specific element.
function stubBoundingRect(element: Element, height: number, width = 100): void {
  element.getBoundingClientRect = () => ({
    height,
    width,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
}

// Drive both the timer queue and the microtask queue forward together. Several
// .then chains stack between settle → classify → response → DOM mutation; one
// `await Promise.resolve()` isn't enough.
async function drainAsync(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    jest.advanceTimersByTime(0);
    await Promise.resolve();
  }
}

async function applyAndSettle(): Promise<void> {
  irrelevantSectionsRedactRule.apply(document.body);
  // Let waitForSettle install its observer and timers before we advance.
  await Promise.resolve();
  jest.advanceTimersByTime(SETTLE_QUIET_MS);
  await drainAsync();
}

// jsdom polyfills (checkVisibility, offsetHeight/Width) come from
// src/__test-mocks__/jsdom-extras.ts via the global setupFiles hook.

beforeEach(() => {
  document.body.innerHTML = "";
  jest.useFakeTimers();
  mockClassify.mockReset();
});

afterEach(() => {
  irrelevantSectionsRedactRule.teardown();
  jest.useRealTimers();
});

describe("irrelevantSectionsRedactRule", () => {
  it("replaces an element whose ref the classifier flags", async () => {
    document.body.innerHTML = `
      <main><p>main</p></main>
      <aside id="rail">
        <h3>Related products</h3>
        <ul><li>A</li><li>B</li></ul>
      </aside>
    `;
    const ref = getReferenceForElement(pick("#rail"));
    mockClassify.mockResolvedValueOnce({
      irrelevant: [{ ref, summary: "Related products rail" }],
    });

    await applyAndSettle();

    expect(document.querySelector("#rail")).toBeNull();
    const [placeholder] = getRulePlaceholders();
    expect(placeholder).toBeDefined();
    // Summary surfaces in the reveal label so the user knows what's hidden.
    expect(placeholder?.textContent).toContain("Related products rail");
    expect(placeholder?.style.maxHeight).toBe("200px");
    expect(placeholder?.style.overflow).toBe("hidden");
  });

  it("uses a generic label when the classifier returns no summary", async () => {
    document.body.innerHTML = `<aside id="rail"><h3>x</h3><p>y</p></aside>`;
    const ref = getReferenceForElement(pick("#rail"));
    mockClassify.mockResolvedValueOnce({
      irrelevant: [{ ref, summary: "" }],
    });

    await applyAndSettle();

    const [placeholder] = getRulePlaceholders();
    expect(placeholder?.textContent).toContain("irrelevant section hidden");
  });

  describe("hideability protections", () => {
    it.each([
      [
        "<article> wrapper",
        "<article><section id='t'><h3>x</h3></section></article>",
      ],
      [
        "<header> wrapper",
        "<header><section id='t'><h3>x</h3></section></header>",
      ],
      [
        '[role="banner"] wrapper',
        '<div role="banner"><section id="t"><h3>x</h3></section></div>',
      ],
    ])("skips an element inside an %s", async (_label, html) => {
      document.body.innerHTML = html;
      const ref = getReferenceForElement(pick("#t"));
      mockClassify.mockResolvedValueOnce({
        irrelevant: [{ ref, summary: "rail" }],
      });

      await applyAndSettle();

      expect(document.querySelector("#t")).not.toBeNull();
      expect(getRulePlaceholders()).toHaveLength(0);
    });

    it.each([
      ["fixed", "fixed"],
      ["sticky", "sticky"],
    ])("skips a position: %s element", async (_label, position) => {
      document.body.innerHTML = `<section id="t" style="position: ${position}"><h3>x</h3><p>y</p></section>`;
      const ref = getReferenceForElement(pick("#t"));
      mockClassify.mockResolvedValueOnce({
        irrelevant: [{ ref, summary: "rail" }],
      });

      await applyAndSettle();

      expect(document.querySelector("#t")).not.toBeNull();
      expect(getRulePlaceholders()).toHaveLength(0);
    });

    it("skips an element taller than 70% of the viewport", async () => {
      document.body.innerHTML = `<section id="t"><h3>x</h3><p>y</p></section>`;
      const target = pick("#t");
      // jsdom default viewport is 768; >70% is >537.6.
      stubBoundingRect(target, 600);
      const ref = getReferenceForElement(target);
      mockClassify.mockResolvedValueOnce({
        irrelevant: [{ ref, summary: "rail" }],
      });

      await applyAndSettle();

      expect(document.querySelector("#t")).not.toBeNull();
      expect(getRulePlaceholders()).toHaveLength(0);
    });
  });

  it("dedupes repeated refs in a single response", async () => {
    document.body.innerHTML = `<aside id="t"><h3>x</h3><p>y</p></aside>`;
    const ref = getReferenceForElement(pick("#t"));
    mockClassify.mockResolvedValueOnce({
      irrelevant: [
        { ref, summary: "first" },
        { ref, summary: "duplicate" },
      ],
    });

    await applyAndSettle();

    expect(getRulePlaceholders()).toHaveLength(1);
  });

  it("dedupes ancestor + descendant to outermost only", async () => {
    document.body.innerHTML = `
      <section id="outer">
        <h3>Outer</h3>
        <section id="inner"><h3>Inner</h3><p>x</p></section>
      </section>
    `;
    const outer = pick("#outer");
    const inner = pick("#inner");
    mockClassify.mockResolvedValueOnce({
      irrelevant: [
        { ref: getReferenceForElement(inner), summary: "inner" },
        { ref: getReferenceForElement(outer), summary: "outer" },
      ],
    });

    await applyAndSettle();

    // Only outer is replaced; inner is subsumed.
    expect(document.querySelector("#outer")).toBeNull();
    expect(getRulePlaceholders()).toHaveLength(1);
  });

  it("skips refs the classifier returns that no longer resolve", async () => {
    document.body.innerHTML = `<aside id="t"><h3>x</h3><p>y</p></aside>`;
    const ref = getReferenceForElement(pick("#t"));
    mockClassify.mockResolvedValueOnce({
      irrelevant: [
        { ref: "ref-does-not-exist", summary: "ghost" },
        { ref, summary: "real" },
      ],
    });

    await applyAndSettle();

    expect(getRulePlaceholders()).toHaveLength(1);
  });

  it("does not call the classifier when the page tree is empty", async () => {
    // No body content → getPageTree returns an empty <body>, serializePageTree
    // returns "", and the rule short-circuits before the LLM call.
    await applyAndSettle();

    expect(mockClassify).not.toHaveBeenCalled();
  });

  it("swallows AbortError without surfacing it", async () => {
    document.body.innerHTML = `<aside><h3>x</h3><p>y</p></aside>`;
    mockClassify.mockRejectedValueOnce(
      new DOMException("aborted", "AbortError"),
    );

    await expect(applyAndSettle()).resolves.toBeUndefined();
    expect(getRulePlaceholders()).toHaveLength(0);
  });

  it("swallows a generic classifier error without throwing", async () => {
    document.body.innerHTML = `<aside><h3>x</h3><p>y</p></aside>`;
    mockClassify.mockRejectedValueOnce(new Error("boom"));

    await expect(applyAndSettle()).resolves.toBeUndefined();
    expect(getRulePlaceholders()).toHaveLength(0);
  });

  describe("scroll re-classification", () => {
    it("re-runs the classifier after a debounced scroll", async () => {
      document.body.innerHTML = `
        <aside id="first"><h3>first</h3><p>x</p></aside>
        <aside id="second"><h3>second</h3><p>x</p></aside>
      `;
      const first = pick("#first");
      const second = pick("#second");
      mockClassify.mockResolvedValueOnce({
        irrelevant: [{ ref: getReferenceForElement(first), summary: "first" }],
      });
      mockClassify.mockResolvedValueOnce({
        irrelevant: [
          { ref: getReferenceForElement(second), summary: "second" },
        ],
      });

      await applyAndSettle();
      expect(getRulePlaceholders()).toHaveLength(1);

      globalThis.dispatchEvent(new Event("scroll"));
      jest.advanceTimersByTime(SCROLL_DEBOUNCE_MS);
      await drainAsync();

      expect(mockClassify).toHaveBeenCalledTimes(2);
      expect(getRulePlaceholders()).toHaveLength(2);
    });

    it("coalesces a burst of scrolls into a single reclassify", async () => {
      document.body.innerHTML = `<aside><h3>x</h3><p>y</p></aside>`;
      mockClassify.mockResolvedValue({ irrelevant: [] });

      await applyAndSettle();
      mockClassify.mockClear();

      for (let i = 0; i < 5; i++) {
        globalThis.dispatchEvent(new Event("scroll"));
        jest.advanceTimersByTime(100);
      }
      jest.advanceTimersByTime(SCROLL_DEBOUNCE_MS);
      await drainAsync();

      expect(mockClassify).toHaveBeenCalledTimes(1);
    });
  });

  describe("teardown", () => {
    it("ignores classifier responses that resolve after teardown", async () => {
      document.body.innerHTML = `<aside id="t"><h3>x</h3><p>y</p></aside>`;
      const ref = getReferenceForElement(pick("#t"));
      // Hold the classifier promise open so we can tear down before it
      // resolves, then settle it after — the rule's signal-aborted check
      // must throw out the (now-stale) response.
      const deferred = createDeferredClassifyResponse();
      mockClassify.mockReturnValueOnce(deferred.promise);

      irrelevantSectionsRedactRule.apply(document.body);
      await Promise.resolve();
      jest.advanceTimersByTime(SETTLE_QUIET_MS);
      await drainAsync();

      irrelevantSectionsRedactRule.teardown();
      // Hand back a response that *would* have hidden the target — but
      // teardown's abort should make the rule discard it.
      deferred.resolve({
        irrelevant: [{ ref, summary: "late" }],
      });
      await drainAsync();

      expect(document.querySelector("#t")).not.toBeNull();
      expect(getRulePlaceholders()).toHaveLength(0);
      // And: scroll after teardown should not re-trigger classification.
      mockClassify.mockClear();
      globalThis.dispatchEvent(new Event("scroll"));
      jest.advanceTimersByTime(SCROLL_DEBOUNCE_MS);
      await drainAsync();
      expect(mockClassify).not.toHaveBeenCalled();
    });
  });
});
