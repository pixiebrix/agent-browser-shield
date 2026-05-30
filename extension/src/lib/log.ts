// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Lightweight debug logging used to trace rule application and placeholder
// reveal interactions. Logs are unconditional so they show up in the page's
// devtools console without needing a verbose-level toggle — adjust here if
// they get too noisy.

const PREFIX = "[abs]";

export function log(message: string, details?: unknown): void {
  if (details === undefined) {
    console.log(PREFIX, message);
  } else {
    console.log(PREFIX, message, details);
  }
}
