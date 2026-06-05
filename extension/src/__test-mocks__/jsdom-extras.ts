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

// jsdom does not compute layout — every element reports offsetWidth/Height = 0.
// Page-tree treats that as "invisible" and strips the node. Override with a
// non-zero default so fixture markup makes it through the visibility filter;
// individual tests can still stub getBoundingClientRect for size-sensitive
// assertions.
Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
  configurable: true,
  get: () => 100,
});
Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
  configurable: true,
  get: () => 100,
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
