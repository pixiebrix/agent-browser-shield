// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Stored separately from rule states so changing the cosmetic display mode
// doesn't churn the rule-state listener path used by the engine and UIs.

const STORAGE_KEY = "agent-browser-shield.placeholder-display-mode";

export type PlaceholderDisplayMode = "icon" | "button";

export const PLACEHOLDER_DISPLAY_MODE_DEFAULT: PlaceholderDisplayMode = "icon";

function normalize(raw: unknown): PlaceholderDisplayMode {
  return raw === "button" || raw === "icon"
    ? raw
    : PLACEHOLDER_DISPLAY_MODE_DEFAULT;
}

export async function getPlaceholderDisplayMode(): Promise<PlaceholderDisplayMode> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return normalize(stored[STORAGE_KEY]);
}

export async function setPlaceholderDisplayMode(
  mode: PlaceholderDisplayMode,
): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: mode });
}

export function subscribePlaceholderDisplayMode(
  listener: (mode: PlaceholderDisplayMode) => void,
): () => void {
  const handler = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== "local") return;
    const change = changes[STORAGE_KEY];
    if (!change) return;
    listener(normalize(change.newValue));
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}
