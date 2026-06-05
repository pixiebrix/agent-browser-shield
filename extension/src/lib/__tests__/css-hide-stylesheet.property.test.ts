// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Property tests for injectHideStylesheet. Two lifecycle invariants
// that scenario tests are bad at exhausting (plus one targeted
// orphan-cleanup scenario that the properties can't express cleanly):
//
//   - After remove() on every active handle, no <style> with the
//     configured id remains anywhere — across arbitrary interleavings
//     of inject / removeHandle / pageRemovesStyle / attachShadow.
//   - After remove() on every active handle, no open shadow root
//     carries an adopted sheet from any of those handles. Inner-helper
//     idempotence is covered by shadow-stylesheets.property.test.ts;
//     here we assert the outer helper doesn't leak the AdoptedShadowSheet
//     reference past its remove() call.

import fc from "fast-check";

import { injectHideStylesheet } from "../css-hide-stylesheet";
import {
  __resetShadowRootsForTesting,
  getOpenShadowRoots,
  installShadowRootHook,
} from "../shadow-roots";

const STYLE_ID = "abs-css-hide-property-test";
const SELECTORS = [".prop-test-target"] as const;

beforeEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  __resetShadowRootsForTesting();
  installShadowRootHook();
});

afterEach(() => {
  __resetShadowRootsForTesting();
  // Clear any stray <style> that escaped a test.
  for (const element of document.querySelectorAll(`#${STYLE_ID}`)) {
    element.remove();
  }
});

// Op alphabet (lifecycle ops only — orphan cleanup is exercised by a
// dedicated scenario test below, because it only fires synchronously
// with .remove() and is awkward to assert as a state-machine invariant):
//   { kind: "inject" }                  — call injectHideStylesheet, retain handle
//   { kind: "removeHandle" }            — call .remove() on the oldest active handle
//   { kind: "pageRemovesStyle" }        — simulate page JS removing the <style>
//   { kind: "attachShadow" }            — open a new shadow root
const opArb = fc.oneof(
  fc.record({ kind: fc.constant<"inject">("inject") }),
  fc.record({ kind: fc.constant<"removeHandle">("removeHandle") }),
  fc.record({ kind: fc.constant<"pageRemovesStyle">("pageRemovesStyle") }),
  fc.record({ kind: fc.constant<"attachShadow">("attachShadow") }),
);

const opSequenceArb = fc.array(opArb, { minLength: 1, maxLength: 20 });

function stylesById(): HTMLStyleElement[] {
  return [...document.querySelectorAll<HTMLStyleElement>(`#${STYLE_ID}`)];
}

function run(ops: ReadonlyArray<{ kind: string }>): {
  activeHandles: Array<{ remove: () => void }>;
} {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  __resetShadowRootsForTesting();
  installShadowRootHook();

  const activeHandles: Array<{ remove: () => void }> = [];

  for (const op of ops) {
    switch (op.kind) {
      case "inject": {
        const handle = injectHideStylesheet({
          elementId: STYLE_ID,
          selectors: SELECTORS,
        });
        activeHandles.push(handle);
        break;
      }
      case "removeHandle": {
        const handle = activeHandles.shift();
        handle?.remove();
        break;
      }
      case "pageRemovesStyle": {
        // Aggressive page-side <head> cleanup that some sites do.
        for (const element of stylesById()) {
          element.remove();
        }
        break;
      }
      case "attachShadow": {
        const host = document.createElement("div");
        host.attachShadow({ mode: "open" });
        document.body.append(host);
        break;
      }
    }
  }

  return { activeHandles };
}

// Op sequences that include at least one inject — required for the
// "after drain, no <style> remains" property. Without an inject, no
// remove() ever runs, so any planted orphan would (correctly) persist.
const opSequenceWithInjectArb = opSequenceArb.filter((ops) =>
  ops.some((op) => op.kind === "inject"),
);

describe("injectHideStylesheet — properties", () => {
  it("after every handle is removed, no <style> with the configured id remains", () => {
    fc.assert(
      fc.property(opSequenceWithInjectArb, (ops) => {
        const { activeHandles } = run(ops);

        // Drain all live handles. The contract: once every handle has
        // been removed, the helper's defensive cleanup must take out any
        // orphan <style#STYLE_ID> in the document — whether planted by
        // a prior session, by page JS, or by a parallel handle that was
        // already remove()d.
        while (activeHandles.length > 0) {
          activeHandles.shift()?.remove();
        }

        expect(stylesById()).toHaveLength(0);
      }),
    );
  });

  it("remove() cleans up orphan <style> elements planted before inject", () => {
    // Scenario: a prior session left an orphan <style#id> in <head>
    // (e.g., navigation interrupted teardown, HMR hot-swap). The next
    // inject/remove cycle should leave the document clean.
    const orphan = document.createElement("style");
    orphan.id = STYLE_ID;
    orphan.textContent = "/* leftover */";
    document.head.append(orphan);

    const handle = injectHideStylesheet({
      elementId: STYLE_ID,
      selectors: SELECTORS,
    });
    // Both the orphan and the newly-injected style coexist.
    expect(stylesById().length).toBeGreaterThanOrEqual(2);

    handle.remove();
    expect(stylesById()).toHaveLength(0);
  });

  it("after every handle is removed, no open shadow root carries a sheet from us", () => {
    fc.assert(
      fc.property(opSequenceArb, (ops) => {
        const { activeHandles } = run(ops);

        // Snapshot the set of sheets currently adopted across every
        // open shadow root *before* draining handles — these are the
        // sheets we expect to disappear.
        const sheetsBefore = new Set<CSSStyleSheet>();
        for (const root of getOpenShadowRoots()) {
          for (const sheet of root.adoptedStyleSheets) {
            sheetsBefore.add(sheet);
          }
        }

        while (activeHandles.length > 0) {
          activeHandles.shift()?.remove();
        }

        // After teardown, no shadow root should still carry any of the
        // pre-teardown sheets. (If a future helper change leaked the
        // adoptedSheet reference past remove(), the sheet would
        // persist.)
        for (const root of getOpenShadowRoots()) {
          for (const sheet of root.adoptedStyleSheets) {
            expect(sheetsBefore.has(sheet)).toBe(false);
          }
        }
      }),
    );
  });
});
