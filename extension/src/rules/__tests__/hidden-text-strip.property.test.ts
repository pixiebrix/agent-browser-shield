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
  "-webkit-text-fill-color: transparent",
  "filter: opacity(0)",
  "mask-image: linear-gradient(transparent, transparent)",
  "transform: scale(0)",
  "content-visibility: hidden",
  "max-height: 0; overflow: hidden; width: 600px",
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
  document.body.replaceChildren();
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
          document.body.replaceChildren();
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

  // Live-region opt-ins that turn `display:none` into a strip target.
  // The narrow carve-out around tab panels means the bypass surface
  // here is the cross-product of (live-region attribute) × (subtree
  // shape), and a future refactor that special-cased one role at the
  // expense of another would only fail a single unit test. The
  // property pins the whole class so the next regression is caught
  // before it ships.
  const LIVE_REGION_ATTR = fc.constantFrom(
    { role: "status" },
    { role: "alert" },
    { role: "log" },
    { role: "marquee" },
    { role: "timer" },
    { role: "alertdialog" },
    { "aria-live": "polite" },
    { "aria-live": "assertive" },
  );

  it("strips display:none on any live-region role / aria-live opt-in", () => {
    fc.assert(
      fc.property(
        LIVE_REGION_ATTR,
        PAYLOAD,
        CHILD_COUNT,
        (attributes, payload, childCount) => {
          document.body.replaceChildren();
          const target = document.createElement("div");
          target.id = "target";
          target.setAttribute("style", "display: none");
          for (const [name, value] of Object.entries(attributes)) {
            target.setAttribute(name, value);
          }
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

          expect(target.isConnected).toBe(true);
          expect(target.textContent).toBe("");
          for (const marker of markers) {
            expect(marker.isConnected).toBe(true);
            expect(marker.parentElement).toBe(target);
          }
        },
      ),
    );
  });

  // Every shape the matrix → scale check is supposed to recognize as
  // "x or y axis collapsed to zero". Unit tests pin one example each;
  // the property test pins the whole class so a future tweak to the
  // matrix parser doesn't quietly miss `scale3d(_,0,_)` or
  // `matrix(_,_,0,0,_,_)` (y-axis zero) and re-open the bypass.
  const COLLAPSING_TRANSFORM = fc.oneof(
    fc.constant("scale(0)"),
    fc.constant("scale(0, 0)"),
    fc.constant("scaleX(0)"),
    fc.constant("scaleY(0)"),
    fc.constant("scale3d(0, 1, 1)"),
    fc.constant("scale3d(1, 0, 1)"),
    fc.constant("matrix(0, 0, 0, 0, 0, 0)"),
    // x-axis zero, y-axis non-zero (non-uniform collapse)
    fc.constant("matrix(0, 0, 0, 1, 10, 20)"),
    // y-axis zero, x-axis non-zero
    fc.constant("matrix(1, 0, 0, 0, 10, 20)"),
    // matrix3d with x-axis zero (m11 == 0)
    fc.constant("matrix3d(0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)"),
    // matrix3d with y-axis zero (m22 == 0)
    fc.constant("matrix3d(1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)"),
  );

  it("strips text under any transform whose x or y scale collapses to zero", () => {
    fc.assert(
      fc.property(COLLAPSING_TRANSFORM, PAYLOAD, (transform, payload) => {
        document.body.replaceChildren();
        const target = document.createElement("div");
        target.id = "target";
        target.setAttribute("style", `transform: ${transform}`);
        target.append(document.createTextNode(payload));
        document.body.append(target);

        hiddenTextStripRule.apply(document.body);

        expect(target.isConnected).toBe(true);
        expect(target.textContent).toBe("");
      }),
    );
  });

  // The negative half of the same invariant: any transform that leaves
  // both x and y scale non-zero must preserve the text. Without this,
  // a too-eager matrix parser could regress `transform: scale(0.5)`
  // into a strip and corrupt every transformed element on a page.
  const NON_COLLAPSING_TRANSFORM = fc.oneof(
    fc.constant("none"),
    fc.constant("scale(1)"),
    fc.constant("scale(0.5)"),
    fc.constant("scale(2, 0.5)"),
    fc.constant("scaleX(1.5)"),
    fc.constant("scaleY(0.25)"),
    fc.constant("scale3d(1, 0.5, 1)"),
    fc.constant("matrix(1, 0, 0, 1, 0, 0)"),
    fc.constant("matrix(0.5, 0, 0, 0.5, 100, 200)"),
    fc.constant("rotate(45deg)"),
    fc.constant("translate(10px, 20px)"),
  );

  it("preserves text whose transform leaves both axes non-zero", () => {
    fc.assert(
      fc.property(NON_COLLAPSING_TRANSFORM, (transform) => {
        document.body.replaceChildren();
        const target = document.createElement("div");
        target.id = "target";
        target.setAttribute("style", `transform: ${transform}`);
        target.append(document.createTextNode("visible body text"));
        document.body.append(target);

        hiddenTextStripRule.apply(document.body);

        expect(target.textContent).toBe("visible body text");
      }),
    );
  });

  // Mask transparency parser must accept any gradient whose color stops
  // are all transparent, and reject any gradient with at least one
  // opaque stop. The unit tests fix one example each; the property
  // tests pin the class so a tightened regex doesn't quietly miss
  // `linear-gradient(rgba(0,0,0,0), transparent)` (mixed transparent
  // forms) or accept `linear-gradient(transparent, black)` (mixed
  // alpha) and either re-open a bypass or strip every fade overlay
  // on the page.
  const TRANSPARENT_COLOR = fc.constantFrom(
    "transparent",
    "rgba(0, 0, 0, 0)",
    "rgba(255, 255, 255, 0)",
    "rgba(128, 64, 200, 0)",
  );
  const OPAQUE_COLOR = fc.constantFrom(
    "black",
    "white",
    "red",
    "rgba(0, 0, 0, 1)",
    "rgb(50, 100, 150)",
    "#abcdef",
  );
  const GRADIENT_KIND = fc.constantFrom("linear-gradient", "radial-gradient");

  it("strips text under any gradient mask composed entirely of transparent stops", () => {
    fc.assert(
      fc.property(
        GRADIENT_KIND,
        fc.array(TRANSPARENT_COLOR, { minLength: 2, maxLength: 5 }),
        PAYLOAD,
        (kind, stops, payload) => {
          document.body.replaceChildren();
          const target = document.createElement("div");
          target.id = "target";
          target.setAttribute(
            "style",
            `mask-image: ${kind}(${stops.join(", ")})`,
          );
          target.append(document.createTextNode(payload));
          document.body.append(target);

          hiddenTextStripRule.apply(document.body);

          expect(target.textContent).toBe("");
        },
      ),
    );
  });

  it("preserves text under a gradient mask containing any opaque stop", () => {
    fc.assert(
      fc.property(
        GRADIENT_KIND,
        fc.array(TRANSPARENT_COLOR, { minLength: 0, maxLength: 3 }),
        fc.array(OPAQUE_COLOR, { minLength: 1, maxLength: 3 }),
        fc.boolean(),
        (kind, transparentStops, opaqueStops, opaqueFirst) => {
          const stops = opaqueFirst
            ? [...opaqueStops, ...transparentStops]
            : [...transparentStops, ...opaqueStops];
          // A gradient must have at least 2 stops to be valid; pad if needed.
          if (stops.length < 2) {
            stops.push(opaqueStops[0] ?? "black");
          }
          document.body.replaceChildren();
          const target = document.createElement("div");
          target.id = "target";
          target.setAttribute(
            "style",
            `mask-image: ${kind}(${stops.join(", ")})`,
          );
          target.append(document.createTextNode("visible fade-overlay text"));
          document.body.append(target);

          hiddenTextStripRule.apply(document.body);

          expect(target.textContent).toBe("visible fade-overlay text");
        },
      ),
    );
  });

  // Animation-in-flight property-name boundary. The guard pattern is
  // `(?<![a-z-])<name>(?![a-z-])` precisely to keep `\bfilter\b` from
  // matching `backdrop-filter`, `\bheight\b` from matching `line-height`,
  // etc. — those would let an attacker declare a long transition on the
  // adjacent property and trip the guard, bypassing the strip. The unit
  // tests pin the two known concrete cases; the property pins the class
  // so any CSS property name that *contains* a guard keyword but isn't
  // the keyword itself still strips the hidden text.
  //
  // Each trigger is paired with a transition on a "trap" property name
  // that shares a substring with the guard keyword. `transition: <trap>
  // 999s` MUST NOT suppress the strip of the trigger.
  const TRIGGER_AND_TRAP_TRANSITION = fc.constantFrom(
    // filter:opacity(0) bypass via backdrop-filter / -webkit-filter
    {
      style: "filter: opacity(0); transition: backdrop-filter 999s",
    },
    {
      style: "filter: opacity(0); transition: -webkit-filter 999s",
    },
    // max-height:0 bypass via line-height / min-height
    {
      style:
        "max-height: 0; overflow: hidden; width: 600px; transition: line-height 999s",
    },
    {
      style:
        "max-height: 0; overflow: hidden; width: 600px; transition: min-height 999s",
    },
    // transform:scale(0) bypass via transform-origin / transform-style
    {
      style: "transform: scale(0); transition: transform-origin 999s",
    },
    {
      style: "transform: scale(0); transition: transform-style 999s",
    },
    // opacity:0 bypass via fill-opacity / stroke-opacity (SVG)
    {
      style: "opacity: 0; transition: fill-opacity 999s",
    },
    {
      style: "opacity: 0; transition: stroke-opacity 999s",
    },
  );

  it("still strips when a transition targets a property whose name only contains the guard keyword", () => {
    fc.assert(
      fc.property(
        TRIGGER_AND_TRAP_TRANSITION,
        PAYLOAD,
        ({ style }, payload) => {
          document.body.replaceChildren();
          const target = document.createElement("div");
          target.id = "target";
          target.setAttribute("style", style);
          target.append(document.createTextNode(payload));
          document.body.append(target);

          hiddenTextStripRule.apply(document.body);

          expect(target.isConnected).toBe(true);
          expect(target.textContent).toBe("");
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
          document.body.replaceChildren();
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
          document.body.replaceChildren();
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
        document.body.replaceChildren();
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
