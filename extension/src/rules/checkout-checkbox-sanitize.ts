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
//
// Defense against post-sanitize re-checks (the dark-pattern threat model
// the rule was built for) lives in a separate page-world bundle:
// `lib/checkout-checkbox-defense-source.ts`, registered by the background
// worker at `document_start` whenever this rule is enabled. The
// isolated-world prototype that a content script can reach is a distinct
// object from the page world's copy that React/Vue reconciles drive
// `node.checked = true` through, so the wrap MUST live in the page
// world. This rule's `apply` sends an `inject-checkout-checkbox-defense`
// message at `document_idle` so the tab the user was already viewing
// when they toggled the rule on also gets the patch — dynamic
// registrations only apply to future navigations.

import { isCheckoutUrl } from "../lib/checkout-url";
import { CHECKOUT_CHECKBOX_CLEARED_ATTR as CLEARED_ATTR } from "../lib/dom-markers";
import { log } from "../lib/log";
import { createSubtreeWatcher } from "../lib/subtree-watcher";
import type { Rule } from "./types";

const RULE_ID = "checkout-checkbox-sanitize" as const;

const INJECT_DEFENSE_MESSAGE = {
  type: "inject-checkout-checkbox-defense",
} as const;

// React/Vue track checked state internally; setting `.checked` directly skips
// their value-tracker, so onChange handlers never fire and totals don't
// recompute. Going through the prototype's native setter lets the framework
// observe the change.
//
// Resolved lazily on first `apply` so this module is safe to import in
// DOM-less contexts (service worker, codegen). Touching
// `HTMLInputElement.prototype` at module top level used to crash the
// background worker bundle — see scripts/check-background-purity.ts.
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

function requestDefenseInjection(): void {
  // Service worker may be asleep / receiver not yet ready; swallow rejection
  // so unhandled-promise warnings don't surface on every page load. The
  // defense itself short-circuits on `__abs_checkout_checkbox_defense_installed`,
  // so re-requests on the same document are no-ops in the page world.
  chrome.runtime.sendMessage(INJECT_DEFENSE_MESSAGE).catch(() => {
    // noop
  });
}

function apply(root: ParentNode): void {
  requestDefenseInjection();
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

export { INJECT_DEFENSE_MESSAGE };
