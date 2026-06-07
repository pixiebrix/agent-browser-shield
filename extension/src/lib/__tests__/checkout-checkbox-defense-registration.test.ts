// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Exercises the dynamic main-world content-script registration that
// `lib/checkout-checkbox-defense-registration.ts` wires up. Mirrors
// `webdriver-probe-registration.test.ts` — same shape, different script
// id and filename. The module syncs chrome.scripting state against
// (rule-enabled AND enforcement-enabled).

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

const defenseRegister = chrome.scripting
  .registerContentScripts as unknown as jest.Mock;
const defenseUnregister = chrome.scripting
  .unregisterContentScripts as unknown as jest.Mock;
const defenseGetRegistered = chrome.scripting
  .getRegisteredContentScripts as unknown as jest.Mock;

interface DefenseModule {
  startCheckoutCheckboxDefenseRegistration: () => void;
}

interface DefenseScript {
  id: string;
  matches: string[];
  js: string[];
  runAt: string;
  world: string;
  allFrames: boolean;
}

function flushDefense(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

async function loadDefenseModule(
  overrides: Record<string, boolean>,
  enforcementEnabled = true,
  initiallyRegistered = false,
): Promise<{ module: DefenseModule }> {
  let module!: DefenseModule;

  await jest.isolateModulesAsync(async () => {
    process.env.EXTENSION_DEFAULT_OVERRIDES = JSON.stringify(overrides);

    const registered: DefenseScript[] = initiallyRegistered
      ? [
          {
            id: "checkout-checkbox-sanitize-main-world",
            matches: ["<all_urls>"],
            js: ["checkout-checkbox-defense.js"],
            runAt: "document_start",
            world: "MAIN",
            allFrames: true,
          },
        ]
      : [];

    defenseRegister.mockImplementation(
      (scripts: DefenseScript[]): Promise<void> => {
        registered.push(...scripts);
        return Promise.resolve();
      },
    );
    defenseUnregister.mockImplementation(
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
    defenseGetRegistered.mockImplementation(
      (filter?: { ids?: string[] }): Promise<DefenseScript[]> => {
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

    module = await import("../checkout-checkbox-defense-registration");
  });

  return { module };
}

beforeEach(() => {
  defenseRegister.mockReset();
  defenseUnregister.mockReset();
  defenseGetRegistered.mockReset();
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
    await flushDefense();

    expect(defenseRegister).toHaveBeenCalledTimes(1);
    const [scripts] = defenseRegister.mock.calls[0] as [DefenseScript[]];
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
    await flushDefense();

    expect(defenseRegister).not.toHaveBeenCalled();
    expect(defenseUnregister).not.toHaveBeenCalled();
  });

  it("unregisters when an already-registered script becomes ineligible", async () => {
    const { module } = await loadDefenseModule(
      { "checkout-checkbox-sanitize": false },
      true,
      /* initiallyRegistered */ true,
    );

    module.startCheckoutCheckboxDefenseRegistration();
    await flushDefense();

    expect(defenseUnregister).toHaveBeenCalledWith({
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
    await flushDefense();

    expect(defenseRegister).not.toHaveBeenCalled();
    expect(defenseUnregister).not.toHaveBeenCalled();
  });

  it("treats enforcement-off as if the rule were disabled", async () => {
    const { module } = await loadDefenseModule(
      { "checkout-checkbox-sanitize": true },
      /* enforcementEnabled */ false,
    );

    module.startCheckoutCheckboxDefenseRegistration();
    await flushDefense();

    expect(defenseRegister).not.toHaveBeenCalled();
  });
});
