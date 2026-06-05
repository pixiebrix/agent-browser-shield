// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Controls whether the shared subtree watcher keeps observing while the tab
// is hidden. Default off: a hidden tab gets no observer callbacks, which
// avoids work the user can't see. Operators flip it on when something else
// reads the page while it's in the background — a chat copilot, an
// accessibility-tree agent, or a sidebar extension can still consume the
// page's content after the user navigates away, and a page that mutates
// while hidden (lazy widgets finishing load, periodic refreshes, late
// prompt-injection payloads) would otherwise reach the consumer unredacted.

import { createChromeStorageValue } from "./chrome-storage-value";

export const RUN_ON_INACTIVE_TABS_DEFAULT = false;

// `process.env.EXTENSION_RUN_ON_INACTIVE_TABS_DEFAULT` is substituted by
// build.ts when the operator passes a defaults file with a
// `runOnInactiveTabs` field. Literal `"true"` / `"false"` forces a value;
// empty string falls back to the committed default above.
function resolveDefault(): boolean {
  const raw = process.env.EXTENSION_RUN_ON_INACTIVE_TABS_DEFAULT;
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  return RUN_ON_INACTIVE_TABS_DEFAULT;
}

export const runOnInactiveTabsStorage = createChromeStorageValue<boolean>({
  key: "agent-browser-shield.run-on-inactive-tabs",
  defaultValue: resolveDefault(),
});
