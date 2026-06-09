// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Background-side life-cycle for the page-world dump-trace bridge.
// When the user's debug-trace toggle is on (`debugTraceStorage`),
// `dump-trace-bridge.js` is registered via
// `chrome.scripting.registerContentScripts` with `world: "MAIN"` and
// `runAt: "document_start"` so subsequent navigations get
// `window.__abs_dumpTrace()` exposed before the page's first script.
// When the toggle is off, the registration is removed so future
// navigations get a clean Window prototype.
//
// The toggle is the same one that gates emission in
// `lib/debug-trace.ts` — its default flows from the build-time
// `EXTENSION_DEBUG_TRACE_DEFAULT` env var, so a CDP-driven build that
// ships with `debugTrace: true` registers the bridge at service-worker
// startup, and a CWS install registers the bridge when the user flips
// the popup toggle. Either path, same code.
//
// There is no on-demand `executeScript` fallback for the already-open
// tab (unlike the probe registrations): the trace recorder also only
// starts collecting on next navigation after the toggle flips, so a
// reload is already implied. The doc paragraph in install.md mentions
// the reload constraint.

import { debugTraceStorage } from "./debug-trace";
import { log } from "./log";

const SCRIPT_ID = "dump-trace-bridge-main-world";
const SCRIPT_FILE = "dump-trace-bridge.js";

async function shouldBeRegistered(): Promise<boolean> {
  return debugTraceStorage.get();
}

async function isRegistered(): Promise<boolean> {
  try {
    const registered = await chrome.scripting.getRegisteredContentScripts({
      ids: [SCRIPT_ID],
    });
    return registered.length > 0;
  } catch (error) {
    // getRegisteredContentScripts throws if no script with the id
    // exists in some Chrome versions; treat that as "not registered"
    // rather than a failure mode that prevents registration.
    log.warn("dump-trace-bridge registration: getRegistered threw", { error });
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
        // Top frame only — the isolated-world content-bridge only
        // starts inside `isTopFrame()` and `getEventsForTab` returns
        // every frame's entries for the tab, so a CDP caller asking
        // from the top gets the full picture without sub-frame
        // bridges.
        allFrames: false,
        persistAcrossSessions: true,
      },
    ]);
    log.info("dump-trace-bridge registered at document_start (main world)");
  } catch (error) {
    log.error("dump-trace-bridge registration failed", { error });
  }
}

async function unregister(): Promise<void> {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
    log.info("dump-trace-bridge unregistered");
  } catch (error) {
    // Unregister fails if the script wasn't registered to begin with;
    // that's a benign state, not a problem.
    log.debug("dump-trace-bridge unregister no-op", { error });
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
export function startDumpTraceBridgeRegistration(): void {
  // Initial reconciliation when the service worker spins up — covers
  // both first install and SW restarts on Chrome's idle timer.
  void sync();
  debugTraceStorage.subscribe(() => {
    void sync();
  });
}
