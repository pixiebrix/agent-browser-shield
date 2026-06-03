// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Page-world implementation shared between two delivery paths:
//
//   1. Dynamic content-script registration in the background worker
//      (`chrome.scripting.registerContentScripts` with `world: "MAIN"`
//      and `runAt: "document_start"`). This is the primary path for any
//      navigation that happens *after* the user enables the rule. The
//      probe runs before the page's own scripts and catches reads issued
//      during initial parse.
//
//   2. Inline `<script>` injection from the rule's `apply` at
//      `document_idle`. This is the fallback for the tab the user was
//      already viewing when they toggled the rule on — dynamic
//      registrations only take effect on subsequent navigations, so
//      without this fallback the current tab would have to be reloaded
//      to pick up the rule. The fallback misses early-parse reads, but
//      reads from `DOMContentLoaded`/`load` handlers and polled
//      fingerprinters are still caught.
//
// The function must not reference any module-scope identifiers — only
// the function body's source crosses into the page world (either as a
// serialized string for the inline fallback or via the bundled
// `webdriver-probe.js` entry point). The event name is hard-coded as a
// literal here and re-declared as a module constant in
// `rules/webdriver-probe-annotate.ts` for the isolated-world listener;
// the rule's tests assert the two agree.

export function installProbe(this: Window): void {
  const FLAG = "__abs_webdriver_probe_installed";
  const probeWindow = this as Window & Record<string, unknown>;
  if (probeWindow[FLAG]) {
    return;
  }
  probeWindow[FLAG] = true;
  const proto = Navigator.prototype;
  interface WebdriverDescriptor {
    enumerable?: boolean;
    get?: (this: Navigator) => boolean | undefined;
    set?: (this: Navigator, value: unknown) => void;
  }
  const original = Object.getOwnPropertyDescriptor(proto, "webdriver") as
    | WebdriverDescriptor
    | undefined;
  function wrappedGet(this: Navigator): boolean | undefined {
    try {
      document.dispatchEvent(new CustomEvent("abs:webdriver-probed"));
    } catch {
      // Some pages frame-bust by replacing CustomEvent; swallow and
      // continue so the page's read still returns the original value.
    }
    return original?.get?.call(this);
  }
  try {
    const descriptor: PropertyDescriptor = {
      configurable: true,
      enumerable: original?.enumerable ?? true,
      get: wrappedGet,
    };
    if (original?.set) {
      descriptor.set = original.set;
    }
    Object.defineProperty(proto, "webdriver", descriptor);
  } catch {
    // Non-configurable property — give up silently. The rule is
    // best-effort; a future Chrome that locks down Navigator.prototype
    // would simply disable detection on those pages.
  }
}
