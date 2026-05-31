// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Detect whether the current document is the top-level browsing context.
//
// With `all_frames: true` in the manifest, the content script runs once per
// frame (top frame + every same-origin iframe + every cross-origin iframe
// whose URL is covered by the manifest's `matches`). Most defenses make sense
// in every frame — PII in a reviews iframe is just as sensitive as PII on the
// host page — but a few are inherently top-frame concepts (the site footer,
// cookie/newsletter overlays, the per-host search-URL recipe, the floating
// options badge). Those rules opt into top-frame-only behavior via the rule
// definition; this helper is the single source of truth for the check.
//
// Accessing `window.top` from a cross-origin iframe throws a SecurityError on
// some properties, but the strict equality check between the `Window` proxy
// returned by `window.top` and the local `window` is allowed and behaves
// correctly (returns false for any nested frame).
export function isTopFrame(): boolean {
  try {
    // Comparison must use `window`, not `globalThis` — TypeScript types the
    // latter as `typeof globalThis`, which doesn't overlap with the `Window`
    // returned by `window.top`.
    // eslint-disable-next-line unicorn/prefer-global-this
    return window === window.top;
  } catch {
    // Defensive fallback — if even the equality check throws, we are
    // definitionally not the top frame.
    return false;
  }
}
