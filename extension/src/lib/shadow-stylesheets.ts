// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Adopt a CSSStyleSheet into every open shadow root in the document
// (existing + future). Document-scope styling is left to the caller's
// usual `<style>` injection — shadow trees are the asymmetric blind
// spot this helper fills.
//
// Why: document stylesheets do not cross shadow boundaries. The
// EasyList ad-hiding sheet (~13k selectors at module load) and the
// placeholder/reveal-button CSS are both injected as `<style>`
// elements at document scope today. Anything rendered inside a
// web-component shadow tree was either un-hidden (ads) or
// un-styled (placeholders). `adoptedStyleSheets` is the right
// primitive — one CSSStyleSheet shared by reference across every
// shadow root, so the cost is one parse and N register-pointer
// operations.
//
// Closed shadow roots are not reached (they aren't tracked) — the
// shadow-roots module only registers open ones, by design.

import {
  getOpenShadowRoots,
  subscribeShadowRootAttached,
} from "./shadow-roots";

export interface AdoptedShadowSheet {
  // Remove the sheet from every shadow root and stop adopting it
  // into future ones. Idempotent.
  remove: () => void;
}

function appendIfMissing(root: ShadowRoot, sheet: CSSStyleSheet): void {
  // Read-modify-write the array — assigning a new array is the only
  // way to mutate adoptedStyleSheets (it's a FrozenArray on production).
  if (root.adoptedStyleSheets.includes(sheet)) {
    return;
  }
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
}

function removeIfPresent(root: ShadowRoot, sheet: CSSStyleSheet): void {
  if (!root.adoptedStyleSheets.includes(sheet)) {
    return;
  }
  root.adoptedStyleSheets = root.adoptedStyleSheets.filter(
    (existing) => existing !== sheet,
  );
}

export function adoptStylesheetIntoShadowRoots(
  cssText: string,
): AdoptedShadowSheet {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(cssText);

  // Existing open shadow roots get the sheet immediately.
  for (const root of getOpenShadowRoots()) {
    appendIfMissing(root, sheet);
  }

  // Future attachments — subscribe once; the listener stays alive
  // until `remove` is called.
  const unsubscribe = subscribeShadowRootAttached((root) => {
    appendIfMissing(root, sheet);
  });

  let removed = false;
  return {
    remove() {
      if (removed) {
        return;
      }
      removed = true;
      unsubscribe();
      for (const root of getOpenShadowRoots()) {
        removeIfPresent(root, sheet);
      }
    },
  };
}
