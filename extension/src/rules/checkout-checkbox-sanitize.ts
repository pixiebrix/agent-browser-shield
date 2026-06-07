// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Uncheck every checkbox on checkout-like URLs so the agent inherits no
// silently pre-selected state (insurance, extended warranty, gift wrap,
// donations, expedited shipping, marketing opt-ins). The agent is then
// responsible for re-checking what it actually wants — including required
// agreements like terms-of-service or "ship to billing address".
//
// We re-scan added subtrees via a throttled MutationObserver so checkboxes
// in lazily-loaded checkout steps are caught. We deliberately do NOT observe
// attribute mutations on existing checkboxes via the watcher — the
// MutationObserver path would burn cycles on every class/style toggle.
// Defense against post-sanitize re-checks lives in the prototype setter
// patch below, which intercepts programmatic `.checked = true` writes on
// cleared boxes synchronously.

import { isCheckoutUrl } from "../lib/checkout-url";
import { CHECKOUT_CHECKBOX_CLEARED_ATTR as CLEARED_ATTR } from "../lib/dom-markers";
import { log } from "../lib/log";
import { createSubtreeWatcher } from "../lib/subtree-watcher";
import type { Rule } from "./types";

const RULE_ID = "checkout-checkbox-sanitize" as const;

// One patch per realm. Idempotent so a subframe re-import or test re-run
// doesn't stack patches on top of each other. Matches the convention used
// by `lib/shadow-roots.ts`.
const PATCH_INSTALLED = Symbol.for("abs.checkoutCheckedSetterPatched");

// React/Vue track checked state internally; setting `.checked` directly skips
// their value-tracker, so onChange handlers never fire and totals don't
// recompute. Going through the prototype's native setter lets the framework
// observe the change.
//
// Resolved lazily on first `apply` so this module is safe to import in
// DOM-less contexts (service worker, codegen). Touching
// `HTMLInputElement.prototype` at module top level used to crash the
// background worker bundle — see scripts/check-background-purity.ts.
//
// Captured before `installCheckedDefensePatch` overwrites the descriptor,
// so the rule's own `uncheck` always invokes the native setter directly
// rather than re-entering our wrapper.
let cachedNativeCheckedSetter:
  | ((this: HTMLInputElement, value: boolean) => void)
  | null
  | undefined;

function getNativeCheckedSetter():
  | ((this: HTMLInputElement, value: boolean) => void)
  | null {
  if (cachedNativeCheckedSetter !== undefined) {
    return cachedNativeCheckedSetter;
  }
  // `set` is unbound here by design — we invoke it via `.call(checkbox, …)`
  // below so `this` is the input element, not the descriptor.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "checked",
  )?.set;
  cachedNativeCheckedSetter = setter ?? null;
  return cachedNativeCheckedSetter;
}

