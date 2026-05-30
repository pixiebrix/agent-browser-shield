// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { isTopFrame } from "./lib/frame";
import { injectOptionsBadge } from "./lib/options-badge";
import { startPlaceholderCountReporter } from "./lib/placeholder-count";
import { start } from "./lib/rule-engine";

// Content script runs in every frame (`all_frames: true`). The rule engine
// applies frame-appropriate rules in each; the badge is a single UI affordance
// that belongs only on the top frame so the user doesn't get one per iframe.
start().catch((error) => {
  console.error("[abs] failed to start rule engine", error);
});

// Per-frame placeholder reporter — background aggregates across frames into
// the toolbar badge total.
startPlaceholderCountReporter();

if (isTopFrame()) {
  injectOptionsBadge();
}
