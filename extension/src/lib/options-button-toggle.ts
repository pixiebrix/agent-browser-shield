// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// User-controlled visibility of the floating on-page button that opens the
// extension's options page. The button only exists for browser-use agents
// driving the page via the accessibility tree (which can't click browser
// chrome) — humans can ignore it or hide it via this setting.

import { createChromeStorageValue } from "./chrome-storage-value";

export const OPTIONS_BUTTON_ENABLED_DEFAULT = true;

export const optionsButtonStorage = createChromeStorageValue<boolean>({
  key: "agent-browser-shield.options-button-enabled",
  defaultValue: OPTIONS_BUTTON_ENABLED_DEFAULT,
});
