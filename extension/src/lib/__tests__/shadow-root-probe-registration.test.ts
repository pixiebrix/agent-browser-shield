// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Exercises the dynamic main-world content-script registration for the
// shadow-root probe. Mirrors `webdriver-probe-registration.test.ts` —
// the module syncs chrome.scripting state against (rule-enabled AND
// enforcement-enabled), so the test covers the four corners plus the
// no-op short-circuits when the desired state already matches.
//
// `chrome.scripting`'s in-memory store comes from the shared
// `installScriptingRegistry()` helper, see
// `__test-mocks__/chrome-scripting-registry.ts`.

import type {
  RegisteredScript,
  ScriptingRegistryHandle,
} from "../../__test-mocks__/chrome-scripting-registry";
import {
  flushScriptingPromises,
  installScriptingRegistry,
} from "../../__test-mocks__/chrome-scripting-registry";

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

interface ShadowProbeRegistrationModule {
  startShadowRootProbeRegistration: () => void;
}

let registry: ScriptingRegistryHandle;

async function loadShadowProbeModule(
  overrides: Record<string, boolean>,
  enforcementEnabled = true,
  initiallyRegistered = false,
): Promise<{ module: ShadowProbeRegistrationModule }> {
  let module!: ShadowProbeRegistrationModule;

  await jest.isolateModulesAsync(async () => {
    process.env.EXTENSION_DEFAULT_OVERRIDES = JSON.stringify(overrides);

    if (initiallyRegistered) {
      registry.seed([
        {
          id: "closed-shadow-root-annotate-main-world",
          matches: ["<all_urls>"],
          js: ["shadow-root-probe.js"],
          runAt: "document_start",
          world: "MAIN",
          allFrames: true,
        },
      ]);
    }

    const enforcement = await import("../enforcement");
    await enforcement.enforcementStorage.set(enforcementEnabled);

    module = await import("../shadow-root-probe-registration");
  });

  return { module };
}

beforeEach(() => {
  registry = installScriptingRegistry();
});

afterEach(() => {
  delete process.env.EXTENSION_DEFAULT_OVERRIDES;
});

describe("startShadowRootProbeRegistration", () => {
  it("registers the main-world script on startup when the rule is enabled", async () => {
    const { module } = await loadShadowProbeModule({
      "closed-shadow-root-annotate": true,
    });

    module.startShadowRootProbeRegistration();
    await flushScriptingPromises();

    expect(registry.registerMock).toHaveBeenCalledTimes(1);
    const [scripts] = registry.registerMock.mock.calls[0] as [
      RegisteredScript[],
    ];
    expect(scripts[0]).toMatchObject({
      id: "closed-shadow-root-annotate-main-world",
      matches: ["<all_urls>"],
      js: ["shadow-root-probe.js"],
      runAt: "document_start",
      world: "MAIN",
      allFrames: true,
    });
  });

  it("does not register when the rule is disabled", async () => {
    const { module } = await loadShadowProbeModule({
      "closed-shadow-root-annotate": false,
    });

    module.startShadowRootProbeRegistration();
    await flushScriptingPromises();

    expect(registry.registerMock).not.toHaveBeenCalled();
    expect(registry.unregisterMock).not.toHaveBeenCalled();
  });

  it("unregisters when an already-registered script becomes ineligible", async () => {
    const { module } = await loadShadowProbeModule(
      { "closed-shadow-root-annotate": false },
      true,
      /* initiallyRegistered */ true,
    );

    module.startShadowRootProbeRegistration();
    await flushScriptingPromises();

    expect(registry.unregisterMock).toHaveBeenCalledWith({
      ids: ["closed-shadow-root-annotate-main-world"],
    });
  });

  it("does not re-register if the desired state already matches", async () => {
    const { module } = await loadShadowProbeModule(
      { "closed-shadow-root-annotate": true },
      true,
      /* initiallyRegistered */ true,
    );

    module.startShadowRootProbeRegistration();
    await flushScriptingPromises();

    expect(registry.registerMock).not.toHaveBeenCalled();
    expect(registry.unregisterMock).not.toHaveBeenCalled();
  });

  it("treats enforcement-off as if the rule were disabled", async () => {
    const { module } = await loadShadowProbeModule(
      { "closed-shadow-root-annotate": true },
      /* enforcementEnabled */ false,
    );

    module.startShadowRootProbeRegistration();
    await flushScriptingPromises();

    expect(registry.registerMock).not.toHaveBeenCalled();
  });
});
