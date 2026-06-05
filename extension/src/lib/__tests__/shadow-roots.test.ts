// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Tests for the attachShadow patch and the discovery walk. The
// subtree-watcher tests exercise the integration; this file pins down
// the tracker's contract in isolation.

import {
  __resetShadowRootsForTesting,
  discoverShadowRootsIn,
  getOpenShadowRoots,
  installShadowRootHook,
  subscribeShadowRootAttached,
} from "../shadow-roots";

beforeEach(() => {
  document.body.innerHTML = "";
  __resetShadowRootsForTesting();
  installShadowRootHook();
});

afterEach(() => {
  __resetShadowRootsForTesting();
});

describe("installShadowRootHook", () => {
  it("registers open shadow roots created after the hook is installed", () => {
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    expect(getOpenShadowRoots().has(root)).toBe(true);
  });

  it("does not register closed shadow roots", () => {
    const host = document.createElement("div");
    host.attachShadow({ mode: "closed" });
    // Closed roots are opt-out by design — host.shadowRoot is null and
    // the tracker should respect that boundary.
    expect(getOpenShadowRoots().size).toBe(0);
  });

  it("is idempotent — calling install twice does not stack the patch", () => {
    installShadowRootHook();
    installShadowRootHook();

    const host = document.createElement("div");
    host.attachShadow({ mode: "open" });

    // If the patch had stacked, each attachShadow would have fired the
    // listener once per layer.
    expect(getOpenShadowRoots().size).toBe(1);
  });

  it("notifies subscribers when a new open shadow root attaches", () => {
    const listener = jest.fn();
    const unsubscribe = subscribeShadowRootAttached(listener);

    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(root);
    unsubscribe();
  });

  it("does not notify subscribers for closed roots", () => {
    const listener = jest.fn();
    subscribeShadowRootAttached(listener);

    const host = document.createElement("div");
    host.attachShadow({ mode: "closed" });

    expect(listener).not.toHaveBeenCalled();
  });

  it("stops notifying after unsubscribe", () => {
    const listener = jest.fn();
    const unsubscribe = subscribeShadowRootAttached(listener);
    unsubscribe();

    const host = document.createElement("div");
    host.attachShadow({ mode: "open" });

    expect(listener).not.toHaveBeenCalled();
  });
});

describe("discoverShadowRootsIn", () => {
  it("returns open shadow roots reachable from the given subtree", () => {
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    document.body.append(host);

    expect(discoverShadowRootsIn(document.body)).toContain(root);
  });

  it("recurses into nested shadow roots", () => {
    const outer = document.createElement("div");
    const outerRoot = outer.attachShadow({ mode: "open" });
    const middle = document.createElement("section");
    const middleRoot = middle.attachShadow({ mode: "open" });
    const inner = document.createElement("article");
    const innerRoot = inner.attachShadow({ mode: "open" });
    middleRoot.append(inner);
    outerRoot.append(middle);
    document.body.append(outer);

    const found = discoverShadowRootsIn(document.body);
    expect(found).toContain(outerRoot);
    expect(found).toContain(middleRoot);
    expect(found).toContain(innerRoot);
  });

  it("skips closed shadow roots", () => {
    const open = document.createElement("div");
    const openRoot = open.attachShadow({ mode: "open" });
    const closed = document.createElement("div");
    closed.attachShadow({ mode: "closed" });
    document.body.append(open, closed);

    const found = discoverShadowRootsIn(document.body);
    expect(found).toContain(openRoot);
    expect(found).toHaveLength(1);
  });

  it("registers roots discovered on the walk so subscribers fire later", () => {
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    document.body.append(host);

    // Simulate the "attached before our hook was installed" case by
    // clearing the registry after attach. discoverShadowRootsIn is the
    // bootstrap that rescues the root.
    __resetShadowRootsForTesting();
    expect(getOpenShadowRoots().size).toBe(0);

    discoverShadowRootsIn(document.body);

    expect(getOpenShadowRoots().has(root)).toBe(true);
  });
});
