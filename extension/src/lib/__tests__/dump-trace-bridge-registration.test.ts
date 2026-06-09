// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Exercises the dynamic main-world content-script registration that
// `lib/dump-trace-bridge-registration.ts` wires up. The module syncs
// chrome.scripting state against the `debugTraceStorage` toggle, so the
// test covers the four corners plus the no-op short-circuits when the
// desired state already matches the current one.
//
// `chrome.scripting`'s in-memory store comes from the shared
// `installScriptingRegistry()` helper — same store semantics as the
// other main-world registration tests, see
// `__test-mocks__/chrome-scripting-registry.ts` for the contract.

import type {
  RegisteredScript,
  ScriptingRegistryHandle,
} from "../../__test-mocks__/chrome-scripting-registry";
import {
  flushScriptingPromises,
  installScriptingRegistry,
} from "../../__test-mocks__/chrome-scripting-registry";

// See storage.test.ts for the rationale on these mocks — the storage
// module pulls in the full rule catalog transitively.
jest.mock("nanoid", () => ({ nanoid: () => "test-ref" }));
jest.mock("abort-utils", () => ({
  ReusableAbortController: class {
    abort(): void {
      // noop
    }
    get signal(): AbortSignal {
      return new AbortController().signal;
    }
  },
  onAbort: (): (() => void) => () => {
    // noop
  },
}));

interface RegistrationModule {
  startDumpTraceBridgeRegistration: () => void;
}

interface DebugTraceModule {
  debugTraceStorage: {
    get: () => Promise<boolean>;
    set: (value: boolean) => Promise<void>;
  };
}

let registry: ScriptingRegistryHandle;

async function loadModule(
  toggleOn: boolean,
  initiallyRegistered = false,
): Promise<{ module: RegistrationModule; debugTrace: DebugTraceModule }> {
  let module!: RegistrationModule;
  let debugTrace!: DebugTraceModule;

  await jest.isolateModulesAsync(async () => {
    if (initiallyRegistered) {
      registry.seed([
        {
          id: "dump-trace-bridge-main-world",
          matches: ["<all_urls>"],
          js: ["dump-trace-bridge.js"],
          runAt: "document_start",
          world: "MAIN",
          allFrames: false,
        },
      ]);
    }

    debugTrace = await import("../debug-trace");
    await debugTrace.debugTraceStorage.set(toggleOn);

    module = await import("../dump-trace-bridge-registration");
  });

  return { module, debugTrace };
}

beforeEach(() => {
  registry = installScriptingRegistry();
});

describe("startDumpTraceBridgeRegistration", () => {
  it("registers the main-world bridge on startup when the toggle is on", async () => {
    const { module } = await loadModule(true);

    module.startDumpTraceBridgeRegistration();
    await flushScriptingPromises();

    expect(registry.registerMock).toHaveBeenCalledTimes(1);
    const [scripts] = registry.registerMock.mock.calls[0] as [
      RegisteredScript[],
    ];
    expect(scripts[0]).toMatchObject({
      id: "dump-trace-bridge-main-world",
      matches: ["<all_urls>"],
      js: ["dump-trace-bridge.js"],
      runAt: "document_start",
      world: "MAIN",
      allFrames: false,
    });
  });

  it("does not register when the toggle is off", async () => {
    const { module } = await loadModule(false);

    module.startDumpTraceBridgeRegistration();
    await flushScriptingPromises();

    expect(registry.registerMock).not.toHaveBeenCalled();
    expect(registry.unregisterMock).not.toHaveBeenCalled();
  });

  it("unregisters an already-registered script when the toggle is off", async () => {
    const { module } = await loadModule(false, /* initiallyRegistered */ true);

    module.startDumpTraceBridgeRegistration();
    await flushScriptingPromises();

    expect(registry.unregisterMock).toHaveBeenCalledWith({
      ids: ["dump-trace-bridge-main-world"],
    });
  });

  it("does not re-register when the desired state already matches", async () => {
    const { module } = await loadModule(true, /* initiallyRegistered */ true);

    module.startDumpTraceBridgeRegistration();
    await flushScriptingPromises();

    expect(registry.registerMock).not.toHaveBeenCalled();
    expect(registry.unregisterMock).not.toHaveBeenCalled();
  });

  it("registers when the toggle flips from off to on after startup", async () => {
    const { module, debugTrace } = await loadModule(false);

    module.startDumpTraceBridgeRegistration();
    await flushScriptingPromises();
    expect(registry.registerMock).not.toHaveBeenCalled();

    await debugTrace.debugTraceStorage.set(true);
    await flushScriptingPromises();

    expect(registry.registerMock).toHaveBeenCalledTimes(1);
  });

  it("unregisters when the toggle flips from on to off after startup", async () => {
    const { module, debugTrace } = await loadModule(
      true,
      /* initiallyRegistered */ true,
    );

    module.startDumpTraceBridgeRegistration();
    await flushScriptingPromises();
    // No register call needed — the seed already matches.
    expect(registry.registerMock).not.toHaveBeenCalled();

    await debugTrace.debugTraceStorage.set(false);
    await flushScriptingPromises();

    expect(registry.unregisterMock).toHaveBeenCalledWith({
      ids: ["dump-trace-bridge-main-world"],
    });
  });
});
