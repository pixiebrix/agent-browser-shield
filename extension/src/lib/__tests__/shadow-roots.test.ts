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
  document.body.replaceChildren();
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

describe("setHTMLUnsafe — declarative shadow DOM", () => {
  // The HTML parser materializes `<template shadowrootmode>` into a
  // real shadow root on the parent without ever invoking
  // `attachShadow`. `Element.setHTMLUnsafe` is the post-parse opt-in
  // that re-enables the same path. Without the patch in
  // `installShadowRootHook`, a page that hydrates via setHTMLUnsafe
  // could ship content in an open shadow without registering with the
  // tracker — every shadow-piercing rule would miss it.

  it("registers an open root materialized via setHTMLUnsafe on a connected host", () => {
    const host = document.createElement("div");
    document.body.append(host);

    host.setHTMLUnsafe(
      '<template shadowrootmode="open"><span class="hidden-content">message</span></template>',
    );

    expect(host.shadowRoot).not.toBeNull();
    expect(host.shadowRoot?.mode).toBe("open");
    expect(getOpenShadowRoots().has(host.shadowRoot as ShadowRoot)).toBe(true);
  });

  it("does not register a closed declarative shadow", () => {
    const host = document.createElement("div");
    document.body.append(host);

    host.setHTMLUnsafe(
      '<template shadowrootmode="closed"><span>closed payload</span></template>',
    );

    // Closed roots are opt-out — `host.shadowRoot` is null and the
    // tracker should respect that even when the carrier was DSD
    // rather than imperative attachShadow.
    expect(host.shadowRoot).toBeNull();
    expect(getOpenShadowRoots().size).toBe(0);
  });

  it("registers a nested DSD open shadow attached to a descendant host", () => {
    const wrapper = document.createElement("div");
    document.body.append(wrapper);

    // The DSD template is inside a descendant of the receiver, not at
    // the top level — the parser attaches the shadow on the
    // descendant host, not on the receiver.
    wrapper.setHTMLUnsafe(
      '<div class="wrapper"><section class="nested-host"><template shadowrootmode="open"><p>nested</p></template></section></div>',
    );

    const nested = wrapper.querySelector(".nested-host");
    expect(nested?.shadowRoot).not.toBeNull();
    expect(getOpenShadowRoots().has(nested?.shadowRoot as ShadowRoot)).toBe(
      true,
    );
  });

  it("notifies subscribers exactly once per registered DSD shadow", () => {
    const listener = jest.fn();
    const unsubscribe = subscribeShadowRootAttached(listener);

    const host = document.createElement("div");
    document.body.append(host);
    host.setHTMLUnsafe(
      '<template shadowrootmode="open"><span>x</span></template>',
    );

    // The host's shadow should fire the listener exactly once even
    // though both the attachShadow patch (via the polyfill's lift
    // path) and the setHTMLUnsafe trampoline's discoverShadowRootsIn
    // walk see the same root. registerShadowRoot is idempotent against
    // the registry.
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(host.shadowRoot);
    unsubscribe();
  });

  it("registers DSD shadows nested inside a ShadowRoot.setHTMLUnsafe call", () => {
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    document.body.append(host);

    root.setHTMLUnsafe(
      '<section><inner-host><template shadowrootmode="open"><span>deep</span></template></inner-host></section>',
    );

    const inner = root.querySelector("inner-host");
    expect(inner?.shadowRoot).not.toBeNull();
    expect(getOpenShadowRoots().has(inner?.shadowRoot as ShadowRoot)).toBe(
      true,
    );
  });

  it("is safe to call setHTMLUnsafe repeatedly without double-registering", () => {
    const host = document.createElement("div");
    document.body.append(host);

    host.setHTMLUnsafe(
      '<template shadowrootmode="open"><span>first</span></template>',
    );
    const firstRoot = host.shadowRoot;
    expect(firstRoot).not.toBeNull();

    // Second call: the receiver already has a shadow. Spec-wise the
    // duplicate template is dropped; either way the registry should
    // still contain exactly the one root.
    host.setHTMLUnsafe("<div>plain replacement content</div>");

    expect(getOpenShadowRoots().size).toBe(1);
    expect(getOpenShadowRoots().has(firstRoot as ShadowRoot)).toBe(true);
  });
});

describe("abs:shadow-discover listener — main-world probe bridge", () => {
  // The page-world probe (lib/shadow-root-probe-source.ts) dispatches
  // `abs:shadow-discover` with the receiver node on event.detail.target
  // whenever a page-script attachShadow or setHTMLUnsafe call lands in
  // the page world. The isolated-world listener installed by
  // installShadowRootHook walks the target with discoverShadowRootsIn.
  // Without the listener, page-script open-shadow attachments would
  // only be picked up by the MutationObserver host-insertion path,
  // which can miss attachments on already-connected hosts.

  it("registers an open shadow when the probe dispatches with the host", () => {
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    document.body.append(host);
    __resetShadowRootsForTesting();
    expect(getOpenShadowRoots().has(root)).toBe(false);

    document.dispatchEvent(
      new CustomEvent("abs:shadow-discover", { detail: { target: host } }),
    );

    expect(getOpenShadowRoots().has(root)).toBe(true);
  });

  it("walks a ShadowRoot target dispatched by the probe", () => {
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    document.body.append(host);
    const inner = document.createElement("section");
    const innerRoot = inner.attachShadow({ mode: "open" });
    root.append(inner);
    __resetShadowRootsForTesting();

    document.dispatchEvent(
      new CustomEvent("abs:shadow-discover", { detail: { target: root } }),
    );

    expect(getOpenShadowRoots().has(innerRoot)).toBe(true);
  });

  it("no-ops on a non-Node target (forged dispatch defense)", () => {
    const listener = jest.fn();
    subscribeShadowRootAttached(listener);

    document.dispatchEvent(
      new CustomEvent("abs:shadow-discover", {
        detail: { target: "not-a-node" },
      }),
    );
    document.dispatchEvent(new CustomEvent("abs:shadow-discover"));

    expect(listener).not.toHaveBeenCalled();
  });
});
