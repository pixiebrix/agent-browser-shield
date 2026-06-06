// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Property-based tests for `hidden-text-strip`. Pins the load-bearing
// framework-safety invariant: across the cross-product of (hidden-trigger
// style) × (child-subtree shape), the scrub must blank text but leave
// every element node attached. Drifting back to `element.remove()` would
// only fail one specific unit test; the property pins it as a class.

import fc from "fast-check";

import { hiddenTextStripRule } from "../hidden-text-strip";
import { FIXTURES } from "./injection-fixtures";

// CSS forms `detectHiddenByCss` recognizes. Each one alone qualifies an
// element for stripping — verified by the corresponding cases in the
// unit-test file. Color-match (`detectColorMatch`) is exercised
// separately below because it requires bg/fg setup on a wrapper.
const HIDDEN_STYLE = fc.constantFrom(
  "visibility: hidden",
  "opacity: 0",
  "font-size: 0",
  "position: absolute; left: -10000px",
  "clip-path: inset(100%)",
);

const PAYLOAD = fc.constantFrom(
  FIXTURES.HIDDEN_IGNORE_PRIOR,
  FIXTURES.HIDDEN_WHITE_ON_WHITE,
  FIXTURES.HIDDEN_LARGE_OFFSCREEN,
  FIXTURES.HIDDEN_SMUGGLED,
);

// Number of nested element children the scrub must leave attached.
// React/Vue/Svelte hold references to every element they rendered — if
// any one of them gets detached, the framework's next unmount throws on a
// missing parent. Vary the count so the invariant holds across "empty
// hidden box", "single span", and "deeply populated subtree".
const CHILD_COUNT = fc.integer({ min: 0, max: 6 });

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  hiddenTextStripRule.teardown();
});

describe("hidden-text-strip (property)", () => {
  it("blanks text and keeps every element node attached for any CSS-hidden trigger", () => {
    fc.assert(
      fc.property(
        HIDDEN_STYLE,
        PAYLOAD,
        CHILD_COUNT,
        (style, payload, childCount) => {
          document.body.innerHTML = "";
          const target = document.createElement("div");
          target.id = "target";
          target.setAttribute("style", style);
          // Direct text on the wrapper qualifies the element for every
          // CSS trigger (font-size:0 / color-match gate on own direct
          // text; the rest gate only on having any non-empty text).
          target.append(document.createTextNode(payload));

          const markers: HTMLSpanElement[] = [];
          for (let i = 0; i < childCount; i++) {
            const marker = document.createElement("span");
            marker.id = `marker-${i}`;
            marker.textContent = `marker-${i}`;
            target.append(marker);
            markers.push(marker);
          }
          document.body.append(target);

          hiddenTextStripRule.apply(document.body);

          // Target stays attached: framework reconciliation can still
          // unmount it on the next route change without throwing on a
          // detached parent.
          expect(target.isConnected).toBe(true);
          expect(target.parentElement).toBe(document.body);
          // Every text-bearing surface in the subtree is blanked: agents
          // walking textContent / the a11y tree read nothing.
          expect(target.textContent).toBe("");
          // Every child element node survives in place. This is the
          // invariant `replaceChildren()` / `element.remove()` violates.
          for (const marker of markers) {
            expect(marker.isConnected).toBe(true);
            expect(marker.parentElement).toBe(target);
          }
        },
      ),
    );
  });

  // Cross-product invariant for #203 item #10: landmark + aria-hidden
  // allowlists kick in only for positional hide reasons. A future tweak
  // that moves a check back into the unconditional skip block (or adds
  // a new positional-shaped reason without updating the allowlist set)
  // would re-open the bypass; pinning the class as a property catches it.
  const POSITIONAL_TRIGGER = fc.constantFrom(
    "position: absolute; left: -10000px",
    "position: fixed; top: -10000px",
    "clip-path: inset(100%)",
    "text-indent: -10000px",
  );
  const NON_POSITIONAL_TRIGGER = fc.constantFrom(
    "visibility: hidden",
    "opacity: 0",
  );
  const LANDMARK_TAG = fc.constantFrom(
    "nav",
    "main",
    "header",
    "footer",
    "aside",
  );

  it("preserves a positional-hide landmark; strips a non-positional one", () => {
    fc.assert(
      fc.property(
        LANDMARK_TAG,
        fc.boolean(),
        POSITIONAL_TRIGGER,
        NON_POSITIONAL_TRIGGER,
        PAYLOAD,
        (tag, positional, positionalStyle, nonPositionalStyle, payload) => {
          document.body.innerHTML = "";
          const target = document.createElement(tag);
          target.id = "target";
          target.setAttribute(
            "style",
            positional ? positionalStyle : nonPositionalStyle,
          );
          target.append(document.createTextNode(payload));
          document.body.append(target);

          hiddenTextStripRule.apply(document.body);

          expect(target.isConnected).toBe(true);
          // Positional → landmark allowlist preserves text.
          // Non-positional → injection-shaped on a landmark, stripped.
          expect(target.textContent === "").toBe(!positional);
        },
      ),
    );
  });

  it("preserves positional hides inside aria-hidden; strips non-positional ones", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        POSITIONAL_TRIGGER,
        NON_POSITIONAL_TRIGGER,
        PAYLOAD,
        (positional, positionalStyle, nonPositionalStyle, payload) => {
          document.body.innerHTML = "";
          const wrapper = document.createElement("div");
          wrapper.setAttribute("aria-hidden", "true");
          const target = document.createElement("span");
          target.id = "target";
          target.setAttribute(
            "style",
            positional ? positionalStyle : nonPositionalStyle,
          );
          target.append(document.createTextNode(payload));
          wrapper.append(target);
          document.body.append(wrapper);

          hiddenTextStripRule.apply(document.body);

          expect(target.isConnected).toBe(true);
          expect(target.textContent === "").toBe(!positional);
        },
      ),
    );
  });

  it("blanks color-matched text and keeps wrapper + descendants attached", () => {
    // Color-match uses a different code path than the CSS triggers above —
    // it walks ancestors to compute the effective background. Cover it
    // separately so the framework-safety invariant is pinned across both
    // detector families.
    fc.assert(
      fc.property(PAYLOAD, CHILD_COUNT, (payload, childCount) => {
        document.body.innerHTML = "";
        const wrapper = document.createElement("section");
        wrapper.setAttribute("style", "background-color: rgb(20, 20, 20)");
        const target = document.createElement("span");
        target.id = "target";
        target.setAttribute("style", "color: rgb(22, 22, 22)");
        target.append(document.createTextNode(payload));

        const markers: HTMLSpanElement[] = [];
        for (let i = 0; i < childCount; i++) {
          const marker = document.createElement("i");
          marker.id = `marker-${i}`;
          marker.textContent = `marker-${i}`;
          target.append(marker);
          markers.push(marker);
        }
        wrapper.append(target);
        document.body.append(wrapper);

        hiddenTextStripRule.apply(document.body);

        expect(target.isConnected).toBe(true);
        expect(target.textContent).toBe("");
        expect(wrapper.isConnected).toBe(true);
        for (const marker of markers) {
          expect(marker.isConnected).toBe(true);
          expect(marker.parentElement).toBe(target);
        }
      }),
    );
  });
});
