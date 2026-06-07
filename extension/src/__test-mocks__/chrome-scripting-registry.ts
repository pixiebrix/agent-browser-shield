// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Shared stateful-mock for `chrome.scripting.registerContentScripts` /
// `unregisterContentScripts` / `getRegisteredContentScripts`. The three
// main-world bundle registration modules (`webdriver-probe-registration`,
// `checkout-checkbox-defense-registration`, `shadow-root-probe-registration`)
// each ship a near-identical test that needs the same in-memory store
// semantics: `register` appends, `unregister` splices by id, `getRegistered`
// returns the current set (optionally filtered by id list).
//
// Sits under `__test-mocks__/` instead of `lib/` because it's
// test-environment plumbing — the production code never references it,
// and it depends on `chrome.scripting` having already been stubbed by
// `chrome-mv3-extras.ts` (wired through `setupFiles` in
// `jest.config.cjs`).
//
// Test usage:
//
//   let registry: ScriptingRegistryHandle;
//   beforeEach(() => {
//     // Fresh handle per test — resets jest's call history on the three
//     // shared chrome.scripting mocks and installs new implementations
//     // backed by a per-test store.
//     registry = installScriptingRegistry();
//   });
//
//   it("registers when the rule is enabled", async () => {
//     await jest.isolateModulesAsync(async () => {
//       registry.seed([{ id: "my-script", ... }]); // optional pre-state
//       const module = await import("../my-registration-module");
//       module.startMyRegistration();
//       await flushScriptingPromises();
//       expect(registry.registerMock).toHaveBeenCalledTimes(1);
//     });
//   });
//
// Customization escape hatches: each underlying mock is exposed on the
// returned handle (`registerMock`, `unregisterMock`, `getRegisteredMock`)
// so a one-off test can `mockImplementationOnce` a rejection or alter
// the return value without rewriting the helper.

export interface RegisteredScript {
  id: string;
  matches: string[];
  js: string[];
  runAt: string;
  world: string;
  allFrames: boolean;
}

export interface ScriptingRegistryHandle {
  registerMock: jest.Mock;
  unregisterMock: jest.Mock;
  getRegisteredMock: jest.Mock;
  // Snapshot of the current store. Returns a fresh array each call;
  // mutating it does not affect the store.
  registered: () => RegisteredScript[];
  // Add entries to the store. Useful for "already registered before
  // startup" scenarios that the registration module's `sync` should
  // reconcile away (or leave alone).
  seed: (scripts: RegisteredScript[]) => void;
}

export function installScriptingRegistry(): ScriptingRegistryHandle {
  const registerMock = chrome.scripting
    .registerContentScripts as unknown as jest.Mock;
  const unregisterMock = chrome.scripting
    .unregisterContentScripts as unknown as jest.Mock;
  const getRegisteredMock = chrome.scripting
    .getRegisteredContentScripts as unknown as jest.Mock;

  // Reset before installing so prior-test call history and any leftover
  // implementations are cleared. Jest's `clearMocks: true` clears call
  // history between tests but does NOT reset implementations — the
  // explicit reset here makes the helper safe to call regardless of
  // surrounding test configuration.
  registerMock.mockReset();
  unregisterMock.mockReset();
  getRegisteredMock.mockReset();

  const store: RegisteredScript[] = [];

  registerMock.mockImplementation(
    (scripts: RegisteredScript[]): Promise<void> => {
      store.push(...scripts);
      return Promise.resolve();
    },
  );
  unregisterMock.mockImplementation(
    (filter: { ids: string[] }): Promise<void> => {
      for (const id of filter.ids) {
        const index = store.findIndex((script) => script.id === id);
        if (index !== -1) {
          store.splice(index, 1);
        }
      }
      return Promise.resolve();
    },
  );
  getRegisteredMock.mockImplementation(
    (filter?: { ids?: string[] }): Promise<RegisteredScript[]> => {
      if (!filter?.ids) {
        return Promise.resolve([...store]);
      }
      return Promise.resolve(
        store.filter((script) => filter.ids?.includes(script.id)),
      );
    },
  );

  return {
    registerMock,
    unregisterMock,
    getRegisteredMock,
    registered: () => [...store],
    seed: (scripts) => {
      store.push(...scripts);
    },
  };
}

// Microtask drain. Registration modules kick off `void sync()` chains
// from synchronous `subscribe` callbacks; the test awaits this so the
// resulting promises settle before assertions run.
export function flushScriptingPromises(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
