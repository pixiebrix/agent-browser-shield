// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Exercises the generic page-world hook life-cycle in
// `lib/page-world-hook.ts` — the register/unregister/sync reconcile that the
// four concrete hooks share (see `page-world-hooks.test.ts` for the table).
// The four corners (eligible/ineligible × registered/not) plus the no-op
// short-circuit and the reconcile-on-subscribe flip are covered here once,
// rather than re-proved per hook.
//
// `chrome.scripting`'s in-memory store comes from the shared
// `installScriptingRegistry()` helper — see
// `__test-mocks__/chrome-scripting-registry.ts` for the contract.

import type { ScriptingRegistryHandle } from "../../__test-mocks__/chrome-scripting-registry";
import {
  flushScriptingPromises,
  installScriptingRegistry,
} from "../../__test-mocks__/chrome-scripting-registry";
import { createPageWorldHook, injectPageWorldScript } from "../page-world-hook";

let registry: ScriptingRegistryHandle;

beforeEach(() => {
  registry = installScriptingRegistry();
});

const SCRIPT = {
  scriptId: "test-hook-main-world",
  scriptFile: "test-hook.js",
  logLabel: "test-hook",
  allFrames: false as const,
};

function seedRegistered(): void {
  registry.seed([
    {
      id: SCRIPT.scriptId,
      matches: ["<all_urls>"],
      js: [SCRIPT.scriptFile],
      runAt: "document_start",
      world: "MAIN",
      allFrames: SCRIPT.allFrames,
    },
  ]);
}

describe("createPageWorldHook", () => {
  it("registers on startup when eligible", async () => {
    const hook = createPageWorldHook({
      ...SCRIPT,
      shouldRegister: () => Promise.resolve(true),
      subscribe: [],
    });

    hook.start();
    await flushScriptingPromises();

    expect(registry.registerMock).toHaveBeenCalledTimes(1);
    const [scripts] = registry.registerMock.mock.calls[0] as [
      Array<Record<string, unknown>>,
    ];
    expect(scripts[0]).toMatchObject({
      id: SCRIPT.scriptId,
      matches: ["<all_urls>"],
      js: [SCRIPT.scriptFile],
      runAt: "document_start",
      world: "MAIN",
      allFrames: false,
      persistAcrossSessions: true,
    });
  });

  it("does nothing on startup when ineligible and not registered", async () => {
    const hook = createPageWorldHook({
      ...SCRIPT,
      shouldRegister: () => Promise.resolve(false),
      subscribe: [],
    });

    hook.start();
    await flushScriptingPromises();

    expect(registry.registerMock).not.toHaveBeenCalled();
    expect(registry.unregisterMock).not.toHaveBeenCalled();
  });

  it("unregisters when an already-registered script becomes ineligible", async () => {
    seedRegistered();
    const hook = createPageWorldHook({
      ...SCRIPT,
      shouldRegister: () => Promise.resolve(false),
      subscribe: [],
    });

    hook.start();
    await flushScriptingPromises();

    expect(registry.unregisterMock).toHaveBeenCalledWith({
      ids: [SCRIPT.scriptId],
    });
  });

  it("does not re-register when the desired state already matches", async () => {
    seedRegistered();
    const hook = createPageWorldHook({
      ...SCRIPT,
      shouldRegister: () => Promise.resolve(true),
      subscribe: [],
    });

    hook.start();
    await flushScriptingPromises();

    expect(registry.registerMock).not.toHaveBeenCalled();
    expect(registry.unregisterMock).not.toHaveBeenCalled();
  });

  it("reconciles when a subscribed change source fires after startup", async () => {
    let eligible = false;
    let fire: (() => void) | undefined;
    const hook = createPageWorldHook({
      ...SCRIPT,
      shouldRegister: () => Promise.resolve(eligible),
      // Capture the reconcile callback so the test can drive a change.
      subscribe: [
        (listener) => {
          fire = listener;
        },
      ],
    });

    hook.start();
    await flushScriptingPromises();
    expect(registry.registerMock).not.toHaveBeenCalled();

    eligible = true;
    fire?.();
    await flushScriptingPromises();

    expect(registry.registerMock).toHaveBeenCalledTimes(1);
  });

  it("subscribes every change source passed in the config", () => {
    const subscribeA = jest.fn();
    const subscribeB = jest.fn();
    const hook = createPageWorldHook({
      ...SCRIPT,
      shouldRegister: () => Promise.resolve(false),
      subscribe: [subscribeA, subscribeB],
    });

    hook.start();

    expect(subscribeA).toHaveBeenCalledTimes(1);
    expect(subscribeB).toHaveBeenCalledTimes(1);
  });
});

describe("injectPageWorldScript", () => {
  const installFunction = function (this: Window): void {
    // page-world install fn — body is irrelevant to the dispatch test
  };

  beforeEach(() => {
    (chrome.scripting.executeScript as jest.Mock).mockReset();
    (chrome.scripting.executeScript as jest.Mock).mockResolvedValue(undefined);
  });

  it("runs the install fn in the page world of the sender's frame", () => {
    injectPageWorldScript(
      { tab: { id: 7 }, frameId: 3 } as chrome.runtime.MessageSender,
      installFunction,
      "inject-test-hook",
    );

    expect(chrome.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 7, frameIds: [3] },
      world: "MAIN",
      func: installFunction,
    });
  });

  it("targets the whole tab when the sender has no frame id", () => {
    injectPageWorldScript(
      { tab: { id: 7 } } as chrome.runtime.MessageSender,
      installFunction,
      "inject-test-hook",
    );

    expect(chrome.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 7, frameIds: undefined },
      world: "MAIN",
      func: installFunction,
    });
  });

  it("is a no-op when the sender has no tab", () => {
    // A bare `{}` satisfies MessageSender (every field is optional) — no cast.
    injectPageWorldScript({}, installFunction, "inject-test-hook");

    expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
  });
});
