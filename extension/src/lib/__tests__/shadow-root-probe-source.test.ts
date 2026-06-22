/**
 * @jest-environment jsdom
 */
// Tests for the page-world shadow-root probe. The probe function runs
// inside the page world in production; jsdom's single-world model means
// installing it in the test world exercises the same code path.
//
// Each test isolates the probe state by clearing the FLAG sentinel and
// restoring the originals captured at module load. Without this the
// second test would observe the wraps from the first.

import { installShadowRootProbe } from "../shadow-root-probe-source";

interface ProbeWindow {
  __abs_shadow_root_probe_installed?: boolean;
}

interface ElementSetHTMLUnsafeCapable {
  setHTMLUnsafe?: (this: Element, html: string) => void;
}
interface ShadowSetHTMLUnsafeCapable {
  setHTMLUnsafe?: (this: ShadowRoot, html: string) => void;
}

const ORIGINAL_ATTACH_SHADOW = Element.prototype.attachShadow;
const ORIGINAL_ELEMENT_SET_HTML = (
  Element.prototype as ElementSetHTMLUnsafeCapable
).setHTMLUnsafe;
const ORIGINAL_SHADOW_SET_HTML = (
  ShadowRoot.prototype as ShadowSetHTMLUnsafeCapable
).setHTMLUnsafe;

function resetProbeFlag(): void {
  delete (globalThis as unknown as ProbeWindow)
    .__abs_shadow_root_probe_installed;
}

function captureEvents(type: string): {
  events: Array<CustomEvent<unknown>>;
  off: () => void;
} {
  const events: Array<CustomEvent<unknown>> = [];
  const handler = (event: Event): void => {
    events.push(event as CustomEvent<unknown>);
  };
  document.addEventListener(type, handler);
  return {
    events,
    off: () => {
      document.removeEventListener(type, handler);
    },
  };
}

function restorePrototypes(): void {
  Element.prototype.attachShadow = ORIGINAL_ATTACH_SHADOW;
  // exactOptionalPropertyTypes: only re-attach setHTMLUnsafe if jsdom
  // (or its polyfill) provided one originally. A bare prototype without
  // the method is a valid configuration; restoring `undefined` would
  // be a type error and a worse runtime state than leaving the slot
  // missing.
  if (ORIGINAL_ELEMENT_SET_HTML) {
    (Element.prototype as ElementSetHTMLUnsafeCapable).setHTMLUnsafe =
      ORIGINAL_ELEMENT_SET_HTML;
  }
  if (ORIGINAL_SHADOW_SET_HTML) {
    (ShadowRoot.prototype as ShadowSetHTMLUnsafeCapable).setHTMLUnsafe =
      ORIGINAL_SHADOW_SET_HTML;
  }
}

beforeEach(() => {
  resetProbeFlag();
  restorePrototypes();
  document.body.innerHTML = "";
});

afterAll(() => {
  resetProbeFlag();
  restorePrototypes();
});

