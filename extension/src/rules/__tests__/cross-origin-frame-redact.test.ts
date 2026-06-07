// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { REVEALED_ATTR, RULE_ATTR } from "../../lib/dom-markers";
import { PLACEHOLDER_CLASS } from "../../lib/placeholder";
import { crossOriginFrameRedactRule } from "../cross-origin-frame-redact";

const RULE_ID = "cross-origin-frame-redact";
const MUTATION_THROTTLE_MS = 250;

async function flushMutations(): Promise<void> {
  await Promise.resolve();
}

beforeEach(() => {
  document.body.innerHTML = "";
  jest.useFakeTimers();
});

afterEach(() => {
  crossOriginFrameRedactRule.teardown();
  jest.useRealTimers();
});

function getPlaceholder(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `.${PLACEHOLDER_CLASS}[${RULE_ATTR}="${RULE_ID}"]`,
  );
}

describe("crossOriginFrameRedactRule", () => {
  // jsdom defaults `location.origin` to `http://localhost`, so anything else
  // counts as cross-origin.

  it("replaces a cross-origin https iframe with a placeholder", () => {
    document.body.innerHTML = `
      <iframe src="https://example.com/widget" title="example widget"></iframe>
    `;
    crossOriginFrameRedactRule.apply(document.body);

    expect(document.querySelector("iframe")).toBeNull();
    const placeholder = getPlaceholder();
    expect(placeholder).not.toBeNull();
    // Origin is surfaced to the user so they know whose content is hidden.
    expect(placeholder?.textContent).toContain("https://example.com");
  });

  it("replaces a cross-origin http iframe", () => {
    document.body.innerHTML = `
      <iframe src="http://other.example/path"></iframe>
    `;
    crossOriginFrameRedactRule.apply(document.body);

    expect(document.querySelector("iframe")).toBeNull();
    expect(getPlaceholder()).not.toBeNull();
  });

  it("leaves a same-origin absolute iframe alone", () => {
    document.body.innerHTML = `
      <iframe src="http://localhost/embed"></iframe>
    `;
    crossOriginFrameRedactRule.apply(document.body);

    expect(document.querySelector("iframe")).not.toBeNull();
    expect(getPlaceholder()).toBeNull();
  });

  it("leaves a same-origin relative iframe alone (resolved against baseURI)", () => {
    document.body.innerHTML = `
      <iframe src="/embed/path"></iframe>
    `;
    crossOriginFrameRedactRule.apply(document.body);

    expect(document.querySelector("iframe")).not.toBeNull();
    expect(getPlaceholder()).toBeNull();
  });

  // srcdoc inherits the embedding origin (no SOP crossing) and the manifest's
  // `match_origin_as_fallback: true` means the content script runs inside the
  // srcdoc frame, so every other rule already covers its body. Not a carrier
  // for the Roesner SOP-bypass threat, so the rule leaves it alone.
  it("leaves a srcdoc iframe alone — inherits the embedding origin", () => {
    document.body.innerHTML = `
      <iframe srcdoc="<p>hi</p>"></iframe>
    `;
    crossOriginFrameRedactRule.apply(document.body);

    expect(document.querySelector("iframe")).not.toBeNull();
    expect(getPlaceholder()).toBeNull();
  });

  // Even if a srcdoc iframe *also* declares a cross-origin src, srcdoc wins:
  // the browser ignores src when srcdoc is present and renders the inline
  // doc in the embedding origin.
  it("leaves a srcdoc iframe alone even if it also has a cross-origin src", () => {
    document.body.innerHTML = `
      <iframe srcdoc="<p>hi</p>" src="https://example.com/widget"></iframe>
    `;
    crossOriginFrameRedactRule.apply(document.body);

    expect(document.querySelector("iframe")).not.toBeNull();
    expect(getPlaceholder()).toBeNull();
  });

  it("leaves an iframe with no src alone", () => {
    document.body.innerHTML = `<iframe></iframe>`;
    crossOriginFrameRedactRule.apply(document.body);

    expect(document.querySelector("iframe")).not.toBeNull();
    expect(getPlaceholder()).toBeNull();
  });

  // Non-http(s) protocols either inherit the parent origin or are inert.
  // Hiding them would just create noise.
  it.each([
    ["about:blank", "about:blank"],
    ["data: URL", "data:text/html,<p>hi</p>"],
    ["javascript: URL", "javascript:void(0)"],
    ["blob: URL", "blob:http://localhost/abc-123"],
  ])("leaves an iframe with a %s alone", (_label, src) => {
    document.body.innerHTML = `<iframe src="${src}"></iframe>`;
    crossOriginFrameRedactRule.apply(document.body);

    expect(document.querySelector("iframe")).not.toBeNull();
    expect(getPlaceholder()).toBeNull();
  });

  it("leaves an iframe with an invalid src URL alone", () => {
    // `new URL()` throws on garbage like this; the rule swallows it and skips.
    document.body.innerHTML = `<iframe src="not a url"></iframe>`;
    expect(() => {
      crossOriginFrameRedactRule.apply(document.body);
    }).not.toThrow();

    expect(document.querySelector("iframe")).not.toBeNull();
    expect(getPlaceholder()).toBeNull();
  });

  it("replaces multiple cross-origin iframes in one pass", () => {
    document.body.innerHTML = `
      <iframe src="https://example.com/a"></iframe>
      <iframe src="https://other.example/b"></iframe>
      <iframe src="http://localhost/keep"></iframe>
    `;
    crossOriginFrameRedactRule.apply(document.body);

    expect(document.querySelectorAll("iframe")).toHaveLength(1);
    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(2);
  });

  it("skips an iframe the user has already revealed for this rule", () => {
    // The rule stamps REVEALED_ATTR when its placeholder is clicked, so the
    // observer doesn't immediately re-hide the just-restored iframe.
    document.body.innerHTML = `
      <iframe src="https://example.com/widget"
              data-abs-revealed="${RULE_ID}"></iframe>
    `;
    crossOriginFrameRedactRule.apply(document.body);

    expect(document.querySelector("iframe")).not.toBeNull();
    expect(getPlaceholder()).toBeNull();
  });

  it("still hides an iframe revealed for a *different* rule", () => {
    // Reveal markers are scoped per-rule. A reveal stamp from some other
    // rule should not protect a cross-origin iframe.
    document.body.innerHTML = `
      <iframe src="https://example.com/widget"
              data-abs-revealed="some-other-rule"></iframe>
    `;
    crossOriginFrameRedactRule.apply(document.body);

    expect(document.querySelector("iframe")).toBeNull();
    expect(getPlaceholder()).not.toBeNull();
  });

  // Same SOP-bypass shape as a cross-origin iframe — <object> renders a
  // resource referenced by `data`, <embed> by `src`. Browser-use agents can
  // ingest the embedded resource as if it were on-page content, so the rule
  // hides cross-origin <object>/<embed> too.
  describe("<object> elements", () => {
    it("replaces a cross-origin <object data=…> with a placeholder", () => {
      document.body.innerHTML = `
        <object data="https://example.com/doc.pdf" type="application/pdf"></object>
      `;
      crossOriginFrameRedactRule.apply(document.body);

      expect(document.querySelector("object")).toBeNull();
      const placeholder = getPlaceholder();
      expect(placeholder).not.toBeNull();
      expect(placeholder?.textContent).toContain("https://example.com");
    });

    it("leaves a same-origin <object> alone", () => {
      document.body.innerHTML = `
        <object data="http://localhost/doc.pdf"></object>
      `;
      crossOriginFrameRedactRule.apply(document.body);

      expect(document.querySelector("object")).not.toBeNull();
      expect(getPlaceholder()).toBeNull();
    });

    it("leaves an <object> with no data attribute alone", () => {
      document.body.innerHTML = `<object>fallback content</object>`;
      crossOriginFrameRedactRule.apply(document.body);

      expect(document.querySelector("object")).not.toBeNull();
      expect(getPlaceholder()).toBeNull();
    });
  });

  describe("<embed> elements", () => {
    it("replaces a cross-origin <embed src=…> with a placeholder", () => {
      document.body.innerHTML = `
        <embed src="https://example.com/widget.swf" type="application/x-shockwave-flash" />
      `;
      crossOriginFrameRedactRule.apply(document.body);

      expect(document.querySelector("embed")).toBeNull();
      const placeholder = getPlaceholder();
      expect(placeholder).not.toBeNull();
      expect(placeholder?.textContent).toContain("https://example.com");
    });

    it("leaves a same-origin <embed> alone", () => {
      document.body.innerHTML = `
        <embed src="http://localhost/widget.swf" />
      `;
      crossOriginFrameRedactRule.apply(document.body);

      expect(document.querySelector("embed")).not.toBeNull();
      expect(getPlaceholder()).toBeNull();
    });

    it("leaves an <embed> with no src attribute alone", () => {
      document.body.innerHTML = `<embed />`;
      crossOriginFrameRedactRule.apply(document.body);

      expect(document.querySelector("embed")).not.toBeNull();
      expect(getPlaceholder()).toBeNull();
    });
  });

  describe("lazily-injected iframes", () => {
    // Vendor scripts typically inject `<div class="…"><iframe src="…"></div>`
    // after document_idle. The MutationObserver fires with the wrapper as the
    // added root and the rule's scan finds the iframe inside it.
    it("replaces a cross-origin iframe inside a wrapper appended after apply()", async () => {
      crossOriginFrameRedactRule.apply(document.body);

      const wrapper = document.createElement("div");
      wrapper.className = "embed-host";
      wrapper.innerHTML = `<iframe src="https://example.com/widget"></iframe>`;
      document.body.append(wrapper);

      await flushMutations();
      jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

      expect(document.querySelector("iframe")).toBeNull();
      expect(getPlaceholder()).not.toBeNull();
    });

    // Regression: when an iframe is appended directly (no wrapper), the
    // MutationObserver root *is* the iframe, and querySelectorAll on it
    // returns nothing. The watcher must rescan from document.body to catch
    // this case.
    it("replaces a bare cross-origin iframe appended directly to body", async () => {
      crossOriginFrameRedactRule.apply(document.body);

      const iframe = document.createElement("iframe");
      iframe.src = "https://example.com/widget";
      document.body.append(iframe);

      await flushMutations();
      jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

      expect(document.querySelector("iframe")).toBeNull();
      expect(getPlaceholder()).not.toBeNull();
    });

    it("teardown stops the observer so later additions are ignored", async () => {
      crossOriginFrameRedactRule.apply(document.body);
      crossOriginFrameRedactRule.teardown();

      const wrapper = document.createElement("div");
      wrapper.innerHTML = `<iframe src="https://example.com/widget"></iframe>`;
      document.body.append(wrapper);

      await flushMutations();
      jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

      expect(document.querySelector("iframe")).not.toBeNull();
      expect(getPlaceholder()).toBeNull();
    });
  });

  describe("reveal flow", () => {
    it("restores the iframe on click and stamps REVEALED_ATTR", () => {
      document.body.innerHTML = `
        <iframe src="https://example.com/widget"></iframe>
      `;
      crossOriginFrameRedactRule.apply(document.body);

      const placeholder = getPlaceholder();
      expect(placeholder).not.toBeNull();

      placeholder?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      const restored = document.querySelector("iframe");
      expect(restored).not.toBeNull();
      expect(restored?.getAttribute(REVEALED_ATTR)).toBe(RULE_ID);
      expect(getPlaceholder()).toBeNull();
    });
  });
});
