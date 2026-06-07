// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Exercises the dynamic main-world content-script registration that
// `lib/checkout-checkbox-defense-registration.ts` wires up. Mirrors
// `webdriver-probe-registration.test.ts` — same shape, different script
// id and filename. The module syncs chrome.scripting state against
// (rule-enabled AND enforcement-enabled).
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

interface DefenseModule {
  startCheckoutCheckboxDefenseRegistration: () => void;
}

let registry: ScriptingRegistryHandle;

async function loadDefenseModule(
  overrides: Record<string, boolean>,
  enforcementEnabled = true,
  initiallyRegistered = false,
): Promise<{ module: DefenseModule }> {
  let module!: DefenseModule;

  await jest.isolateModulesAsync(async () => {
    process.env.EXTENSION_DEFAULT_OVERRIDES = JSON.stringify(overrides);

    if (initiallyRegistered) {
      registry.seed([
        {
          id: "checkout-checkbox-sanitize-main-world",
          matches: ["<all_urls>"],
          js: ["checkout-checkbox-defense.js"],
          runAt: "document_start",
          world: "MAIN",
          allFrames: true,
        },
      ]);
    }

    const enforcement = await import("../enforcement");
    await enforcement.enforcementStorage.set(enforcementEnabled);

    module = await import("../checkout-checkbox-defense-registration");
  });

  return { module };
}

beforeEach(() => {
  registry = installScriptingRegistry();
});

afterEach(() => {
  delete process.env.EXTENSION_DEFAULT_OVERRIDES;
});

describe("startCheckoutCheckboxDefenseRegistration", () => {
  it("registers the main-world script on startup when the rule is enabled", async () => {
    const { module } = await loadDefenseModule({
      "checkout-checkbox-sanitize": true,
    });

    module.startCheckoutCheckboxDefenseRegistration();
    await flushScriptingPromises();

    expect(registry.registerMock).toHaveBeenCalledTimes(1);
    const [scripts] = registry.registerMock.mock.calls[0] as [
      RegisteredScript[],
    ];
    expect(scripts[0]).toMatchObject({
      id: "checkout-checkbox-sanitize-main-world",
      matches: ["<all_urls>"],
      js: ["checkout-checkbox-defense.js"],
      runAt: "document_start",
      world: "MAIN",
      // Cart/checkout flows often render payment widgets in same-origin
      // iframes; the wrap has to run per-frame because each frame has its
      // own HTMLInputElement.prototype.
      allFrames: true,
    });
  });

  it("does not register when the rule is disabled", async () => {
    const { module } = await loadDefenseModule({
      "checkout-checkbox-sanitize": false,
    });

    module.startCheckoutCheckboxDefenseRegistration();
    await flushScriptingPromises();

    expect(registry.registerMock).not.toHaveBeenCalled();
    expect(registry.unregisterMock).not.toHaveBeenCalled();
  });

  it("unregisters when an already-registered script becomes ineligible", async () => {
    const { module } = await loadDefenseModule(
      { "checkout-checkbox-sanitize": false },
      true,
      /* initiallyRegistered */ true,
    );

    module.startCheckoutCheckboxDefenseRegistration();
    await flushScriptingPromises();

    expect(registry.unregisterMock).toHaveBeenCalledWith({
      ids: ["checkout-checkbox-sanitize-main-world"],
    });
  });

  it("does not re-register if the desired state already matches", async () => {
    const { module } = await loadDefenseModule(
      { "checkout-checkbox-sanitize": true },
      true,
      /* initiallyRegistered */ true,
    );

    module.startCheckoutCheckboxDefenseRegistration();
    await flushScriptingPromises();

    expect(registry.registerMock).not.toHaveBeenCalled();
    expect(registry.unregisterMock).not.toHaveBeenCalled();
  });

  it("treats enforcement-off as if the rule were disabled", async () => {
    const { module } = await loadDefenseModule(
      { "checkout-checkbox-sanitize": true },
      /* enforcementEnabled */ false,
    );

    module.startCheckoutCheckboxDefenseRegistration();
    await flushScriptingPromises();

    expect(registry.registerMock).not.toHaveBeenCalled();
  });
});
