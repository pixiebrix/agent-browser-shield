// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Page-world (main-world) probe over the shadow-root attachment surface.
// The isolated-world hook in `lib/shadow-roots.ts` patches the same
// methods on the isolated copy of `Element.prototype` / `ShadowRoot.prototype`,
// but a page script that calls `host.attachShadow(...)` or
// `host.setHTMLUnsafe(...)` hits the *page*'s prototypes — a distinct
// object from the one the content script sees. Without this probe in the
// page world, the patches in `shadow-roots.ts` only fire for the
// content-script's own calls and the jsdom-shimmed test paths.
//
// Two outputs cover the rule pipeline's two needs:
//
//   1. Closed-shadow attachment detection (`abs:closed-shadow-attached`).
//      `closed-shadow-root-annotate` consumes this for a definitive
//      "closed shadow root attached" signal that supersedes the
//      heuristic walk and lifts the structural-shape false positives
//      (canvas-rendered custom elements, `::before` decorations, etc.).
//      No detail is sent — closed shadow contents must remain opaque to
//      every isolated-world consumer; only the binary signal crosses.
//
//   2. Open-shadow / DSD discovery (`abs:shadow-discover`). Dispatched
//      with `detail: { target }` where `target` is the receiver node
//      (host element for attachShadow + Element.setHTMLUnsafe;
//      ShadowRoot for ShadowRoot.setHTMLUnsafe). DOM-node references
//      survive cross-realm in Chrome content scripts, so the
//      isolated-world handler in `shadow-roots.ts` reads
//      `event.detail.target` and routes it through `discoverShadowRootsIn`.
//
// Shared between two delivery paths, mirroring the webdriver-probe /
// checkout-checkbox-defense pattern:
//
//   1. Dynamic content-script registration in the background worker
//      (`chrome.scripting.registerContentScripts` with `world: "MAIN"`
//      and `runAt: "document_start"`). Primary path for any navigation
//      that happens *after* the user enables `closed-shadow-root-annotate`.
//      Runs before the page's first script, so attachments issued during
//      initial HTML parse and from `document_start` framework bundles
//      are caught.
//
//   2. On-demand `chrome.scripting.executeScript` with `world: "MAIN"`,
//      driven by the rule's `apply` sending an
//      `inject-shadow-root-probe` message at `document_idle`. Covers
//      the tab the user was already viewing when they toggled the rule
//      on (dynamic registrations only take effect on subsequent
//      navigations). The fallback misses early-parse attachments, but
//      attachments from `DOMContentLoaded` / `load` handlers, custom
//      element upgrades, and post-hydration `setHTMLUnsafe` are still
//      caught.
//
// The function must not reference any module-scope identifiers — only
// the function body's source crosses into the page world (either via
// `executeScript({ func })` from the background worker or via the
// bundled `shadow-root-probe.js` entry point). Event names are
// hard-coded here as literals and re-declared as module constants in
// the consumers; tests assert the two agree.

export function installShadowRootProbe(this: Window): void {
  const FLAG = "__abs_shadow_root_probe_installed";
  const probeWindow = this as Window & Record<string, unknown>;
  if (probeWindow[FLAG]) {
    return;
  }
  probeWindow[FLAG] = true;

  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalAttachShadow = Element.prototype.attachShadow;
  try {
    Element.prototype.attachShadow = function patched(
      this: Element,
      init: ShadowRootInit,
    ): ShadowRoot {
      const root = originalAttachShadow.call(this, init);
      try {
        if (init.mode === "closed") {
          document.dispatchEvent(new CustomEvent("abs:closed-shadow-attached"));
        } else {
          document.dispatchEvent(
            new CustomEvent("abs:shadow-discover", {
              detail: { target: this },
            }),
          );
        }
      } catch {
        // Some pages frame-bust by replacing CustomEvent or dispatchEvent;
        // swallow and continue so the page's attachShadow result is
        // returned untouched.
      }
      return root;
    };
  } catch {
    // Element.prototype.attachShadow may be locked non-writable in a
    // future hardening; give up silently rather than break the page.
  }

  interface ElementSetHTMLUnsafeCapable {
    setHTMLUnsafe?: (this: Element, html: string) => void;
  }
  interface ShadowSetHTMLUnsafeCapable {
    setHTMLUnsafe?: (this: ShadowRoot, html: string) => void;
  }

  const elementProto = Element.prototype as ElementSetHTMLUnsafeCapable;
  const originalElementSet = elementProto.setHTMLUnsafe;
  if (typeof originalElementSet === "function") {
    try {
      elementProto.setHTMLUnsafe = function patched(
        this: Element,
        html: string,
      ): void {
        originalElementSet.call(this, html);
        try {
          document.dispatchEvent(
            new CustomEvent("abs:shadow-discover", {
              detail: { target: this },
            }),
          );
        } catch {
          // see attachShadow note
        }
      };
    } catch {
      // setHTMLUnsafe was sealed; give up silently.
    }
  }

  const shadowProto = ShadowRoot.prototype as ShadowSetHTMLUnsafeCapable;
  const originalShadowSet = shadowProto.setHTMLUnsafe;
  if (typeof originalShadowSet === "function") {
    try {
      shadowProto.setHTMLUnsafe = function patched(
        this: ShadowRoot,
        html: string,
      ): void {
        originalShadowSet.call(this, html);
        try {
          document.dispatchEvent(
            new CustomEvent("abs:shadow-discover", {
              detail: { target: this },
            }),
          );
        } catch {
          // see attachShadow note
        }
      };
    } catch {
      // see Element.setHTMLUnsafe note
    }
  }
}
