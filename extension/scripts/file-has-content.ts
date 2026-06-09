// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { readFileSync } from "node:fs";

// Returns true when `path` already holds exactly `expected`. Codegen writes
// into `src/`, which `build.ts --watch` watches recursively; guarding each
// `writeFileSync` with this check keeps an unchanged output from re-arming the
// watcher and spinning into an infinite rebuild loop.
export function fileHasContent(path: string, expected: string): boolean {
  try {
    return readFileSync(path, "utf8") === expected;
  } catch {
    return false;
  }
}
