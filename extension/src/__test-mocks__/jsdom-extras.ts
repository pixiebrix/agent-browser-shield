// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Shared polyfills/stubs for browser APIs that jsdom either omits or returns
// degenerate values for. Wired up via `setupFiles` in `jest.config.cjs` so
// every test file runs through this before any test code executes.
//
// Add new stubs here when a test reaches for an inline `Object.defineProperty`
// or `Element.prototype.x = …` workaround — keep them out of individual test
// files so the workaround set lives in one place.

// Element.checkVisibility (Baseline 2023) is used by page-tree to filter out
// non-rendered nodes. jsdom hasn't shipped it; install a "visible" stub so
// visibility filtering falls through to the box-dimension check below. The
// lib types declare the method as always present, so an `if (!…)` guard reads
// as "always falsy" — assign unconditionally via defineProperty instead.
Object.defineProperty(Element.prototype, "checkVisibility", {
  configurable: true,
  writable: true,
  value: function checkVisibility(): boolean {
    return true;
  },
});

// jsdom 26's globalThis doesn't expose `structuredClone` to the test world
// even though the underlying Node runtime ships it natively. `fake-indexeddb`
// uses structuredClone to clone values on insertion, so debug-trace-store
// tests trip a ReferenceError without this bridge.
interface GlobalWithStructuredClone {
  structuredClone?: <T>(value: T) => T;
}
const globalWithClone = globalThis as GlobalWithStructuredClone;
if (typeof globalWithClone.structuredClone !== "function") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const v8 = require("node:v8") as {
    deserialize: (buffer: Buffer) => unknown;
    serialize: (value: unknown) => Buffer;
  };
  globalWithClone.structuredClone = <T>(value: T): T =>
    v8.deserialize(v8.serialize(value)) as T;
}

// jsdom does not compute layout — every element reports offsetWidth/Height = 0.
// Page-tree treats that as "invisible" and strips the node. Override with a
// non-zero default so fixture markup makes it through the visibility filter;
// individual tests can still stub getBoundingClientRect for size-sensitive
// assertions.
Object.defineProperties(HTMLElement.prototype, {
  offsetHeight: {
    configurable: true,
    get: () => 100,
  },
  offsetWidth: {
    configurable: true,
    get: () => 100,
  },
});

// Constructable stylesheets + adoptedStyleSheets — Baseline 2023, fully
// supported in the Chrome MV3 versions we target. jsdom has not shipped
// them. The minimum surface the extension actually uses:
//   - new CSSStyleSheet()
//   - sheet.replaceSync(cssText)
//   - document.adoptedStyleSheets  (array of CSSStyleSheet)
//   - shadowRoot.adoptedStyleSheets
//
// We polyfill just enough for tests to introspect adoption (was this
// sheet added to that root?) and to read back the text the production
// code passed to replaceSync. We don't parse the CSS — no consumer
// reads `cssRules` or matches against the DOM through it.
interface GlobalWithSheet {
  CSSStyleSheet: typeof CSSStyleSheet;
}
const globalWithSheet = globalThis as unknown as GlobalWithSheet;
interface ReplaceSyncCapable {
  replaceSync?: (text: string) => void;
}
// jsdom may expose the constructor without `replaceSync` on its
// prototype — gate the polyfill on the method, which is what
// production code calls.
const existingProto = globalWithSheet.CSSStyleSheet
  .prototype as ReplaceSyncCapable;
if (typeof existingProto.replaceSync !== "function") {
  class PolyfillCSSStyleSheet {
    cssText = "";
    replaceSync(text: string): void {
      this.cssText = text;
    }
    replace(text: string): Promise<void> {
      this.cssText = text;
      return Promise.resolve();
    }
  }
  globalWithSheet.CSSStyleSheet =
    PolyfillCSSStyleSheet as unknown as typeof CSSStyleSheet;
}

const adoptedStyleSheetsByOwner = new WeakMap<object, unknown[]>();

function defineAdoptedStyleSheets(target: object): void {
  Object.defineProperty(target, "adoptedStyleSheets", {
    configurable: true,
    get(this: object) {
      return adoptedStyleSheetsByOwner.get(this) ?? [];
    },
    set(this: object, value: unknown[]) {
      adoptedStyleSheetsByOwner.set(this, [...value]);
    },
  });
}

if (!("adoptedStyleSheets" in Document.prototype)) {
  defineAdoptedStyleSheets(Document.prototype);
}
if (!("adoptedStyleSheets" in ShadowRoot.prototype)) {
  defineAdoptedStyleSheets(ShadowRoot.prototype);
}

