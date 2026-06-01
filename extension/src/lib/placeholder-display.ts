// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Stored separately from rule states so changing the cosmetic display mode
// doesn't churn the rule-state listener path used by the engine and UIs.

import { createChromeStorageValue } from "./chrome-storage-value";

export type PlaceholderDisplayMode = "icon" | "button";

export const PLACEHOLDER_DISPLAY_MODE_DEFAULT: PlaceholderDisplayMode = "icon";

function normalize(raw: unknown): PlaceholderDisplayMode {
  return raw === "button" || raw === "icon"
    ? raw
    : PLACEHOLDER_DISPLAY_MODE_DEFAULT;
}

export const placeholderDisplayStorage =
  createChromeStorageValue<PlaceholderDisplayMode>({
    key: "agent-browser-shield.placeholder-display-mode",
    normalize,
  });

export const getPlaceholderDisplayMode = placeholderDisplayStorage.get;
export const setPlaceholderDisplayMode = placeholderDisplayStorage.set;
export const subscribePlaceholderDisplayMode =
  placeholderDisplayStorage.subscribe;
