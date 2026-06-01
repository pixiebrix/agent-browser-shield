// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Global on/off switch for the extension's enforcement. When disabled, the
// rule engine reveals all placeholders and tears down rules without mutating
// any per-rule state — so flipping it back on restores the previous selection.
//
// Stored separately from rule states so toggling enforcement doesn't churn the
// rule-state listener path and so the per-rule preferences survive across
// disable/enable cycles.

import { createChromeStorageValue } from "./chrome-storage-value";

export const ENFORCEMENT_ENABLED_DEFAULT = true;

function normalize(raw: unknown): boolean {
  return typeof raw === "boolean" ? raw : ENFORCEMENT_ENABLED_DEFAULT;
}

export const enforcementStorage = createChromeStorageValue<boolean>({
  key: "agent-browser-shield.enforcement-enabled",
  normalize,
});

export const getEnforcementEnabled = enforcementStorage.get;
export const subscribeEnforcementEnabled = enforcementStorage.subscribe;
