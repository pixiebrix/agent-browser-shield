// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Exercises the dynamic main-world content-script registration for the
// shadow-root probe. Mirrors `webdriver-probe-registration.test.ts` —
// the module syncs chrome.scripting state against (rule-enabled AND
// enforcement-enabled), so the test covers the four corners plus the
// no-op short-circuits when the desired state already matches.
//
// Identifiers are prefixed `shadowProbeReg`/`ShadowProbeReg` to avoid
// colliding with the same shapes in the sibling
// `webdriver-probe-registration.test.ts`. Both files have no
// import/export statements, so TypeScript treats them as global scripts
// under `tsconfig.test.json` and identical top-level names from
// different test files merge. Biome's `noExportsInTest` rule blocks
// the more conventional `export {}` script-to-module workaround.

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

const shadowProbeRegisterMock = chrome.scripting
  .registerContentScripts as unknown as jest.Mock;
const shadowProbeUnregisterMock = chrome.scripting
  .unregisterContentScripts as unknown as jest.Mock;
const shadowProbeGetRegisteredMock = chrome.scripting
  .getRegisteredContentScripts as unknown as jest.Mock;

interface ShadowProbeRegistrationModule {
  startShadowRootProbeRegistration: () => void;
}

interface ShadowProbeRegisteredScript {
  id: string;
  matches: string[];
  js: string[];
  runAt: string;
  world: string;
  allFrames: boolean;
}

function shadowProbeFlushPromises(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

async function shadowProbeLoadModule(
  overrides: Record<string, boolean>,
  enforcementEnabled = true,
  initiallyRegistered = false,
): Promise<{ module: ShadowProbeRegistrationModule }> {
  let module!: ShadowProbeRegistrationModule;

  await jest.isolateModulesAsync(async () => {
    process.env.EXTENSION_DEFAULT_OVERRIDES = JSON.stringify(overrides);

    const registered: ShadowProbeRegisteredScript[] = initiallyRegistered
      ? [
          {
            id: "closed-shadow-root-annotate-main-world",
            matches: ["<all_urls>"],
            js: ["shadow-root-probe.js"],
            runAt: "document_start",
            world: "MAIN",
            allFrames: true,
          },
        ]
      : [];

    shadowProbeRegisterMock.mockImplementation(
      (scripts: ShadowProbeRegisteredScript[]): Promise<void> => {
        registered.push(...scripts);
        return Promise.resolve();
      },
    );
    shadowProbeUnregisterMock.mockImplementation(
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
    shadowProbeGetRegisteredMock.mockImplementation(
      (filter?: { ids?: string[] }): Promise<ShadowProbeRegisteredScript[]> => {
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

    module = await import("../shadow-root-probe-registration");
  });

  return { module };
}

beforeEach(() => {
  shadowProbeRegisterMock.mockReset();
  shadowProbeUnregisterMock.mockReset();
  shadowProbeGetRegisteredMock.mockReset();
});

afterEach(() => {
  delete process.env.EXTENSION_DEFAULT_OVERRIDES;
});

describe("startShadowRootProbeRegistration", () => {
  it("registers the main-world script on startup when the rule is enabled", async () => {
    const { module } = await shadowProbeLoadModule({
      "closed-shadow-root-annotate": true,
    });

    module.startShadowRootProbeRegistration();
    await shadowProbeFlushPromises();

    expect(shadowProbeRegisterMock).toHaveBeenCalledTimes(1);
    const [scripts] = shadowProbeRegisterMock.mock.calls[0] as [
      ShadowProbeRegisteredScript[],
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
    const { module } = await shadowProbeLoadModule({
      "closed-shadow-root-annotate": false,
    });

    module.startShadowRootProbeRegistration();
    await shadowProbeFlushPromises();

    expect(shadowProbeRegisterMock).not.toHaveBeenCalled();
    expect(shadowProbeUnregisterMock).not.toHaveBeenCalled();
  });

  it("unregisters when an already-registered script becomes ineligible", async () => {
    const { module } = await shadowProbeLoadModule(
      { "closed-shadow-root-annotate": false },
      true,
      /* initiallyRegistered */ true,
    );

    module.startShadowRootProbeRegistration();
    await shadowProbeFlushPromises();

    expect(shadowProbeUnregisterMock).toHaveBeenCalledWith({
      ids: ["closed-shadow-root-annotate-main-world"],
    });
  });

  it("does not re-register if the desired state already matches", async () => {
    const { module } = await shadowProbeLoadModule(
      { "closed-shadow-root-annotate": true },
      true,
      /* initiallyRegistered */ true,
    );

    module.startShadowRootProbeRegistration();
    await shadowProbeFlushPromises();

    expect(shadowProbeRegisterMock).not.toHaveBeenCalled();
    expect(shadowProbeUnregisterMock).not.toHaveBeenCalled();
  });

  it("treats enforcement-off as if the rule were disabled", async () => {
    const { module } = await shadowProbeLoadModule(
      { "closed-shadow-root-annotate": true },
      /* enforcementEnabled */ false,
    );

    module.startShadowRootProbeRegistration();
    await shadowProbeFlushPromises();

    expect(shadowProbeRegisterMock).not.toHaveBeenCalled();
  });
});
