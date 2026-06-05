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
