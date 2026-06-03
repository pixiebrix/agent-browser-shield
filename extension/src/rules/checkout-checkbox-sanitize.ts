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
// attribute mutations: once we've cleared a checkbox, re-checks by the
// agent/user must stick, or we'd be in a fight loop.

import { isCheckoutUrl } from "../lib/checkout-url";
import { CHECKOUT_CHECKBOX_CLEARED_ATTR as CLEARED_ATTR } from "../lib/dom-markers";
import { log } from "../lib/log";
import { createSubtreeWatcher } from "../lib/subtree-watcher";
import type { Rule } from "./types";

const RULE_ID = "checkout-checkbox-sanitize" as const;

// React/Vue track checked state internally; setting `.checked` directly skips
// their value-tracker, so onChange handlers never fire and totals don't
// recompute. Going through the prototype's native setter lets the framework
// observe the change.
// `set` is unbound here by design — we invoke it via `.call(checkbox, …)`
// below so `this` is the input element, not the descriptor.
// eslint-disable-next-line @typescript-eslint/unbound-method
const nativeCheckedSetter = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype,
  "checked",
)?.set;

function uncheck(checkbox: HTMLInputElement): void {
  nativeCheckedSetter?.call(checkbox, false);
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
