/// <reference types="jest" />
// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// jest-webextension-mock 4.1 installs `globalThis.chrome` with most MV2/MV3
// APIs (runtime, storage, tabs, action, browserAction, etc.) but does NOT
// include chrome.scripting (MV3 content-script registration). Patch the
// missing namespace here so tests can `chrome.scripting.registerContentScripts
// .mockImplementation(...)` against the global. Wired via `setupFiles` AFTER
// jest-webextension-mock so the global already exists.

interface ChromeScriptingMock {
  executeScript: jest.Mock;
  registerContentScripts: jest.Mock;
  unregisterContentScripts: jest.Mock;
  getRegisteredContentScripts: jest.Mock;
}

// The cast adds the `scripting` namespace the mock lib's chrome types omit.
(
  globalThis as unknown as { chrome: { scripting: ChromeScriptingMock } }
).chrome.scripting = {
  executeScript: jest.fn(),
  registerContentScripts: jest.fn(),
  unregisterContentScripts: jest.fn(),
  getRegisteredContentScripts: jest.fn(),
};