describe("installShadowRootProbe — attachShadow wrap", () => {
  it("dispatches abs:closed-shadow-attached on a closed attachShadow call", () => {
    installShadowRootProbe.call(globalThis as unknown as Window);
    const capture = captureEvents("abs:closed-shadow-attached");

    const host = document.createElement("div");
    host.attachShadow({ mode: "closed" });

    expect(capture.events).toHaveLength(1);
    capture.off();
  });

  it("dispatches abs:shadow-discover with the host on an open attachShadow call", () => {
    installShadowRootProbe.call(globalThis as unknown as Window);
    const capture = captureEvents("abs:shadow-discover");

    const host = document.createElement("div");
    host.attachShadow({ mode: "open" });

    expect(capture.events).toHaveLength(1);
    const detail = capture.events[0]?.detail as
      | undefined
      | { target?: unknown };
    expect(detail?.target).toBe(host);
    capture.off();
  });

  it("returns the real ShadowRoot regardless of mode", () => {
    installShadowRootProbe.call(globalThis as unknown as Window);

    const openHost = document.createElement("div");
    const openRoot = openHost.attachShadow({ mode: "open" });
    expect(openRoot).toBe(openHost.shadowRoot);

    const closedHost = document.createElement("div");
    const closedRoot = closedHost.attachShadow({ mode: "closed" });
    // The page caller still receives the closed root — only `host.shadowRoot`
    // returns null from outside.
    expect(closedRoot).toBeInstanceOf(ShadowRoot);
    expect(closedHost.shadowRoot).toBeNull();
  });

  it("does not fire the closed-shadow signal on an open attach", () => {
    installShadowRootProbe.call(globalThis as unknown as Window);
    const capture = captureEvents("abs:closed-shadow-attached");

    document.createElement("div").attachShadow({ mode: "open" });

    expect(capture.events).toHaveLength(0);
    capture.off();
  });
});

describe("installShadowRootProbe — setHTMLUnsafe wraps", () => {
  it("dispatches abs:shadow-discover with the receiver on Element.setHTMLUnsafe", () => {
    if (
      typeof (Element.prototype as ElementSetHTMLUnsafeCapable)
        .setHTMLUnsafe !== "function"
    ) {
      // jsdom build without setHTMLUnsafe — skip; the jsdom-extras shim
      // ships one in the actual content-script test runner, but a bare
      // probe test shouldn't depend on it.
      return;
    }
    installShadowRootProbe.call(globalThis as unknown as Window);
    const capture = captureEvents("abs:shadow-discover");

    const host = document.createElement("div");
    document.body.append(host);
    host.setHTMLUnsafe("<span>plain</span>");

    expect(capture.events).toHaveLength(1);
    const detail = capture.events[0]?.detail as
      | undefined
      | { target?: unknown };
    expect(detail?.target).toBe(host);
    capture.off();
  });

  it("dispatches abs:shadow-discover with the shadow on ShadowRoot.setHTMLUnsafe", () => {
    if (
      typeof (ShadowRoot.prototype as ShadowSetHTMLUnsafeCapable)
        .setHTMLUnsafe !== "function"
    ) {
      return;
    }
    installShadowRootProbe.call(globalThis as unknown as Window);
    const capture = captureEvents("abs:shadow-discover");

    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    document.body.append(host);
    // Clear the discover call from the attachShadow above.
    capture.events.length = 0;

    shadow.setHTMLUnsafe("<span>x</span>");

    expect(capture.events).toHaveLength(1);
    const detail = capture.events[0]?.detail as
      | undefined
      | { target?: unknown };
    expect(detail?.target).toBe(shadow);
    capture.off();
  });
});

describe("installShadowRootProbe — idempotency", () => {
  it("is a no-op when called a second time", () => {
    installShadowRootProbe.call(globalThis as unknown as Window);
    // Wrap stored after first call; second call must not re-wrap so the
    // listener fires exactly once per attachShadow.
    installShadowRootProbe.call(globalThis as unknown as Window);

    const capture = captureEvents("abs:closed-shadow-attached");
    document.createElement("div").attachShadow({ mode: "closed" });
    expect(capture.events).toHaveLength(1);
    capture.off();
  });
});

describe("installShadowRootProbe — event independence", () => {
  it("does not stamp closed listeners with detail (no shadow contents cross)", () => {
    // Contract: the closed-shadow signal carries no information about
    // the host or root. Documented as part of preserving the spec's
    // encapsulation guarantee; assert it in case a future "convenient
    // payload" tweak forgets it.
    installShadowRootProbe.call(globalThis as unknown as Window);
    const capture = captureEvents("abs:closed-shadow-attached");

    document.createElement("div").attachShadow({ mode: "closed" });

    expect(capture.events[0]?.detail).toBeNull();
    capture.off();
  });
});
