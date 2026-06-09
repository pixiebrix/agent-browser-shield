// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDefaultOverrides } from "../load-default-overrides";

const KNOWN_IDS = ["pii-redact", "reviews-redact", "ads-hide"] as const;

describe("loadDefaultOverrides", () => {
  let temporary: string;

  beforeEach(() => {
    temporary = mkdtempSync(join(tmpdir(), "abs-defaults-"));
  });

  afterEach(() => {
    rmSync(temporary, { recursive: true, force: true });
  });

  function writeFile(name: string, body: string): string {
    const file = join(temporary, name);
    writeFileSync(file, body);
    return file;
  }

  it("returns rule overrides for a valid file", () => {
    const file = writeFile(
      "ok.json",
      JSON.stringify({ "pii-redact": true, "reviews-redact": false }),
    );
    expect(
      loadDefaultOverrides({ path: file, knownRuleIds: KNOWN_IDS }),
    ).toEqual({
      rules: { "pii-redact": true, "reviews-redact": false },
    });
  });

  it("accepts an empty object", () => {
    const file = writeFile("empty.json", "{}");
    expect(
      loadDefaultOverrides({ path: file, knownRuleIds: KNOWN_IDS }),
    ).toEqual({ rules: {} });
  });

  it("extracts the optionsButton reserved key alongside rules", () => {
    const file = writeFile(
      "with-options-button.json",
      JSON.stringify({ "pii-redact": true, optionsButton: false }),
    );
    expect(
      loadDefaultOverrides({ path: file, knownRuleIds: KNOWN_IDS }),
    ).toEqual({
      rules: { "pii-redact": true },
      optionsButton: false,
    });
  });

  it("accepts optionsButton on its own", () => {
    const file = writeFile(
      "only-options-button.json",
      JSON.stringify({ optionsButton: true }),
    );
    expect(
      loadDefaultOverrides({ path: file, knownRuleIds: KNOWN_IDS }),
    ).toEqual({
      rules: {},
      optionsButton: true,
    });
  });

  it("rejects a non-boolean optionsButton value", () => {
    const file = writeFile(
      "bad-options-button.json",
      JSON.stringify({ optionsButton: "yes" }),
    );
    expect(() =>
      loadDefaultOverrides({ path: file, knownRuleIds: KNOWN_IDS }),
    ).toThrow(/non-boolean values for: optionsButton/);
  });

  it("extracts the runOnInactiveTabs reserved key alongside rules", () => {
    const file = writeFile(
      "with-run-on-inactive.json",
      JSON.stringify({ "pii-redact": true, runOnInactiveTabs: true }),
    );
    expect(
      loadDefaultOverrides({ path: file, knownRuleIds: KNOWN_IDS }),
    ).toEqual({
      rules: { "pii-redact": true },
      runOnInactiveTabs: true,
    });
  });

  it("rejects a non-boolean runOnInactiveTabs value", () => {
    const file = writeFile(
      "bad-run-on-inactive.json",
      JSON.stringify({ runOnInactiveTabs: "always" }),
    );
    expect(() =>
      loadDefaultOverrides({ path: file, knownRuleIds: KNOWN_IDS }),
    ).toThrow(/non-boolean values for: runOnInactiveTabs/);
  });

  it("extracts the debugTrace reserved key alongside rules", () => {
    const file = writeFile(
      "with-debug-trace.json",
      JSON.stringify({ "pii-redact": true, debugTrace: true }),
    );
    expect(
      loadDefaultOverrides({ path: file, knownRuleIds: KNOWN_IDS }),
    ).toEqual({
      rules: { "pii-redact": true },
      debugTrace: true,
    });
  });

  it("accepts debugTrace on its own", () => {
    const file = writeFile(
      "only-debug-trace.json",
      JSON.stringify({ debugTrace: false }),
    );
    expect(
      loadDefaultOverrides({ path: file, knownRuleIds: KNOWN_IDS }),
    ).toEqual({
      rules: {},
      debugTrace: false,
    });
  });

  it("rejects a non-boolean debugTrace value", () => {
    const file = writeFile(
      "bad-debug-trace.json",
      JSON.stringify({ debugTrace: "on" }),
    );
    expect(() =>
      loadDefaultOverrides({ path: file, knownRuleIds: KNOWN_IDS }),
    ).toThrow(/non-boolean values for: debugTrace/);
  });

  it("extracts the placeholderAdaptivePalette reserved key alongside rules", () => {
    const file = writeFile(
      "with-adaptive-palette.json",
      JSON.stringify({ "pii-redact": true, placeholderAdaptivePalette: true }),
    );
    expect(
      loadDefaultOverrides({ path: file, knownRuleIds: KNOWN_IDS }),
    ).toEqual({
      rules: { "pii-redact": true },
      placeholderAdaptivePalette: true,
    });
  });

  it("accepts placeholderAdaptivePalette on its own", () => {
    const file = writeFile(
      "only-adaptive-palette.json",
      JSON.stringify({ placeholderAdaptivePalette: false }),
    );
    expect(
      loadDefaultOverrides({ path: file, knownRuleIds: KNOWN_IDS }),
    ).toEqual({
      rules: {},
      placeholderAdaptivePalette: false,
    });
  });

  it("rejects a non-boolean placeholderAdaptivePalette value", () => {
    const file = writeFile(
      "bad-adaptive-palette.json",
      JSON.stringify({ placeholderAdaptivePalette: "on" }),
    );
    expect(() =>
      loadDefaultOverrides({ path: file, knownRuleIds: KNOWN_IDS }),
    ).toThrow(/non-boolean values for: placeholderAdaptivePalette/);
  });

  it("throws when the file does not exist", () => {
    expect(() =>
      loadDefaultOverrides({
        path: join(temporary, "does-not-exist.json"),
        knownRuleIds: KNOWN_IDS,
      }),
    ).toThrow(/could not be read/);
  });

  it("throws on invalid JSON", () => {
    const file = writeFile("bad.json", "{ not json");
    expect(() =>
      loadDefaultOverrides({ path: file, knownRuleIds: KNOWN_IDS }),
    ).toThrow(/is not valid JSON/);
  });

  it("throws when the root is not an object", () => {
    const file = writeFile("array.json", "[]");
    expect(() =>
      loadDefaultOverrides({ path: file, knownRuleIds: KNOWN_IDS }),
    ).toThrow(/must be a JSON object/);
  });

  it("rejects unknown keys", () => {
    const file = writeFile(
      "unknown.json",
      JSON.stringify({ "pii-redact": true, "bogus-rule": false }),
    );
    expect(() =>
      loadDefaultOverrides({ path: file, knownRuleIds: KNOWN_IDS }),
    ).toThrow(/unknown keys: bogus-rule/);
  });

  it("rejects non-boolean values", () => {
    const file = writeFile(
      "nonbool.json",
      JSON.stringify({ "pii-redact": "yes" }),
    );
    expect(() =>
      loadDefaultOverrides({ path: file, knownRuleIds: KNOWN_IDS }),
    ).toThrow(/non-boolean values for: pii-redact/);
  });

  it("reports unknown ids and non-boolean values together", () => {
    const file = writeFile(
      "mixed.json",
      JSON.stringify({ "bogus-rule": true, "pii-redact": 1 }),
    );
    expect(() =>
      loadDefaultOverrides({ path: file, knownRuleIds: KNOWN_IDS }),
    ).toThrow(/unknown keys: bogus-rule.*non-boolean values for: pii-redact/);
  });
});
