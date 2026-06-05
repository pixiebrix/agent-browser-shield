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

const HOOK_INSTALLED = Symbol.for("abs.shadowRootHookInstalled");

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
