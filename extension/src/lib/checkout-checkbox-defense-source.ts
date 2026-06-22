// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Page-world (main-world) implementation of the checkout-checkbox-sanitize
// defense. The rule itself runs in the isolated world and stamps
// `[data-abs-cleared]` onto every checkbox it unchecks; this source
// holds that state against page-script re-checks by wrapping
// `HTMLInputElement.prototype.checked`. The wrap MUST live in the page
// world — React/Vue reconciles drive `node.checked = true` through the
// page world's own copy of the prototype, which is a distinct object
// from the one a content script sees in its isolated world. Patching
// the isolated-world copy is a no-op for the threat model.
//
// Shared between two delivery paths, mirroring the webdriver-probe
// pattern:
//
//   1. Dynamic content-script registration in the background worker
//      (`chrome.scripting.registerContentScripts` with `world: "MAIN"`
//      and `runAt: "document_start"`). The primary path for any
//      navigation that happens *after* the user enables the rule —
//      the patch lands before the page's own scripts cache the
//      `.checked` setter.
//
//   2. On-demand `chrome.scripting.executeScript` with `world: "MAIN"`,
//      driven by the rule's `apply` sending an
//      `inject-checkout-checkbox-defense` message at `document_idle`.
//      Covers the tab the user was already viewing when they toggled
//      the rule on (dynamic registrations only take effect on subsequent
//      navigations). `executeScript` with `world: "MAIN"` is exempt
//      from page CSP the same way the registered content script is, so
//      strict `script-src` origins still get the patch.
//
// The function must not reference any module-scope identifiers — only
// the function body's source crosses into the page world (either via
// `executeScript({ func })` from the background worker or via the
// bundled `checkout-checkbox-defense.js` entry point). The marker
// string is hard-coded as a literal here and re-declared as
// `CHECKOUT_CHECKBOX_CLEARED_ATTR` in `lib/dom-markers.ts` for the
// isolated-world rule; a test asserts the two agree.

export function installCheckoutCheckboxDefense(this: Window): void {
  const FLAG = "__abs_checkout_checkbox_defense_installed";
  const defenseWindow = this as Window & Record<string, unknown>;
  if (defenseWindow[FLAG]) {
    return;
  }
  defenseWindow[FLAG] = true;

  // Mirror of CHECKOUT_CHECKBOX_CLEARED_ATTR from lib/dom-markers.ts.
  // Hard-coded because this function runs in the page world with no
  // module imports; the isolated-world rule and the markers registry
  // share the same literal, asserted by a unit test. The lint rule that
  // bans inline `data-abs-*` literals exists to keep the registry the
  // single source of truth — this is the one principled exception.
  // eslint-disable-next-line no-restricted-syntax
  const CLEARED_ATTR = "data-abs-cleared";

  // Mirror of the URLPattern set in lib/checkout-url.ts as a single
  // anchored regex. `/cart`, `/cart/`, `/cart/sub` match; `/cartx`,
  // `/products/cart-bag`, `/orders` do not. Asserted against the rule's
  // `isCheckoutUrl` in a parity test.
  const CHECKOUT_PATH_RE =
    /^\/(?:cart|checkout|basket|bag|payment|order)(?:\/.*)?$/;

  function isCheckoutHref(href: string): boolean {
    try {
      return CHECKOUT_PATH_RE.test(new URL(href).pathname);
    } catch {
      return false;
    }
  }

  interface CheckedDescriptor {
    enumerable?: boolean;
    configurable?: boolean;
    get?: (this: HTMLInputElement) => boolean;
    set?: (this: HTMLInputElement, value: boolean) => void;
  }

  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "checked",
  ) as CheckedDescriptor | undefined;
  if (!descriptor?.configurable || !descriptor.set || !descriptor.get) {
    // Non-configurable or partial descriptor — give up silently. A
    // future Chrome locking down HTMLInputElement.prototype would
    // disable the defense rather than block the page.
    return;
  }
  const nativeSetter = descriptor.set;
  const nativeGetter = descriptor.get;

  try {
    Object.defineProperty(HTMLInputElement.prototype, "checked", {
      configurable: true,
      enumerable: descriptor.enumerable ?? true,
      get: nativeGetter,
      set(this: HTMLInputElement, value: boolean) {
        if (
          value &&
          this.getAttribute(CLEARED_ATTR) !== null &&
          isCheckoutHref(location.href)
        ) {
          nativeSetter.call(this, false);
          return;
        }
        nativeSetter.call(this, value);
      },
    });
  } catch {
    // defineProperty can throw if another script has already locked
    // the descriptor non-configurable since we read it; treat as the
    // same opt-out path as the descriptor guard above.
    return;
  }

  // Release the defense on genuine user interaction. Without this, a
  // controlled React/Vue checkbox would visually flicker on a real-user
  // click — native activation toggles `.checked` to true (bypassing our
  // setter), the framework's bubble-phase onChange schedules
  // `setState(true)` → reconcile → `node.checked = true`, and the patch
  // would revert that reconcile because the marker is still present.
  // Capture-phase placement guarantees the marker is gone before any
  // framework handler runs. Gated on `isTrusted` so page-script
  // dispatches (including the rule's own isolated-world `change` event)
  // do not release the lock.
  document.addEventListener(
    "change",
    (event) => {
      if (!event.isTrusted) {
        return;
      }
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.type !== "checkbox") {
        return;
      }
      if (target.getAttribute(CLEARED_ATTR) !== null) {
        target.removeAttribute(CLEARED_ATTR);
      }
    },
    { capture: true },
  );
}
