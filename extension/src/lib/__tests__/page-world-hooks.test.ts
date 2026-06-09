// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Exercises the concrete page-world hook table in `lib/page-world-hooks.ts`:
// the per-hook config (script id / bundle / allFrames / inject message), the
// `startPageWorldHooks` wiring that reconciles each hook against its gating
// toggle, and the `dispatchPageWorldInject` routing. The generic reconcile
// behavior is proved once in `page-world-hook.test.ts`; this file pins the
// per-hook values so the four hooks can't silently drift apart (the divergent
// `allFrames` / eligibility that motivated the factory).
//
// `chrome.scripting`'s in-memory store comes from the shared
// `installScriptingRegistry()` helper.

import type { ScriptingRegistryHandle } from "../../__test-mocks__/chrome-scripting-registry";
import {
  flushScriptingPromises,
  installScriptingRegistry,
} from "../../__test-mocks__/chrome-scripting-registry";

// See storage.test.ts for the rationale on these mocks — the storage module
// pulls in the full rule catalog transitively.
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

interface HooksModule {
  PAGE_WORLD_HOOKS: ReadonlyArray<{
    scriptId: string;
    scriptFile: string;
    logLabel: string;
    allFrames: boolean;
    inject?: { messageType: string };
  }>;
  startPageWorldHooks: () => void;
  dispatchPageWorldInject: (
    messageType: string,
    sender: chrome.runtime.MessageSender,
  ) => boolean;
}

let registry: ScriptingRegistryHandle;

// Re-import the table with fresh module state after seeding storage. Mirrors
// the loader the per-registration tests used, but covers the whole table.
async function loadModule(options: {
  overrides?: Record<string, boolean>;
  enforcementEnabled?: boolean;
  debugTrace?: boolean;
}): Promise<HooksModule> {
  let module!: HooksModule;
  await jest.isolateModulesAsync(async () => {
    process.env.EXTENSION_DEFAULT_OVERRIDES = JSON.stringify(
      options.overrides ?? {},
    );

    const enforcement = await import("../enforcement");
    await enforcement.enforcementStorage.set(
      options.enforcementEnabled ?? true,
    );

    const debugTrace = await import("../debug-trace");
    await debugTrace.debugTraceStorage.set(options.debugTrace ?? false);

    module = await import("../page-world-hooks");
  });
  return module;
}

beforeEach(() => {
  registry = installScriptingRegistry();
});

afterEach(() => {
  delete process.env.EXTENSION_DEFAULT_OVERRIDES;
});

describe("PAGE_WORLD_HOOKS table", () => {
  it("pins each hook's script id, bundle, frame scope, and inject message", async () => {
    const { PAGE_WORLD_HOOKS } = await loadModule({});
    const byId = Object.fromEntries(
      PAGE_WORLD_HOOKS.map((hook) => [hook.scriptId, hook]),
    );

    expect(byId["webdriver-probe-annotate-main-world"]).toMatchObject({
      scriptFile: "webdriver-probe.js",
      allFrames: false,
      inject: { messageType: "inject-webdriver-probe" },
    });
    expect(byId["checkout-checkbox-sanitize-main-world"]).toMatchObject({
      scriptFile: "checkout-checkbox-defense.js",
      allFrames: true,
      inject: { messageType: "inject-checkout-checkbox-defense" },
    });
    expect(byId["closed-shadow-root-annotate-main-world"]).toMatchObject({
      scriptFile: "shadow-root-probe.js",
      allFrames: true,
      inject: { messageType: "inject-shadow-root-probe" },
    });
    // The dump-trace bridge has no on-demand inject fallback by design.
    expect(byId["dump-trace-bridge-main-world"]).toMatchObject({
      scriptFile: "dump-trace-bridge.js",
      allFrames: false,
    });
    expect(byId["dump-trace-bridge-main-world"]?.inject).toBeUndefined();
  });
});

describe("startPageWorldHooks", () => {
  it("registers a rule-gated hook when its rule is enabled and enforced", async () => {
    const module = await loadModule({
      overrides: { "webdriver-probe-annotate": true },
    });

    module.startPageWorldHooks();
    await flushScriptingPromises();

    const ids = registry.registered().map((script) => script.id);
    expect(ids).toContain("webdriver-probe-annotate-main-world");
    const registered = registry
      .registered()
      .find((script) => script.id === "webdriver-probe-annotate-main-world");
    expect(registered).toMatchObject({
      js: ["webdriver-probe.js"],
      allFrames: false,
      world: "MAIN",
    });
  });

  it("does not register a rule-gated hook when enforcement is off", async () => {
    const module = await loadModule({
      overrides: { "webdriver-probe-annotate": true },
      enforcementEnabled: false,
    });

    module.startPageWorldHooks();
    await flushScriptingPromises();

    const ids = registry.registered().map((script) => script.id);
    expect(ids).not.toContain("webdriver-probe-annotate-main-world");
  });

  it("registers the dump-trace bridge from its own toggle, ignoring enforcement", async () => {
    const module = await loadModule({
      enforcementEnabled: false,
      debugTrace: true,
    });

    module.startPageWorldHooks();
    await flushScriptingPromises();

    const ids = registry.registered().map((script) => script.id);
    expect(ids).toContain("dump-trace-bridge-main-world");
  });
});

describe("dispatchPageWorldInject", () => {
  beforeEach(() => {
    (chrome.scripting.executeScript as jest.Mock).mockReset();
    (chrome.scripting.executeScript as jest.Mock).mockResolvedValue(undefined);
  });

  it("routes a known inject message to executeScript and returns true", async () => {
    const module = await loadModule({});

    const handled = module.dispatchPageWorldInject("inject-shadow-root-probe", {
      tab: { id: 4 },
      frameId: 0,
    } as chrome.runtime.MessageSender);

    expect(handled).toBe(true);
    expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(1);
    expect(chrome.scripting.executeScript).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { tabId: 4, frameIds: [0] },
        world: "MAIN",
      }),
    );
  });

  it("returns false for an unrecognized message and does not inject", async () => {
    const module = await loadModule({});

    const handled = module.dispatchPageWorldInject("rule-count", {
      tab: { id: 4 },
    } as chrome.runtime.MessageSender);

    expect(handled).toBe(false);
    expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
  });

  it("does not expose an inject route for the dump-trace bridge", async () => {
    const module = await loadModule({});

    const handled = module.dispatchPageWorldInject("inject-dump-trace-bridge", {
      tab: { id: 4 },
    } as chrome.runtime.MessageSender);

    expect(handled).toBe(false);
  });
});
