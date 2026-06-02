// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// User-controlled visibility of the floating on-page button that opens the
// extension's options page. The button is shown to humans browsing pages so
// they can reach the options page without using the toolbar icon — but it
// also appears in the accessibility tree, which means browser-use agents can
// see it. On sparse pages (JSON viewers, error screens, interstitials) the
// button can dominate the tree and become a misleading "click me to make
// progress" target. Default off; operators who want it on for a specific
// deployment can flip it via the build-time defaults file.

import { createChromeStorageValue } from "./chrome-storage-value";

export const OPTIONS_BUTTON_ENABLED_DEFAULT = false;

// `process.env.EXTENSION_OPTIONS_BUTTON_DEFAULT` is substituted by build.ts
// when the operator passes a defaults file with an `optionsButton` field.
// Literal `"true"` / `"false"` forces a value; empty string falls back to
// the committed default above.
function resolveDefault(): boolean {
  const raw = process.env.EXTENSION_OPTIONS_BUTTON_DEFAULT;
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  return OPTIONS_BUTTON_ENABLED_DEFAULT;
}

export const optionsButtonStorage = createChromeStorageValue<boolean>({
  key: "agent-browser-shield.options-button-enabled",
  defaultValue: resolveDefault(),
});
