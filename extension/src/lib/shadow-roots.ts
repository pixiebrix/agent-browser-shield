// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Track open shadow roots so the subtree watcher and token-index dispatcher
// can scan into them. Without this hook the rule pipeline is light-DOM only:
// MutationObserver does not cross shadow boundaries, querySelectorAll stops
// at the host, and document stylesheets don't apply inside shadow trees.
//
// Closed shadow roots ({mode: "closed"}) are deliberately not tracked. They
// are opt-out of external access by design; observing them would be hostile
// to widget authors who rely on the encapsulation contract. The patched
// attachShadow still returns the closed root to the caller untouched — we
// just don't add it to our registry.
//
// Content scripts run at document_idle, so any shadow attachments made during
// page parsing have already happened by the time we install the hook. Callers
// pair `installShadowRootHook()` with `discoverShadowRootsIn(document.body)`
// at startup to catch those.
//
// Declarative shadow DOM (`<template shadowrootmode="open">`) is consumed by
// the HTML parser without invoking `attachShadow`. Initial-parse DSD shadows
// are caught by the startup walk because by document_idle the parser has
// already materialized them and `host.shadowRoot` returns the open root. The
// remaining post-parse opt-in surface — `Element.prototype.setHTMLUnsafe` and
// `ShadowRoot.prototype.setHTMLUnsafe` — bypasses both `attachShadow` and the
// subtree-watcher's "host was just inserted" path (the receiver is already
// in the tree; only its children mutate). Those two methods are patched here
// to walk the receiver after the call so any newly-materialized open shadow
// is registered. Closed DSD is invisible by the same spec contract as
// imperative closed shadows.
//
// The patches above live in the isolated world. Page-script calls to
// `attachShadow` / `setHTMLUnsafe` go through the page's own prototype
// copies and never hit the isolated-world wraps. The main-world probe in
// `lib/shadow-root-probe-source.ts` (registered when
// `closed-shadow-root-annotate` is enabled) closes that gap by wrapping
// the same methods in the page world and dispatching an
// `abs:shadow-discover` CustomEvent on the document with
// `detail: { target }`. The listener here translates each event into a
// `discoverShadowRootsIn(target)` walk so subscribers see roots
// regardless of which world attached them.

const HOOK_INSTALLED = Symbol.for("abs.shadowRootHookInstalled");

const SHADOW_DISCOVER_EVENT = "abs:shadow-discover";

const openShadowRoots = new Set<ShadowRoot>();
const attachListeners = new Set<(root: ShadowRoot) => void>();

export function installShadowRootHook(): void {
  // One patch per realm. Idempotent so a subframe re-import or test re-run
  // doesn't stack patches on top of each other.
  const flagHolder = globalThis as unknown as Record<symbol, unknown>;
  if (flagHolder[HOOK_INSTALLED]) {
    return;
  }
  flagHolder[HOOK_INSTALLED] = true;

  // The bound method we replace is invoked as `this.attachShadow(init)` by
  // page scripts, so `this` lands on the host element naturally — the lint
  // warning about unbound-method binding doesn't apply to our trampoline.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const original = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function patched(
    this: Element,
    init: ShadowRootInit,
  ): ShadowRoot {
    const root = original.call(this, init);
    if (init.mode === "open") {
      registerShadowRoot(root);
    }
    return root;
  };

  patchSetHTMLUnsafe();
  installShadowDiscoverListener();
}

// Subscribes to `abs:shadow-discover` events dispatched by the main-world
// probe in `lib/shadow-root-probe-source.ts`. Each event carries the
// receiver node (host element or ShadowRoot) on `event.detail.target`;
// DOM-node references survive cross-realm in Chrome content scripts, so
// the handler can route the target straight through the existing
// `discoverShadowRootsIn` walk. The instanceof gate filters forged
// dispatches (any page can fire `abs:shadow-discover` with an arbitrary
// detail, but a non-Node target would no-op anyway — the check just
// avoids running the walk for clearly bogus payloads).
function installShadowDiscoverListener(): void {
  document.addEventListener(SHADOW_DISCOVER_EVENT, (event) => {
    // event.detail is typed `unknown` at the CustomEvent boundary; a
    // forged dispatch could omit it entirely, hence the explicit narrow.
    const detail = (event as CustomEvent<unknown>).detail as null | {
      target?: unknown;
    };
    const target = detail ? detail.target : undefined;
    if (target instanceof Node) {
      discoverShadowRootsIn(target);
    }
  });
}

