// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { isTopFrame } from "./lib/frame";
import { log } from "./lib/log";
import { startOptionsBadge } from "./lib/options-badge";
import { startRuleCountReporter } from "./lib/rule-count";
import { start } from "./lib/rule-engine";
import { startSegmentTracker } from "./lib/segment-tracker";
import { installShadowRootHook } from "./lib/shadow-roots";

// Install the attachShadow patch as early as possible. The content script
// runs at document_idle so page scripts that built shadow trees during
// parsing already ran — those are caught by the subtree watcher's
// initial walk at startup. The hook here covers every subsequent attach,
// including custom elements that defer attachShadow into a connected
// callback, lit-element upgrades, etc.
installShadowRootHook();

// Content script runs in every frame (`all_frames: true`). The rule engine
// applies frame-appropriate rules in each; the badge is a single UI affordance
// that belongs only on the top frame so the user doesn't get one per iframe.
// Top-level await is unavailable — the bundler emits a classic script for the
// content-script entry, so a promise chain is required.
// eslint-disable-next-line unicorn/prefer-top-level-await
start().catch((error: unknown) => {
  log.error("failed to start rule engine", error);
});

// Per-frame, per-rule footprint reporter — background aggregates across
// frames into the toolbar badge total and the popup's per-rule activity list.
startRuleCountReporter();

// Dev-mode trace segment markers (initial load, route changes, modal
// opens, mutation bursts). All emission is gated by the user's debug-trace
// toggle inside the tracker — when off, this is one route-change listener
// plus one shared subtree-watcher subscriber, no other cost.
startSegmentTracker();

if (isTopFrame()) {
  startOptionsBadge();
}
