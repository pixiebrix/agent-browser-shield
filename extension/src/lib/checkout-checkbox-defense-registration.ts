// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Background-side registration for the `checkout-checkbox-sanitize`
// rule's main-world defense. When the rule is enabled,
// `checkout-checkbox-defense.js` is registered via
// `chrome.scripting.registerContentScripts` with `world: "MAIN"` and
// `runAt: "document_start"` so the patched
// `HTMLInputElement.prototype.checked` setter is in place before any
// React/Vue bundle on the page caches the descriptor.
//
// When the rule is disabled (or enforcement is off), the registration is
// removed so future navigations get a clean prototype. Already-loaded
// tabs retain whatever wrap they had until the user reloads — same
// constraint as static content_scripts and as webdriver-probe.
//
// The rule's own `apply` covers the currently-open tab by asking the
// background worker (via an `inject-checkout-checkbox-defense` message)
// to run the defense through `chrome.scripting.executeScript` — dynamic
// registrations only take effect on subsequent navigations, so without
// that round-trip the user would have to reload the active tab. This
// module is purely the registration life-cycle for the standalone
// bundle.

import {
  getEnforcementEnabled,
  subscribeEnforcementEnabled,
} from "./enforcement";
import { log } from "./log";
import { getRuleStates, subscribe } from "./storage";

const SCRIPT_ID = "checkout-checkbox-sanitize-main-world";
const SCRIPT_FILE = "checkout-checkbox-defense.js";

async function shouldBeRegistered(): Promise<boolean> {
  const [states, enforcementEnabled] = await Promise.all([
    getRuleStates(),
    getEnforcementEnabled(),
  ]);
  return enforcementEnabled && Boolean(states["checkout-checkbox-sanitize"]);
}

async function isRegistered(): Promise<boolean> {
  try {
    const registered = await chrome.scripting.getRegisteredContentScripts({
      ids: [SCRIPT_ID],
    });
    return registered.length > 0;
  } catch (error) {
    // getRegisteredContentScripts throws if no script with the id exists
    // in some Chrome versions; treat that as "not registered" rather than
    // a failure mode that prevents registration.
    log.warn("checkout-checkbox-defense registration: getRegistered threw", {
      error,
    });
    return false;
  }
}

async function register(): Promise<void> {
  try {
    await chrome.scripting.registerContentScripts([
      {
        id: SCRIPT_ID,
        matches: ["<all_urls>"],
        js: [SCRIPT_FILE],
        runAt: "document_start",
        world: "MAIN",
        // allFrames: cart/checkout flows often render the payment widget
        // in a same-origin iframe (Stripe Checkout's embedded mode,
        // shop-hosted express-pay drawers). Same-origin iframes have
        // their own HTMLInputElement.prototype, so the wrap has to run
        // per-frame. Cross-origin iframes get the patch too but their
        // own document.location gates it via isCheckoutHref.
        allFrames: true,
        persistAcrossSessions: true,
      },
    ]);
    log.info(
      "checkout-checkbox-defense registered at document_start (main world)",
    );
  } catch (error) {
    log.error("checkout-checkbox-defense registration failed", { error });
  }
}

async function unregister(): Promise<void> {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
    log.info("checkout-checkbox-defense unregistered");
  } catch (error) {
    // Unregister fails if the script wasn't registered to begin with;
    // that's a benign state, not a problem.
    log.debug("checkout-checkbox-defense unregister no-op", { error });
  }
}

async function sync(): Promise<void> {
  const [target, current] = await Promise.all([
    shouldBeRegistered(),
    isRegistered(),
  ]);
  if (target === current) {
    return;
  }
  await (target ? register() : unregister());
}

// Wire up the registration life-cycle. Called once from background.ts.
export function startCheckoutCheckboxDefenseRegistration(): void {
  // Initial reconciliation when the service worker spins up — covers both
  // first install and SW restarts on Chrome's idle timer.
  void sync();
  subscribe(() => {
    void sync();
  });
  subscribeEnforcementEnabled(() => {
    void sync();
  });
}
