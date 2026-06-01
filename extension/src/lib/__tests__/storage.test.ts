// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Exercises how `lib/storage.ts` composes its `DEFAULT_STATES` from the
// committed `RULE_DEFAULTS` and the build-time
// `process.env.EXTENSION_DEFAULT_OVERRIDES` injection. The override is
// parsed at module load, so each case sets the env var and then reloads
// the module via `jest.isolateModules`. The webext-storage stub
// (jest.config.cjs `moduleNameMapper`) is also re-instantiated inside the
// isolate, so its in-memory map starts empty — `getRuleStates()` returns
// the freshly-derived defaults instead of any stale stored value from a
// previous case.

// Storage transitively pulls in the full rule catalog, which imports
// `nanoid` and `abort-utils`. Both are pure-ESM; ts-jest with
// `useESM: false` (jest.config.cjs) can't transform them. The catalog
// invariants test mocks the same modules for the same reason.
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

import { RULE_DEFAULTS } from "../../rules/rule-defaults.generated";
import type { getRuleStates as GetRuleStates } from "../storage";

interface StorageModule {
  getRuleStates: typeof GetRuleStates;
}

async function loadStorage(): Promise<StorageModule> {
  let module!: StorageModule;
  await jest.isolateModulesAsync(async () => {
    module = await import("../storage");
  });
  return module;
}

describe("storage default states", () => {
  // `ProcessEnv.EXTENSION_DEFAULT_OVERRIDES` is declared as `string` in
  // globals.d.ts (Bun substitutes a literal at build time, so the runtime
  // value is never undefined in the shipped bundle). In tests the env var
  // genuinely might be unset, so widen the type for the save/restore dance.
  const original = (process.env as Record<string, string | undefined>)
    .EXTENSION_DEFAULT_OVERRIDES;

  afterEach(() => {
    if (original === undefined) {
      delete (process.env as Record<string, unknown>)
        .EXTENSION_DEFAULT_OVERRIDES;
    } else {
      process.env.EXTENSION_DEFAULT_OVERRIDES = original;
    }
  });

  it("uses RULE_DEFAULTS when no override is set", async () => {
    delete process.env.EXTENSION_DEFAULT_OVERRIDES;
    const { getRuleStates } = await loadStorage();
    const states = await getRuleStates();
    expect(states).toEqual(RULE_DEFAULTS);
  });

  it("uses RULE_DEFAULTS when override is an empty object", async () => {
    process.env.EXTENSION_DEFAULT_OVERRIDES = "{}";
    const { getRuleStates } = await loadStorage();
    const states = await getRuleStates();
    expect(states).toEqual(RULE_DEFAULTS);
  });

  it("flips only the rules listed in a partial override", async () => {
    // Pick one rule that defaults true and one that defaults false so the
    // test exercises both directions regardless of which way the committed
    // defaults happen to lean.
    const trueRule = Object.entries(RULE_DEFAULTS).find(
      ([, value]) => value,
    )?.[0];
    const falseRule = Object.entries(RULE_DEFAULTS).find(
      ([, value]) => !value,
    )?.[0];
    if (trueRule === undefined || falseRule === undefined) {
      throw new Error(
        "Expected RULE_DEFAULTS to include at least one true and one false default for this test.",
      );
    }
    process.env.EXTENSION_DEFAULT_OVERRIDES = JSON.stringify({
      [trueRule]: false,
      [falseRule]: true,
    });
    const { getRuleStates } = await loadStorage();
    const states = await getRuleStates();
    expect(states[trueRule]).toBe(false);
    expect(states[falseRule]).toBe(true);
    // Untouched rules keep their committed defaults.
    for (const [id, value] of Object.entries(RULE_DEFAULTS)) {
      if (id === trueRule || id === falseRule) {
        continue;
      }
      expect(states[id]).toBe(value);
    }
  });

  it("falls back to RULE_DEFAULTS when the override env var is malformed JSON", async () => {
    process.env.EXTENSION_DEFAULT_OVERRIDES = "{ not json";
    const { getRuleStates } = await loadStorage();
    const states = await getRuleStates();
    expect(states).toEqual(RULE_DEFAULTS);
  });

  it("ignores non-boolean override values without throwing", async () => {
    const someRule = Object.keys(RULE_DEFAULTS)[0] as string;
    process.env.EXTENSION_DEFAULT_OVERRIDES = JSON.stringify({
      [someRule]: "yes",
    });
    const { getRuleStates } = await loadStorage();
    const states = await getRuleStates();
    expect(states).toEqual(RULE_DEFAULTS);
  });

  it("ignores unknown rule ids in the override env var", async () => {
    process.env.EXTENSION_DEFAULT_OVERRIDES = JSON.stringify({
      "rule-that-does-not-exist": true,
    });
    const { getRuleStates } = await loadStorage();
    const states = await getRuleStates();
    expect(states).toEqual(RULE_DEFAULTS);
  });
});
