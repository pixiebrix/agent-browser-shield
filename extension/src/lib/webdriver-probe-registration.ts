// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Background-side registration for the `webdriver-probe-annotate` rule's
// main-world probe. When the rule is enabled, `webdriver-probe.js` is
// registered via `chrome.scripting.registerContentScripts` with
// `world: "MAIN"` and `runAt: "document_start"` so the probe runs on
// subsequent navigations before the page's first script — the only way to
// catch `navigator.webdriver` reads issued during initial HTML parse.
//
// When the rule is disabled (or enforcement is off), the registration is
// removed so future navigations get a clean Navigator.prototype. The
// already-loaded tabs retain whatever wrap they had until the user
// reloads — same constraint as static content_scripts.
//
// The rule's own `apply` still inline-injects the probe as a fallback for
// the currently-open tab (since dynamic registrations only take effect on
// subsequent navigations). This module is purely the registration
// life-cycle for the standalone bundle.

import {
  getEnforcementEnabled,
  subscribeEnforcementEnabled,
} from "./enforcement";
import { log } from "./log";
import { getRuleStates, subscribe } from "./storage";

const SCRIPT_ID = "webdriver-probe-annotate-main-world";
const SCRIPT_FILE = "webdriver-probe.js";

async function shouldBeRegistered(): Promise<boolean> {
  const [states, enforcementEnabled] = await Promise.all([
    getRuleStates(),
    getEnforcementEnabled(),
  ]);
  return enforcementEnabled && Boolean(states["webdriver-probe-annotate"]);
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
    log("webdriver-probe registration: getRegistered threw", { error });
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
        // topFrameOnly: the rule wraps Navigator.prototype on the
        // top-level document only. Same-origin iframes share the prototype
        // so they inherit the wrap; cross-origin frames have their own
        // Navigator and aren't reachable from a top-frame-only rule.
        allFrames: false,
        persistAcrossSessions: true,
      },
    ]);
    log("webdriver-probe registered at document_start (main world)");
  } catch (error) {
    log("webdriver-probe registration failed", { error });
  }
}

async function unregister(): Promise<void> {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
    log("webdriver-probe unregistered");
  } catch (error) {
    // Unregister fails if the script wasn't registered to begin with;
    // that's a benign state, not a problem.
    log("webdriver-probe unregister no-op", { error });
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
export function startWebdriverProbeRegistration(): void {
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
