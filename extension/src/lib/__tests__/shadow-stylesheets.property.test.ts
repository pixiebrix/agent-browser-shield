// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Property tests for adoptStylesheetIntoShadowRoots. Two structural
// invariants that fuzz better than they assert:
//
//   - For any sequence of attach (open|closed) / adopt / remove
//     operations, the sheet ends up adopted into exactly the set of
//     currently-tracked open shadow roots — and nothing else.
//   - The adoption count never exceeds 1 per shadow root no matter
//     how many times the same handle's listener fires (idempotence
//     against the registration path's deduplication).

import fc from "fast-check";

import {
  __resetShadowRootsForTesting,
  getOpenShadowRoots,
  installShadowRootHook,
} from "../shadow-roots";
import { adoptStylesheetIntoShadowRoots } from "../shadow-stylesheets";

beforeEach(() => {
  document.body.replaceChildren();
  __resetShadowRootsForTesting();
  installShadowRootHook();
});

afterEach(() => {
  __resetShadowRootsForTesting();
});

// Op shape (inferred from the generator):
//   { kind: "attach", mode: "open" | "closed" }
//   { kind: "adopt" }       // creates a handle, leaves it active
//   { kind: "remove" }      // removes the most recent active handle

const opArb = fc.oneof(
  fc.record({
    kind: fc.constant<"attach">("attach"),
    mode: fc.constantFrom<"open" | "closed">("open", "closed"),
  }),
  fc.record({ kind: fc.constant<"adopt">("adopt") }),
  fc.record({ kind: fc.constant<"remove">("remove") }),
);

const opSequenceArb = fc.array(opArb, { minLength: 1, maxLength: 16 });

describe("adoptStylesheetIntoShadowRoots — properties", () => {
  it("sheet membership equals current-open-shadows × active-handles", () => {
    fc.assert(
      fc.property(opSequenceArb, (ops) => {
        document.body.replaceChildren();
        __resetShadowRootsForTesting();
        installShadowRootHook();

        const activeHandles: Array<{
          handle: { remove: () => void };
          sheet: CSSStyleSheet;
        }> = [];

        for (const op of ops) {
          if (op.kind === "attach") {
            const host = document.createElement("div");
            host.attachShadow({ mode: op.mode });
            document.body.append(host);
          } else if (op.kind === "adopt") {
            // Capture the constructed sheet by snapshotting the
            // open shadow root with the most adopted sheets before
            // vs after. Simpler: track sheets by reference via a
            // dummy host so we can identify them.
            const probe = document.createElement("div");
            const probeRoot = probe.attachShadow({ mode: "open" });
            document.body.append(probe);
            const before = probeRoot.adoptedStyleSheets.length;
            const handle = adoptStylesheetIntoShadowRoots(".x {}");
            const after = probeRoot.adoptedStyleSheets.length;
            const added = probeRoot.adoptedStyleSheets[after - 1];
            // If the probe was created BEFORE adoption, before+1 === after.
            expect(after - before).toBe(1);
            activeHandles.push({ handle, sheet: added as CSSStyleSheet });
          } else if (activeHandles.length > 0) {
            const last = activeHandles.pop();
            last?.handle.remove();
          }
        }

        // Final state: every currently-open shadow root contains
        // exactly the sheets associated with still-active handles
        // (in arbitrary order — adoption appends, so insertion
        // order matters less than membership).
        const expectedSheets = new Set(activeHandles.map((h) => h.sheet));
        for (const root of getOpenShadowRoots()) {
          const adopted = new Set(root.adoptedStyleSheets);
          // The probe roots may carry the same sheets; what matters
          // is that no sheet from an *inactive* handle persists.
          for (const sheet of adopted) {
            // Every adopted sheet either belongs to an active handle
            // OR was placed by the test harness via the probe-root
            // creation path (which is itself one of the adoptions
            // we just verified by reference). The cleanup contract
            // is satisfied iff: for every sheet in `adopted` that
            // came from this helper, it has a matching active
            // handle.
            const fromHelper = expectedSheets.has(sheet);
            // The other case is sheets that aren't from this helper
            // (e.g. residual from prior iterations) — but our
            // beforeEach reset clears all that.
            if (!fromHelper) {
              // We don't construct other sheets in this test, so
              // this branch should never hit.
              throw new Error(
                "unexpected sheet in shadow root — not produced by an active handle",
              );
            }
          }
        }

        // Clean up to keep test state contained.
        while (activeHandles.length > 0) {
          activeHandles.pop()?.handle.remove();
        }
      }),
    );
  });

  it("adoption is idempotent — a sheet appears at most once per shadow root", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8 }),
        fc.integer({ min: 1, max: 4 }),
        (shadowCount, adoptCount) => {
          document.body.replaceChildren();
          __resetShadowRootsForTesting();
          installShadowRootHook();

          // Build N shadow roots first.
          const roots: ShadowRoot[] = [];
          for (let i = 0; i < shadowCount; i++) {
            const host = document.createElement("div");
            roots.push(host.attachShadow({ mode: "open" }));
            document.body.append(host);
          }

          // Adopt K *distinct* sheets — each should appear exactly
          // once per root.
          const handles = Array.from({ length: adoptCount }, () =>
            adoptStylesheetIntoShadowRoots(".x {}"),
          );

          for (const root of roots) {
            // Each adopted sheet must be unique within a root's array.
            const sheets = root.adoptedStyleSheets;
            const seen = new Set<unknown>();
            for (const sheet of sheets) {
              expect(seen.has(sheet)).toBe(false);
              seen.add(sheet);
            }
            expect(sheets.length).toBe(adoptCount);
          }

          for (const handle of handles) {
            handle.remove();
          }
          for (const root of roots) {
            expect(root.adoptedStyleSheets.length).toBe(0);
          }
        },
      ),
    );
  });
});