// Defend a cleared checkbox against programmatic re-checks driven by the
// page itself — the dark-pattern threat model the rule was built for.
// React/Vue controlled inputs reconcile `.checked` from component state on
// every re-render; without this patch a single `setState({ optIn: true })`
// after our sanitize pass silently re-checks every pre-selected add-on.
//
// Activation gate:
//   - the target value is truthy (we never block unchecks),
//   - the input bears `CLEARED_ATTR` (so non-sanitized inputs — including
//     every text/radio/file input on the page — behave normally), and
//   - the current URL is still checkout-shaped (SPA navigation away from
//     checkout releases the lock).
//
// The marker is the source of truth: an agent that genuinely wants to
// re-check a sanitized box must either remove `[data-abs-cleared]` first
// or invoke `checkbox.click()`, which routes through the native activation
// behavior and bypasses the JS setter.
function installCheckedDefensePatch(): void {
  const flagHolder = globalThis as unknown as Record<symbol, unknown>;
  if (flagHolder[PATCH_INSTALLED]) {
    return;
  }
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "checked",
  );
  if (!descriptor?.configurable) {
    return;
  }
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const nativeSetter = descriptor.set;
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const nativeGetter = descriptor.get;
  if (!nativeSetter || !nativeGetter) {
    return;
  }
  // Seed the cache so `uncheck` calls the captured native setter directly
  // rather than discovering the now-patched descriptor on first read.
  cachedNativeCheckedSetter = nativeSetter;
  flagHolder[PATCH_INSTALLED] = true;

  Object.defineProperty(HTMLInputElement.prototype, "checked", {
    configurable: true,
    enumerable: descriptor.enumerable ?? true,
    get: nativeGetter,
    set(this: HTMLInputElement, value: boolean) {
      if (
        value &&
        this.getAttribute(CLEARED_ATTR) !== null &&
        isCheckoutUrl(globalThis.location.href)
      ) {
        nativeSetter.call(this, false);
        return;
      }
      nativeSetter.call(this, value);
    },
  });

  // Release the defense on genuine user interaction. Without this, a
  // controlled React/Vue checkbox would visibly flicker on a real click:
  // native activation toggles `.checked` to true (bypassing our setter),
  // the framework's onChange schedules `setState(true)` → reconcile →
  // `node.checked = true`, and the patch would revert to false because
  // the marker is still present. Running in capture phase guarantees
  // the marker is gone before any framework handler runs, so the
  // framework's reconcile sticks.
  document.addEventListener("change", handleUserChangeEvent, {
    capture: true,
  });
}

// Gated on `isTrusted` so synthetic dispatches from page scripts
// (including our own `uncheck` change event and any `element.click()`
// call from page JS) do not release the lock — only real user gestures
// and WebDriver/CDP-driven clicks do. Exported under a test-only name
// because jsdom installs `isTrusted` as an unforgeable per-instance
// property, so the integration listener is not reachable from a unit
// test that constructs a synthetic "trusted" event — we call the
// handler directly instead.
function handleUserChangeEvent(event: Event): void {
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
}

export const __handleUserChangeEventForTesting = handleUserChangeEvent;

function uncheck(checkbox: HTMLInputElement): void {
  getNativeCheckedSetter()?.call(checkbox, false);
  checkbox.dispatchEvent(new Event("input", { bubbles: true }));
  checkbox.dispatchEvent(new Event("change", { bubbles: true }));
  checkbox.setAttribute(CLEARED_ATTR, "");
}

function scanAndClear(root: ParentNode): void {
  if (!isCheckoutUrl(globalThis.location.href)) {
    return;
  }

  const checkboxes = root.querySelectorAll<HTMLInputElement>(
    `input[type="checkbox"]:checked:not(:disabled):not([${CLEARED_ATTR}])`,
  );

  let cleared = 0;
  for (const checkbox of checkboxes) {
    if (!checkbox.isConnected) {
      continue;
    }
    uncheck(checkbox);
    cleared++;
  }

  if (cleared > 0) {
    log("checkout checkboxes cleared", {
      count: cleared,
      url: globalThis.location.href,
    });
  }
}

// childList only — we must not react to attribute mutations on existing
// checkboxes, or we'd undo any re-check the agent/user performs. The shared
// watcher observes { childList: true, subtree: true } which is exactly what
// we want.
const watcher = createSubtreeWatcher({
  onSubtrees: (roots) => {
    for (const root of roots) {
      scanAndClear(root);
    }
  },
});

function apply(root: ParentNode): void {
  installCheckedDefensePatch();
  scanAndClear(root);
  watcher.start(root);
}

export const checkoutCheckboxSanitizeRule = {
  id: RULE_ID,
  label: "Clear Checkout Checkboxes",
  description:
    "On checkout pages, uncheck pre-checked checkboxes so the agent doesn't silently inherit add-ons or marketing opt-ins.",
  apply,
  teardown: () => {
    watcher.stop();
  },
} satisfies Rule;