// `setHTMLUnsafe` is the only post-parse opt-in path that honors declarative
// shadow DOM templates. Plain `innerHTML` drops them by spec. Patching both
// the Element and ShadowRoot variants covers the case where the receiver is
// itself already in the document: the page calls `host.setHTMLUnsafe(html)`,
// the parser attaches a shadow root on the receiver without ever invoking
// `attachShadow`, and the subtree-watcher's "host was just inserted" path
// never fires — the receiver's host record is unchanged, only its descendants
// mutated. The trampoline walks the receiver after the call so any new open
// shadow shows up in the registry and fans out to subscribers.
//
// `Document.parseHTMLUnsafe` returns a detached `Document`; any path that
// grafts its contents into the live tree goes through `appendChild` (which
// trips the subtree-watcher's discovery walk on the host) or another
// `setHTMLUnsafe`, so it does not need its own patch.
function patchSetHTMLUnsafe(): void {
  interface ElementSetHTMLUnsafeCapable {
    setHTMLUnsafe?: (this: Element, html: string) => void;
  }
  interface ShadowSetHTMLUnsafeCapable {
    setHTMLUnsafe?: (this: ShadowRoot, html: string) => void;
  }

  const elementProto = Element.prototype as ElementSetHTMLUnsafeCapable;
  const originalElementSet = elementProto.setHTMLUnsafe;
  if (typeof originalElementSet === "function") {
    elementProto.setHTMLUnsafe = function patched(
      this: Element,
      html: string,
    ): void {
      originalElementSet.call(this, html);
      // The receiver itself may have gained a shadow root (when the
      // top-level fragment is a `<template shadowrootmode>`), and any
      // descendant element may have gained one too — walk the whole
      // subtree from the receiver.
      discoverShadowRootsIn(this);
    };
  }

  const shadowProto = ShadowRoot.prototype as ShadowSetHTMLUnsafeCapable;
  const originalShadowSet = shadowProto.setHTMLUnsafe;
  if (typeof originalShadowSet === "function") {
    shadowProto.setHTMLUnsafe = function patched(
      this: ShadowRoot,
      html: string,
    ): void {
      originalShadowSet.call(this, html);
      // A shadow root cannot itself receive another shadow — only its
      // element descendants can. Walk from the shadow root so nested
      // DSD inside the new content is registered.
      discoverShadowRootsIn(this);
    };
  }
}

function registerShadowRoot(root: ShadowRoot): void {
  if (openShadowRoots.has(root)) {
    return;
  }
  openShadowRoots.add(root);
  for (const listener of attachListeners) {
    listener(root);
  }
}

// Walk a subtree (descending through any nested shadow roots) and register
// every open shadow root found. Used at watcher startup to capture roots
// attached before installShadowRootHook ran — and again whenever a host with
// a pre-populated shadow tree is inserted into the document.
//
// Returns every shadow root discovered on this call, regardless of whether
// it was already registered, so callers can attach observers without
// re-querying the registry.
export function discoverShadowRootsIn(root: Node): ShadowRoot[] {
  const discovered: ShadowRoot[] = [];
  const stack: Node[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }
    if (node instanceof Element && node.shadowRoot) {
      // shadowRoot is null for closed roots, so the open-only filter is
      // implicit.
      registerShadowRoot(node.shadowRoot);
      discovered.push(node.shadowRoot);
      stack.push(node.shadowRoot);
    }
    for (const child of node.childNodes) {
      stack.push(child);
    }
  }
  return discovered;
}

export function getOpenShadowRoots(): ReadonlySet<ShadowRoot> {
  return openShadowRoots;
}

export function subscribeShadowRootAttached(
  listener: (root: ShadowRoot) => void,
): () => void {
  attachListeners.add(listener);
  return () => {
    attachListeners.delete(listener);
  };
}

// Test-only: clear the registry and any subscribers. The attachShadow patch
// itself stays installed (re-patching across tests is unnecessary), but the
// state it builds up is reset so cases don't leak shadow roots into each
// other.
export function __resetShadowRootsForTesting(): void {
  openShadowRoots.clear();
  attachListeners.clear();
}
