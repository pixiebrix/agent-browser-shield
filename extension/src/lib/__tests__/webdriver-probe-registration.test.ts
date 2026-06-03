// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Exercises the dynamic main-world content-script registration that
// `lib/webdriver-probe-registration.ts` wires up. The module syncs
// chrome.scripting state against (rule-enabled AND enforcement-enabled),
// so the test covers the four corners plus the no-op short-circuits when
// the desired state already matches the current one.
//
// chrome.scripting and chrome.storage aren't available in jsdom; the
// `chrome` global is replaced with a hand-rolled stub for the duration
// of the test.

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

interface RegisteredScript {
  id: string;
  matches: string[];
  js: string[];
  runAt: string;
  world: string;
  allFrames: boolean;
}

interface ChromeStub {
  scripting: {
    registerContentScripts: jest.Mock;
    unregisterContentScripts: jest.Mock;
    getRegisteredContentScripts: jest.Mock;
  };
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

async function loadModule(
  overrides: Record<string, boolean>,
  enforcementEnabled = true,
  initiallyRegistered = false,
): Promise<{ chromeStub: ChromeStub; module: RegistrationModule }> {
  let chromeStub!: ChromeStub;
  let module!: RegistrationModule;

  await jest.isolateModulesAsync(async () => {
    process.env.EXTENSION_DEFAULT_OVERRIDES = JSON.stringify(overrides);

    const registered: RegisteredScript[] = initiallyRegistered
      ? [
          {
            id: "webdriver-probe-annotate-main-world",
            matches: ["<all_urls>"],
            js: ["webdriver-probe.js"],
            runAt: "document_start",
            world: "MAIN",
            allFrames: false,
          },
        ]
      : [];

    chromeStub = {
      scripting: {
        registerContentScripts: jest.fn(
          (scripts: RegisteredScript[]): Promise<void> => {
            for (const script of scripts) {
              registered.push(script);
            }
            return Promise.resolve();
          },
        ),
        unregisterContentScripts: jest.fn(
          (filter: { ids: string[] }): Promise<void> => {
            for (const id of filter.ids) {
              const index = registered.findIndex((script) => script.id === id);
              if (index !== -1) {
                registered.splice(index, 1);
              }
            }
            return Promise.resolve();
          },
        ),
        getRegisteredContentScripts: jest.fn(
          (filter?: { ids?: string[] }): Promise<RegisteredScript[]> => {
            if (!filter?.ids) {
              return Promise.resolve([...registered]);
            }
            return Promise.resolve(
              registered.filter((script) => filter.ids?.includes(script.id)),
            );
          },
        ),
      },
    };
    (globalThis as unknown as { chrome: ChromeStub }).chrome = chromeStub;

    const enforcement = await import("../enforcement");
    await enforcement.enforcementStorage.set(enforcementEnabled);

    module = await import("../webdriver-probe-registration");
  });

  return { chromeStub, module };
}

afterEach(() => {
  delete (globalThis as unknown as { chrome?: unknown }).chrome;
  delete process.env.EXTENSION_DEFAULT_OVERRIDES;
});

describe("startWebdriverProbeRegistration", () => {
  it("registers the main-world script on startup when the rule is enabled", async () => {
    const { chromeStub, module } = await loadModule({
      "webdriver-probe-annotate": true,
    });

    module.startWebdriverProbeRegistration();
    await flushPromises();

    expect(chromeStub.scripting.registerContentScripts).toHaveBeenCalledTimes(
      1,
    );
    const [scripts] = chromeStub.scripting.registerContentScripts.mock
      .calls[0] as [RegisteredScript[]];
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
    const { chromeStub, module } = await loadModule({
      "webdriver-probe-annotate": false,
    });

    module.startWebdriverProbeRegistration();
    await flushPromises();

    expect(chromeStub.scripting.registerContentScripts).not.toHaveBeenCalled();
    expect(
      chromeStub.scripting.unregisterContentScripts,
    ).not.toHaveBeenCalled();
  });

  it("unregisters when an already-registered script becomes ineligible", async () => {
    const { chromeStub, module } = await loadModule(
      { "webdriver-probe-annotate": false },
      true,
      /* initiallyRegistered */ true,
    );

    module.startWebdriverProbeRegistration();
    await flushPromises();

    expect(chromeStub.scripting.unregisterContentScripts).toHaveBeenCalledWith({
      ids: ["webdriver-probe-annotate-main-world"],
    });
  });

  it("does not re-register if the desired state already matches", async () => {
    const { chromeStub, module } = await loadModule(
      { "webdriver-probe-annotate": true },
      true,
      /* initiallyRegistered */ true,
    );

    module.startWebdriverProbeRegistration();
    await flushPromises();

    expect(chromeStub.scripting.registerContentScripts).not.toHaveBeenCalled();
    expect(
      chromeStub.scripting.unregisterContentScripts,
    ).not.toHaveBeenCalled();
  });

  it("treats enforcement-off as if the rule were disabled", async () => {
    const { chromeStub, module } = await loadModule(
      { "webdriver-probe-annotate": true },
      /* enforcementEnabled */ false,
    );

    module.startWebdriverProbeRegistration();
    await flushPromises();

    expect(chromeStub.scripting.registerContentScripts).not.toHaveBeenCalled();
  });
});
