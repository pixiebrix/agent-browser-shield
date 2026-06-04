// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// parse-config.ts imports `RULE_IDS` from `lib/storage`, which re-exports it
// from `rules/rule-defaults.generated`. Mock the generated module so the test
// runs against a small id set (and so storage.ts's transitive
// `rules/index.ts` import doesn't pull in every rule file — some of which
// reach for ESM-only deps that ts-jest's CJS transform can't handle).
jest.mock("../../rules/rule-defaults.generated", () => ({
  RULE_DEFAULTS: { "rule-a": true, "rule-b": false },
  RULE_IDS: ["rule-a", "rule-b"],
}));

import { parseConfig } from "../parse-config";

const KNOWN_RULE_ID = "rule-a";

describe("parseConfig", () => {
  it("returns a partial map for a valid object", () => {
    const result = parseConfig(JSON.stringify({ [KNOWN_RULE_ID]: false }));
    expect(result).toEqual({
      ok: true,
      value: { [KNOWN_RULE_ID]: false },
    });
  });

  it("rejects invalid JSON", () => {
    const result = parseConfig("{not json");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/^Invalid JSON:/);
    }
  });

  it("rejects a JSON array at the top level", () => {
    const result = parseConfig("[]");
    expect(result).toEqual({
      ok: false,
      error: "Expected a JSON object mapping rule IDs to booleans.",
    });
  });

  it("rejects null at the top level", () => {
    const result = parseConfig("null");
    expect(result).toEqual({
      ok: false,
      error: "Expected a JSON object mapping rule IDs to booleans.",
    });
  });

  it("rejects unknown rule ids", () => {
    const result = parseConfig(JSON.stringify({ "not-a-rule": true }));
    expect(result).toEqual({
      ok: false,
      error: "Unknown rule: not-a-rule",
    });
  });

  it("rejects non-boolean values", () => {
    const result = parseConfig(JSON.stringify({ [KNOWN_RULE_ID]: 1 }));
    expect(result).toEqual({
      ok: false,
      error: `Non-boolean value for ${KNOWN_RULE_ID}: number`,
    });
  });

  it("accumulates multiple errors", () => {
    const result = parseConfig(
      JSON.stringify({ "not-a-rule": true, [KNOWN_RULE_ID]: 0 }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.split("\n")).toEqual([
        "Unknown rule: not-a-rule",
        `Non-boolean value for ${KNOWN_RULE_ID}: number`,
      ]);
    }
  });

  it("accepts an empty object", () => {
    expect(parseConfig("{}")).toEqual({ ok: true, value: {} });
  });
});
