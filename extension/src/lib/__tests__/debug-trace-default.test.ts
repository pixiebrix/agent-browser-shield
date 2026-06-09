// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Verifies that `debugTraceStorage` reads its initial default from
// `process.env.EXTENSION_DEBUG_TRACE_DEFAULT` (substituted by build.ts when
// the operator supplies a defaults file with a `debugTrace` field). Mirrors
// the structure of `options-button-toggle.test.ts`: env var is read at
// module load, so each case sets the value and reloads the module via
// `jest.isolateModulesAsync`. The webext-storage stub
// (jest.config.cjs `moduleNameMapper`) is re-instantiated inside the isolate
// so `get()` returns the freshly derived default rather than a stored value
// from a previous case.

import type { debugTraceStorage as Storage } from "../debug-trace";

interface ToggleModule {
  debugTraceStorage: typeof Storage;
  DEBUG_TRACE_ENABLED_DEFAULT: boolean;
}

async function loadToggle(): Promise<ToggleModule> {
  let module!: ToggleModule;
  await jest.isolateModulesAsync(async () => {
    module = await import("../debug-trace");
  });
  return module;
}

describe("debugTraceStorage default", () => {
  const original = (process.env as Record<string, string | undefined>)
    .EXTENSION_DEBUG_TRACE_DEFAULT;

  afterEach(() => {
    if (original === undefined) {
      delete (process.env as Record<string, unknown>)
        .EXTENSION_DEBUG_TRACE_DEFAULT;
    } else {
      process.env.EXTENSION_DEBUG_TRACE_DEFAULT = original;
    }
  });

  it("falls back to the committed default when the env var is empty", async () => {
    process.env.EXTENSION_DEBUG_TRACE_DEFAULT = "";
    const { debugTraceStorage, DEBUG_TRACE_ENABLED_DEFAULT } =
      await loadToggle();
    expect(await debugTraceStorage.get()).toBe(DEBUG_TRACE_ENABLED_DEFAULT);
  });

  it("uses true when the build-time override is 'true'", async () => {
    process.env.EXTENSION_DEBUG_TRACE_DEFAULT = "true";
    const { debugTraceStorage } = await loadToggle();
    expect(await debugTraceStorage.get()).toBe(true);
  });

  it("uses false when the build-time override is 'false'", async () => {
    process.env.EXTENSION_DEBUG_TRACE_DEFAULT = "false";
    const { debugTraceStorage } = await loadToggle();
    expect(await debugTraceStorage.get()).toBe(false);
  });

  it("ignores unrecognized strings and falls back to the committed default", async () => {
    process.env.EXTENSION_DEBUG_TRACE_DEFAULT = "yes";
    const { debugTraceStorage, DEBUG_TRACE_ENABLED_DEFAULT } =
      await loadToggle();
    expect(await debugTraceStorage.get()).toBe(DEBUG_TRACE_ENABLED_DEFAULT);
  });
});
