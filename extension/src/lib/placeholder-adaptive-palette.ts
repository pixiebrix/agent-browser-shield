// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Experimental: when enabled, each placeholder samples the background of its
// ancestor chain at insert time and picks a light- or dark-tuned palette so
// the redaction stripes don't clash with the surrounding page (e.g. a
// dark-mode GitHub page where the default light stripes flare). Default off
// while the visual heuristic is still being tuned. Operators can preflip it
// per deployment via the build-time defaults file.
//
// Placeholder creation has to know the toggle's value synchronously, so this
// module also exposes a module-local cache initialised from storage in
// `rule-engine.start()`. Reading from a cache rather than awaiting storage
// per-placeholder keeps the redaction path off the chrome.storage round
// trip.

import { createChromeStorageValue } from "./chrome-storage-value";

export const PLACEHOLDER_ADAPTIVE_PALETTE_DEFAULT = false;

// `process.env.EXTENSION_PLACEHOLDER_ADAPTIVE_PALETTE_DEFAULT` is substituted
// by build.ts when the operator passes a defaults file with a
// `placeholderAdaptivePalette` field. Literal `"true"` / `"false"` forces a
// value; empty string falls back to the committed default above.
function resolveDefault(): boolean {
  const raw = process.env.EXTENSION_PLACEHOLDER_ADAPTIVE_PALETTE_DEFAULT;
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  return PLACEHOLDER_ADAPTIVE_PALETTE_DEFAULT;
}

export const placeholderAdaptivePaletteStorage =
  createChromeStorageValue<boolean>({
    key: "agent-browser-shield.placeholder-adaptive-palette",
    defaultValue: resolveDefault(),
  });

let cachedEnabled = resolveDefault();

export function isAdaptivePaletteEnabled(): boolean {
  return cachedEnabled;
}

export function setAdaptivePaletteCache(value: boolean): void {
  cachedEnabled = value;
}
