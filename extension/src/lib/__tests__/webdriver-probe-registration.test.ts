// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Exercises the dynamic main-world content-script registration that
// `lib/webdriver-probe-registration.ts` wires up. The module syncs
// chrome.scripting state against (rule-enabled AND enforcement-enabled),
// so the test covers the four corners plus the no-op short-circuits when
// the desired state already matches the current one.
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
  startWebdriverProbeRegistration: () => void;
}

let registry: ScriptingRegistryHandle;

async function loadModule(
  overrides: Record<string, boolean>,
  enforcementEnabled = true,
  initiallyRegistered = false,
): Promise<{ module: RegistrationModule }> {
  let module!: RegistrationModule;

  await jest.isolateModulesAsync(async () => {
    process.env.EXTENSION_DEFAULT_OVERRIDES = JSON.stringify(overrides);

    if (initiallyRegistered) {
      registry.seed([
        {
          id: "webdriver-probe-annotate-main-world",
          matches: ["<all_urls>"],
          js: ["webdriver-probe.js"],
          runAt: "document_start",
          world: "MAIN",
          allFrames: false,
        },
      ]);
    }

    const enforcement = await import("../enforcement");
    await enforcement.enforcementStorage.set(enforcementEnabled);

    module = await import("../webdriver-probe-registration");
  });

  return { module };
}

beforeEach(() => {
  registry = installScriptingRegistry();
});

afterEach(() => {
  delete process.env.EXTENSION_DEFAULT_OVERRIDES;
});

describe("startWebdriverProbeRegistration", () => {
  it("registers the main-world script on startup when the rule is enabled", async () => {
    const { module } = await loadModule({
      "webdriver-probe-annotate": true,
    });

    module.startWebdriverProbeRegistration();
    await flushScriptingPromises();

    expect(registry.registerMock).toHaveBeenCalledTimes(1);
    const [scripts] = registry.registerMock.mock.calls[0] as [
      RegisteredScript[],
    ];
    expect(scripts[0]).toMatchObject({
      id: "webdriver-probe-annotate-main-world",
      matches: ["<all_urls>"],
      js: ["webdriver-probe.js"],
      runAt: "document_start",
      world: "MAIN",
      allFrames: false,
    });
  });

  it("does not register when the rule is disabled", async () => {
    const { module } = await loadModule({
      "webdriver-probe-annotate": false,
    });

    module.startWebdriverProbeRegistration();
    await flushScriptingPromises();

    expect(registry.registerMock).not.toHaveBeenCalled();
    expect(registry.unregisterMock).not.toHaveBeenCalled();
  });

  it("unregisters when an already-registered script becomes ineligible", async () => {
    const { module } = await loadModule(
      { "webdriver-probe-annotate": false },
      true,
      /* initiallyRegistered */ true,
    );

    module.startWebdriverProbeRegistration();
    await flushScriptingPromises();

    expect(registry.unregisterMock).toHaveBeenCalledWith({
      ids: ["webdriver-probe-annotate-main-world"],
    });
  });

  it("does not re-register if the desired state already matches", async () => {
    const { module } = await loadModule(
      { "webdriver-probe-annotate": true },
      true,
      /* initiallyRegistered */ true,
    );

    module.startWebdriverProbeRegistration();
    await flushScriptingPromises();

    expect(registry.registerMock).not.toHaveBeenCalled();
    expect(registry.unregisterMock).not.toHaveBeenCalled();
  });

  it("treats enforcement-off as if the rule were disabled", async () => {
    const { module } = await loadModule(
      { "webdriver-probe-annotate": true },
      /* enforcementEnabled */ false,
    );

    module.startWebdriverProbeRegistration();
    await flushScriptingPromises();

    expect(registry.registerMock).not.toHaveBeenCalled();
  });
});
