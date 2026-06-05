// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Inject a `display:none !important` stylesheet for a known list of static
// selectors, and adopt the same sheet into every open shadow root. Used by
// hide rules whose matches need no JS-side processing (no placeholder UI,
// no per-element side effects, no candidate filtering) — the CSS engine
// matches and hides for us, even for lazily-injected nodes, with no
// MutationObserver on our side.

import type { AdoptedShadowSheet } from "./shadow-stylesheets";
import { adoptStylesheetIntoShadowRoots } from "./shadow-stylesheets";

export interface HideStylesheet {
  // Tear down the document-scope <style> element and stop adopting the
  // sheet into shadow roots. Idempotent.
  remove: () => void;
}

export interface InjectHideStylesheetOptions {
  // DOM id stamped on the injected <style>. Used for re-entry idempotence
  // and for orphan cleanup if a previous instance survived without
  // teardown (e.g., navigation interrupted before teardown ran).
  elementId: string;
  selectors: readonly string[];
}

export function injectHideStylesheet(
  options: InjectHideStylesheetOptions,
): HideStylesheet {
  const { elementId, selectors } = options;
  const cssText = selectors
    .map((selector) => `${selector}{display:none!important}`)
    .join("\n");

  let styleElement: HTMLStyleElement | null = null;
  let adoptedSheet: AdoptedShadowSheet | null = null;

  function inject(): void {
    if (styleElement?.isConnected) {
      return;
    }
    const element = document.createElement("style");
    element.id = elementId;
    element.textContent = cssText;
    document.head.append(element);
    styleElement = element;
    // Document stylesheets do not cross shadow boundaries — anything
    // rendered inside a web-component shadow tree would otherwise stay
    // visible. The adopted-shadow-sheet path shares one CSSStyleSheet
    // across every open shadow root (existing + future).
    //
    // The `isConnected` guard above allows re-entry when page JS removed
    // our <style>; the prior adoptedSheet may still be live, so tear it
    // down before re-adopting to avoid leaking the
    // subscribeShadowRootAttached listener.
    adoptedSheet?.remove();
    adoptedSheet = adoptStylesheetIntoShadowRoots(cssText);
  }

  inject();

  return {
    remove() {
      styleElement?.remove();
      styleElement = null;
      adoptedSheet?.remove();
      adoptedSheet = null;
      // Defensive: drop any orphaned <style> from a prior apply whose
      // teardown didn't fire (e.g., page navigated mid-teardown).
      for (const element of document.querySelectorAll(`#${elementId}`)) {
        element.remove();
      }
    },
  };
}
