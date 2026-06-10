// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Background service-worker entry point. Pure orchestration — it imports no
// rule implementation file (enforced by scripts/check-background-purity.ts;
// rule files touch DOM constructors that throw in a worker). The work is split
// by concern under lib/background/:
//   - tab-tracker      per-tab toolbar/popup state + the badge refresh
//   - message-handlers the typed content/popup → background router
//   - lifecycle        chrome.tabs listeners, storage seeds, the pause bridge
// This file just constructs the tracker and starts each piece.

import { startBackgroundLifecycle } from "./lib/background/lifecycle";
import { registerBackgroundMethods } from "./lib/background/message-handlers";
import { createTabTracker } from "./lib/background/tab-tracker";
import { startClassifyPortListener } from "./lib/llm-background";
import { startPageWorldHooks } from "./lib/page-world-hooks";

// Single owner of all per-tab in-memory state; the router and lifecycle below
// are thin shells over its operations.
const tracker = createTabTracker();

// The typed message router (content/popup → background). See
// lib/background/message-handlers.ts.
registerBackgroundMethods(tracker);

// chrome.tabs listeners, storage subscriptions, startup seeds, and the
// tab-scoped recovery-pause session bridge. See lib/background/lifecycle.ts.
startBackgroundLifecycle(tracker);

// Classify requests use a long-lived port instead of sendMessage so the
// content-side abort can propagate to the background's fetch. See
// lib/llm-background.ts for the per-port AbortController wiring.
startClassifyPortListener();

// Register/unregister every page-world (`world: "MAIN"`,
// `runAt: "document_start"`) script as its gating toggle (and, for the
// rule-gated ones, global enforcement) changes — the webdriver probe, the
// checkout-checkbox defense, the shadow-root probe, and the `__abs_dumpTrace`
// bridge. Each must run before the page's first script to wrap a page-world
// prototype the isolated-world rule engine can't reach. The table of hooks and
// their register/unregister life-cycle lives in lib/page-world-hooks.ts.
startPageWorldHooks();
