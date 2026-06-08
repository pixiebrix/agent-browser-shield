// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Background-side registration for the `closed-shadow-root-annotate`
// rule's main-world probe. When the rule is enabled, `shadow-root-probe.js`
// is registered via `chrome.scripting.registerContentScripts` with
// `world: "MAIN"` and `runAt: "document_start"` so the wraps over
// `Element.prototype.attachShadow` / `setHTMLUnsafe` land before any
// page script that attaches shadow roots during initial parse.
//
// `allFrames: true` because shadow roots can be attached in any frame and
// same-origin iframes have their own copies of those prototypes. Each
// frame's probe wraps its own world-local prototypes — there is no
// cross-frame sharing the way same-origin documents share scriptable
// global state.
//
// When the rule is disabled (or enforcement is off), the registration is
// removed so future navigations get clean prototypes. Already-loaded
// tabs retain whatever wrap they had until the user reloads — same
// constraint as static content_scripts and as the sibling
// `webdriver-probe` / `checkout-checkbox-defense` registrations.
//
// The rule's own `apply` covers the currently-open tab by asking the
// background worker (via an `inject-shadow-root-probe` message) to run
// the probe through `chrome.scripting.executeScript` — dynamic
// registrations only take effect on subsequent navigations, so without
// that round-trip the user would have to reload the active tab. This
// module is purely the registration life-cycle for the standalone bundle.

import {
  getEnforcementEnabled,
  subscribeEnforcementEnabled,
} from "./enforcement";
import { log } from "./log";
import { getRuleStates, subscribe } from "./storage";

const SCRIPT_ID = "closed-shadow-root-annotate-main-world";
const SCRIPT_FILE = "shadow-root-probe.js";

async function shouldBeRegistered(): Promise<boolean> {
  const [states, enforcementEnabled] = await Promise.all([
    getRuleStates(),
    getEnforcementEnabled(),
  ]);
  return enforcementEnabled && Boolean(states["closed-shadow-root-annotate"]);
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
    log.warn("shadow-root-probe registration: getRegistered threw", { error });
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
        // allFrames: shadow roots attach inside any frame, and each frame
        // has its own copy of Element.prototype / ShadowRoot.prototype.
        // Without per-frame injection, attachments in same-origin
        // subframes would still bypass the probe.
        allFrames: true,
        persistAcrossSessions: true,
      },
    ]);
    log.info("shadow-root-probe registered at document_start (main world)");
  } catch (error) {
    log.error("shadow-root-probe registration failed", { error });
  }
}

async function unregister(): Promise<void> {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
    log.info("shadow-root-probe unregistered");
  } catch (error) {
    // Unregister fails if the script wasn't registered to begin with;
    // that's a benign state, not a problem.
    log.debug("shadow-root-probe unregister no-op", { error });
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
export function startShadowRootProbeRegistration(): void {
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
