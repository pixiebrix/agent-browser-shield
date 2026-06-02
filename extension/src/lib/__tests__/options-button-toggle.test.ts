// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Verifies that `optionsButtonStorage` reads its initial default from
// `process.env.EXTENSION_OPTIONS_BUTTON_DEFAULT` (substituted by build.ts
// when the operator supplies a defaults file with an `optionsButton`
// field). The env var is read at module load, so each case sets the value
// and then reloads the module via `jest.isolateModulesAsync`. The
// webext-storage stub (jest.config.cjs `moduleNameMapper`) is
// re-instantiated inside the isolate, so `get()` returns the freshly
// derived default rather than any stored value from a previous case.

import type { optionsButtonStorage as Storage } from "../options-button-toggle";

interface ToggleModule {
  optionsButtonStorage: typeof Storage;
  OPTIONS_BUTTON_ENABLED_DEFAULT: boolean;
}

async function loadToggle(): Promise<ToggleModule> {
  let module!: ToggleModule;
  await jest.isolateModulesAsync(async () => {
    module = await import("../options-button-toggle");
  });
  return module;
}

describe("optionsButtonStorage default", () => {
  const original = (process.env as Record<string, string | undefined>)
    .EXTENSION_OPTIONS_BUTTON_DEFAULT;

  afterEach(() => {
    if (original === undefined) {
      delete (process.env as Record<string, unknown>)
        .EXTENSION_OPTIONS_BUTTON_DEFAULT;
    } else {
      process.env.EXTENSION_OPTIONS_BUTTON_DEFAULT = original;
    }
  });

  it("falls back to the committed default when the env var is empty", async () => {
    process.env.EXTENSION_OPTIONS_BUTTON_DEFAULT = "";
    const { optionsButtonStorage, OPTIONS_BUTTON_ENABLED_DEFAULT } =
      await loadToggle();
    expect(await optionsButtonStorage.get()).toBe(
      OPTIONS_BUTTON_ENABLED_DEFAULT,
    );
  });

  it("uses true when the build-time override is 'true'", async () => {
    process.env.EXTENSION_OPTIONS_BUTTON_DEFAULT = "true";
    const { optionsButtonStorage } = await loadToggle();
    expect(await optionsButtonStorage.get()).toBe(true);
  });

  it("uses false when the build-time override is 'false'", async () => {
    process.env.EXTENSION_OPTIONS_BUTTON_DEFAULT = "false";
    const { optionsButtonStorage } = await loadToggle();
    expect(await optionsButtonStorage.get()).toBe(false);
  });

  it("ignores unrecognized strings and falls back to the committed default", async () => {
    process.env.EXTENSION_OPTIONS_BUTTON_DEFAULT = "yes";
    const { optionsButtonStorage, OPTIONS_BUTTON_ENABLED_DEFAULT } =
      await loadToggle();
    expect(await optionsButtonStorage.get()).toBe(
      OPTIONS_BUTTON_ENABLED_DEFAULT,
    );
  });
});
