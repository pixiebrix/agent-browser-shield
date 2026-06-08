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

import { RULE_DEFAULTS as RAW_RULE_DEFAULTS } from "../../rules/rule-metadata";
import type * as Storage from "../storage";

type StorageModule = typeof Storage;

// `RULE_DEFAULTS` is exported as a deeply-typed `as const` object so callers
// see per-key literal types. For these tests we want plain string indexing —
// pick a rule id off Object.keys, look up its default. Widen via this alias.
const RULE_DEFAULTS = RAW_RULE_DEFAULTS as Readonly<Record<string, boolean>>;

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

  // parseOverrides rejects anything that isn't a plain object: null,
  // arrays, and primitives all decode but should be ignored. Without this
  // case the `Array.isArray(parsed)` / typeof guard at the top of
  // parseOverrides goes uncovered.
  it.each([
    ["null", "null"],
    ["an array", JSON.stringify([true, false])],
    ["a primitive number", "42"],
  ])("ignores EXTENSION_DEFAULT_OVERRIDES that decodes to %s", async (_label, raw) => {
    process.env.EXTENSION_DEFAULT_OVERRIDES = raw;
    const { getRuleStates } = await loadStorage();
    await expect(getRuleStates()).resolves.toEqual(RULE_DEFAULTS);
  });
});

describe("normalize via getRuleStates", () => {
  // Pick stable rule ids off the live catalog so the test doesn't tie itself
  // to the iteration order of RULE_DEFAULTS.
  function pickRuleIds(): { first: string; second: string } {
    const ids = Object.keys(RULE_DEFAULTS);
    const first = ids[0];
    const second = ids[1];
    if (!first || !second) {
      throw new Error("RULE_DEFAULTS must have at least two entries");
    }
    return { first, second };
  }

  it("substitutes the codegen default for any non-boolean stored value", async () => {
    const { getRuleStates, ruleStatesStorage } = await loadStorage();
    const { first, second } = pickRuleIds();
    // Cast to bypass the typed shape — the whole point is that the storage
    // layer's normalize() drops the corrupt string value.
    await ruleStatesStorage.set({
      [first]: !RULE_DEFAULTS[first],
      [second]: "yes",
    } as unknown as Storage.RuleStates);

    const states = await getRuleStates();
    expect(states[first]).toBe(!RULE_DEFAULTS[first]);
    expect(states[second]).toBe(RULE_DEFAULTS[second]);
  });

  it("fills in missing rule ids from defaults when stored state is partial", async () => {
    const { getRuleStates, ruleStatesStorage } = await loadStorage();
    const { first } = pickRuleIds();
    await ruleStatesStorage.set({ [first]: !RULE_DEFAULTS[first] });

    const states = await getRuleStates();
    expect(states[first]).toBe(!RULE_DEFAULTS[first]);
    // Every other rule still resolves to its codegen default.
    for (const [id, value] of Object.entries(RULE_DEFAULTS)) {
      if (id === first) {
        continue;
      }
      expect(states[id]).toBe(value);
    }
  });
});

describe("setRuleEnabled", () => {
  it("flips one rule while preserving the others", async () => {
    const { getRuleStates, setRuleEnabled } = await loadStorage();
    const target = Object.keys(RULE_DEFAULTS)[0];
    if (!target) {
      throw new Error("RULE_DEFAULTS must have at least one entry");
    }
    const next = !RULE_DEFAULTS[target];

    await setRuleEnabled(target, next);

    const states = await getRuleStates();
    expect(states[target]).toBe(next);
    for (const [id, value] of Object.entries(RULE_DEFAULTS)) {
      if (id === target) {
        continue;
      }
      expect(states[id]).toBe(value);
    }
  });

  it("notifies subscribers when state changes", async () => {
    const { setRuleEnabled, subscribe } = await loadStorage();
    const target = Object.keys(RULE_DEFAULTS)[0];
    if (!target) {
      throw new Error("RULE_DEFAULTS must have at least one entry");
    }
    const listener = jest.fn();
    subscribe(listener);

    await setRuleEnabled(target, !RULE_DEFAULTS[target]);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ [target]: !RULE_DEFAULTS[target] }),
    );
  });
});

describe("setAllRuleStates", () => {
  it("normalizes partial input before writing — missing ids fill from defaults", async () => {
    const { getRuleStates, setAllRuleStates } = await loadStorage();
    const target = Object.keys(RULE_DEFAULTS)[0];
    if (!target) {
      throw new Error("RULE_DEFAULTS must have at least one entry");
    }

    await setAllRuleStates({ [target]: !RULE_DEFAULTS[target] });

    const states = await getRuleStates();
    expect(states[target]).toBe(!RULE_DEFAULTS[target]);
    for (const [id, value] of Object.entries(RULE_DEFAULTS)) {
      if (id === target) {
        continue;
      }
      expect(states[id]).toBe(value);
    }
  });

  it("drops non-boolean values via normalize before writing", async () => {
    const { getRuleStates, setAllRuleStates } = await loadStorage();
    const target = Object.keys(RULE_DEFAULTS)[0];
    if (!target) {
      throw new Error("RULE_DEFAULTS must have at least one entry");
    }

    // Cast to bypass the typed shape — normalize() inside setAllRuleStates
    // is responsible for dropping the corrupt string value.
    await setAllRuleStates({
      [target]: "junk",
    } as unknown as Partial<Storage.RuleStates>);

    // junk replaced with default → stored map equals defaults.
    await expect(getRuleStates()).resolves.toEqual(RULE_DEFAULTS);
  });
});

describe("subscribe", () => {
  it("stops invoking the listener after the returned cleanup runs", async () => {
    const { setRuleEnabled, subscribe } = await loadStorage();
    const target = Object.keys(RULE_DEFAULTS)[0];
    if (!target) {
      throw new Error("RULE_DEFAULTS must have at least one entry");
    }
    const listener = jest.fn();
    const cleanup = subscribe(listener);

    await setRuleEnabled(target, !RULE_DEFAULTS[target]);
    expect(listener).toHaveBeenCalledTimes(1);

    cleanup();
    await setRuleEnabled(target, Boolean(RULE_DEFAULTS[target]));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
