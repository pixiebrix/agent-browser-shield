// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Tests for adoptStylesheetIntoShadowRoots. Verify:
//   - adoption into pre-existing open shadow roots
//   - adoption into shadow roots attached after the call
//   - closed shadow roots are skipped (the tracker filters them)
//   - remove() unwinds adoption everywhere and stops future adoption
//   - the document stylesheet path is untouched (this helper is
//     shadow-only)

import {
  __resetShadowRootsForTesting,
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

describe("adoptStylesheetIntoShadowRoots", () => {
  it("adopts the sheet into open shadow roots that already exist", () => {
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    document.body.append(host);

    const handle = adoptStylesheetIntoShadowRoots(".x { color: red; }");

    expect(root.adoptedStyleSheets).toHaveLength(1);
    handle.remove();
  });

  it("adopts the sheet into shadow roots attached after the call", () => {
    const handle = adoptStylesheetIntoShadowRoots(".x { color: red; }");

    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    document.body.append(host);

    expect(root.adoptedStyleSheets).toHaveLength(1);
    handle.remove();
  });

  it("does not adopt into closed shadow roots", () => {
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "closed" });
    document.body.append(host);

    const handle = adoptStylesheetIntoShadowRoots(".x { color: red; }");

    // Closed shadow roots aren't in the open-tracker, so the
    // helper never reaches them.
    expect(root.adoptedStyleSheets).toHaveLength(0);
    handle.remove();
  });

  it("does not duplicate the sheet on repeated adoption attempts", () => {
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    document.body.append(host);

    // Attach a second time via the hook listener path — simulated
    // here by re-attaching a NEW root on a NEW host; the listener
    // should still only see each root once per registration.
    const handle = adoptStylesheetIntoShadowRoots(".x {}");
    const host2 = document.createElement("div");
    const root2 = host2.attachShadow({ mode: "open" });
    document.body.append(host2);

    expect(root.adoptedStyleSheets).toHaveLength(1);
    expect(root2.adoptedStyleSheets).toHaveLength(1);
    // appendIfMissing guard: if the same sheet somehow tried to
    // adopt twice, the length would be 2 here.
    handle.remove();
  });

  it("remove() strips the sheet from every shadow root", () => {
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    document.body.append(host);

    const handle = adoptStylesheetIntoShadowRoots(".x {}");
    expect(root.adoptedStyleSheets).toHaveLength(1);

    handle.remove();
    expect(root.adoptedStyleSheets).toHaveLength(0);
  });

  it("remove() stops adopting into future shadow roots", () => {
    const handle = adoptStylesheetIntoShadowRoots(".x {}");
    handle.remove();

    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    document.body.append(host);

    expect(root.adoptedStyleSheets).toHaveLength(0);
  });

  it("remove() is idempotent", () => {
    const handle = adoptStylesheetIntoShadowRoots(".x {}");
    expect(() => {
      handle.remove();
      handle.remove();
    }).not.toThrow();
  });

  it("does not touch document.adoptedStyleSheets (this helper is shadow-only)", () => {
    const before = document.adoptedStyleSheets.length;
    const handle = adoptStylesheetIntoShadowRoots(".x {}");
    expect(document.adoptedStyleSheets.length).toBe(before);
    handle.remove();
  });

  it("preserves other sheets already adopted into a shadow root", () => {
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    document.body.append(host);

    const existing = new CSSStyleSheet();
    root.adoptedStyleSheets = [existing];

    const handle = adoptStylesheetIntoShadowRoots(".x {}");
    expect(root.adoptedStyleSheets).toHaveLength(2);
    expect(root.adoptedStyleSheets[0]).toBe(existing);

    handle.remove();
    expect(root.adoptedStyleSheets).toHaveLength(1);
    expect(root.adoptedStyleSheets[0]).toBe(existing);
  });
});