// setHTMLUnsafe / declarative shadow DOM — Baseline 2024, present in the
// Chrome MV3 versions we target. jsdom 26 hasn't shipped it. The
// production code in `shadow-roots.ts` patches both Element and
// ShadowRoot variants; tests need the underlying method on the prototype
// so the patch has something to wrap and so callers (test fixtures,
// integration tests) can drive the DSD path.
//
// This polyfill emulates only the surface our tests exercise:
//
//   - Parse the HTML into a throwaway staging element with `innerHTML`.
//     innerHTML preserves `<template>` elements and stashes their
//     children in `template.content` — exactly the shape the parser
//     uses ahead of DSD lifting.
//   - For top-level `<template shadowrootmode="open"|"closed">` (parent
//     is the staging element), `attachShadow` on the **receiver** in
//     the requested mode and move the template content into the new
//     shadow root.
//   - For nested `<template shadowrootmode>` (parent is some other
//     element in the parsed tree), `attachShadow` on the parent
//     element and move the template content into its new shadow root.
//   - Both passes recurse into `template.content` first so DSD inside
//     DSD is materialized child-first.
//   - The remaining (non-template, non-shadow) staging children
//     replace the receiver's children.
//
// Limitations vs. the real parser:
//   - `shadowrootdelegatesfocus`, `shadowrootclonable`, and
//     `shadowrootserializable` attributes are ignored — none of our
//     tests assert on those.
//   - A duplicate top-level DSD template of the same mode is dropped
//     (the real parser handles the second one as ordinary fragment
//     content, but our tests never produce duplicates).
//
// Note on test-environment interaction: the polyfill calls
// `attachShadow` to materialize DSD shadows. `attachShadow` is itself
// patched by the production code under test, so in tests the registry
// also fills via the attachShadow path. This is fine — the production
// `setHTMLUnsafe` trampoline's `discoverShadowRootsIn` call is
// idempotent against the registry. In real browsers the parser
// materializes DSD without going through `attachShadow`, which is the
// gap the trampoline closes.
//
// Gated on the absence of the native method so a future jsdom upgrade
// that ships DSD natively will use the engine implementation.
interface SetHTMLUnsafeCapable {
  setHTMLUnsafe?: (this: Element | ShadowRoot, html: string) => void;
}

function attachDSDShadow(host: Element, template: HTMLTemplateElement): void {
  const mode = template.getAttribute("shadowrootmode");
  if (mode !== "open" && mode !== "closed") {
    template.remove();
    return;
  }
  // Recurse into the template's content first so any nested DSD is
  // lifted before the outer shadow swallows the subtree.
  liftNestedDSD(template.content);
  let shadow: ShadowRoot;
  try {
    shadow = host.attachShadow({ mode });
  } catch {
    // Host already has a shadow root attached. Fall back to it when
    // accessible (open mode) and otherwise drop the template content —
    // matches the spec's "ignore duplicate" outcome for closed.
    const existing = host.shadowRoot;
    if (!existing) {
      template.remove();
      return;
    }
    shadow = existing;
  }
  shadow.append(template.content);
  template.remove();
}

function liftNestedDSD(root: ParentNode): void {
  // Walk the document tree under `root` (NOT into `template.content`,
  // which is its own off-tree fragment — attachDSDShadow handles those
  // by recursing explicitly).
  const stack: ParentNode[] = [root];
  const templates: HTMLTemplateElement[] = [];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }
    for (const child of node.children) {
      if (
        child instanceof HTMLTemplateElement &&
        child.hasAttribute("shadowrootmode")
      ) {
        templates.push(child);
        // Do not descend through the template — its children live in
        // `.content`, which `attachDSDShadow` walks separately.
        continue;
      }
      stack.push(child);
    }
  }
  for (const template of templates) {
    const parent = template.parentElement;
    if (parent) {
      attachDSDShadow(parent, template);
    } else {
      template.remove();
    }
  }
}

function polyfilledSetHTMLUnsafe(
  this: Element | ShadowRoot,
  html: string,
): void {
  const ownerDocument = this.ownerDocument;
  const staging = ownerDocument.createElement("div");
  staging.innerHTML = html;

  // Top-level DSD templates (direct children of staging) attach shadows
  // on the receiver, not on staging. ShadowRoot receivers can't host a
  // shadow of their own — drop those templates' DSD intent but keep
  // their content as ordinary children.
  //
  // Collect templates in one pass before mutating; iterating an
  // HTMLCollection while removing its members skips siblings.
  const topLevelTemplates: HTMLTemplateElement[] = [];
  for (const child of staging.children) {
    if (
      child instanceof HTMLTemplateElement &&
      child.hasAttribute("shadowrootmode")
    ) {
      topLevelTemplates.push(child);
    }
  }
  for (const child of topLevelTemplates) {
    if (this instanceof Element) {
      attachDSDShadow(this, child);
    } else {
      // ShadowRoot receiver — flatten the template's content into the
      // staging so downstream copy moves it into the shadow root.
      liftNestedDSD(child.content);
      child.replaceWith(child.content);
    }
  }

  // Descendant DSD templates attach on their immediate parents.
  liftNestedDSD(staging);

  // Replace the receiver's children with the processed staging contents.
  this.replaceChildren();
  while (staging.firstChild) {
    this.append(staging.firstChild);
  }
}

const elementProtoForSet = Element.prototype as SetHTMLUnsafeCapable;
if (typeof elementProtoForSet.setHTMLUnsafe !== "function") {
  Object.defineProperty(Element.prototype, "setHTMLUnsafe", {
    configurable: true,
    writable: true,
    value: polyfilledSetHTMLUnsafe,
  });
}

const shadowProtoForSet = ShadowRoot.prototype as SetHTMLUnsafeCapable;
if (typeof shadowProtoForSet.setHTMLUnsafe !== "function") {
  Object.defineProperty(ShadowRoot.prototype, "setHTMLUnsafe", {
    configurable: true,
    writable: true,
    value: polyfilledSetHTMLUnsafe,
  });
}
