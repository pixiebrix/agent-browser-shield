// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Exercises the dynamic main-world content-script registration that
// `lib/webdriver-probe-registration.ts` wires up. The module syncs
// chrome.scripting state against (rule-enabled AND enforcement-enabled),
// so the test covers the four corners plus the no-op short-circuits when
// the desired state already matches the current one.
//
// chrome.* APIs come from jest-webextension-mock + chrome-mv3-extras
// (wired via `setupFiles` in jest.config.cjs). Each loadModule call
// replays a stateful registration store on top of those stubs.

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

// chrome.scripting comes from chrome-mv3-extras.ts; @types/chrome types the
// methods as plain functions, so cast each one to a jest.Mock for the
// mock-control surface (mockImplementation, mockReset, .mock.calls).
const registerMock = chrome.scripting
  .registerContentScripts as unknown as jest.Mock;
const unregisterMock = chrome.scripting
  .unregisterContentScripts as unknown as jest.Mock;
const getRegisteredMock = chrome.scripting
  .getRegisteredContentScripts as unknown as jest.Mock;

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

function flushPromises(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

async function loadModule(
  overrides: Record<string, boolean>,
  enforcementEnabled = true,
  initiallyRegistered = false,
): Promise<{ module: RegistrationModule }> {
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

    registerMock.mockImplementation(
      (scripts: RegisteredScript[]): Promise<void> => {
        registered.push(...scripts);
        return Promise.resolve();
      },
    );
    unregisterMock.mockImplementation(
      (filter: { ids: string[] }): Promise<void> => {
        for (const id of filter.ids) {
          const index = registered.findIndex((script) => script.id === id);
          if (index !== -1) {
            registered.splice(index, 1);
          }
        }
        return Promise.resolve();
      },
    );
    getRegisteredMock.mockImplementation(
      (filter?: { ids?: string[] }): Promise<RegisteredScript[]> => {
        if (!filter?.ids) {
          return Promise.resolve([...registered]);
        }
        return Promise.resolve(
          registered.filter((script) => filter.ids?.includes(script.id)),
        );
      },
    );

    const enforcement = await import("../enforcement");
    await enforcement.enforcementStorage.set(enforcementEnabled);

    module = await import("../webdriver-probe-registration");
  });

  return { module };
}

beforeEach(() => {
  registerMock.mockReset();
  unregisterMock.mockReset();
  getRegisteredMock.mockReset();
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
    await flushPromises();

    expect(registerMock).toHaveBeenCalledTimes(1);
    const [scripts] = registerMock.mock.calls[0] as [RegisteredScript[]];
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
    await flushPromises();

    expect(registerMock).not.toHaveBeenCalled();
    expect(unregisterMock).not.toHaveBeenCalled();
  });

  it("unregisters when an already-registered script becomes ineligible", async () => {
    const { module } = await loadModule(
      { "webdriver-probe-annotate": false },
      true,
      /* initiallyRegistered */ true,
    );

    module.startWebdriverProbeRegistration();
    await flushPromises();

    expect(unregisterMock).toHaveBeenCalledWith({
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
    await flushPromises();

    expect(registerMock).not.toHaveBeenCalled();
    expect(unregisterMock).not.toHaveBeenCalled();
  });

  it("treats enforcement-off as if the rule were disabled", async () => {
    const { module } = await loadModule(
      { "webdriver-probe-annotate": true },
      /* enforcementEnabled */ false,
    );

    module.startWebdriverProbeRegistration();
    await flushPromises();

    expect(registerMock).not.toHaveBeenCalled();
  });
});
