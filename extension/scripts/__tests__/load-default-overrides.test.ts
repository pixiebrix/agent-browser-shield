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
      ruleOptions: {},
    });
  });

  it("accepts an empty object", () => {
    const file = writeFile("empty.json", "{}");
    expect(
      loadDefaultOverrides({ path: file, knownRuleIds: KNOWN_IDS }),
    ).toEqual({ rules: {}, ruleOptions: {} });
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
      ruleOptions: {},
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
      ruleOptions: {},
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
      ruleOptions: {},
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
      ruleOptions: {},
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
      ruleOptions: {},
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
      ruleOptions: {},
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
      ruleOptions: {},
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

  describe("per-rule options (ESLint-style object value)", () => {
    const RULE_OPTION_DEFAULTS = {
      "ads-hide": {
        subRules: {
          base64: true,
          hex: true,
          leetspeak: true,
        },
      },
    } as const;

    it("accepts an object value with enabled and a partial sub-rule object", () => {
      const file = writeFile(
        "with-options.json",
        JSON.stringify({
          "pii-redact": true,
          "ads-hide": {
            enabled: false,
            subRules: { leetspeak: false },
          },
        }),
      );
      expect(
        loadDefaultOverrides({
          path: file,
          knownRuleIds: KNOWN_IDS,
          ruleOptionDefaults: RULE_OPTION_DEFAULTS,
        }),
      ).toEqual({
        rules: { "pii-redact": true, "ads-hide": false },
        ruleOptions: {
          "ads-hide": { subRules: { leetspeak: false } },
        },
      });
    });

    it("treats a missing `enabled` field as unset (keeps committed default)", () => {
      const file = writeFile(
        "no-enabled.json",
        JSON.stringify({
          "ads-hide": { subRules: { hex: false } },
        }),
      );
      expect(
        loadDefaultOverrides({
          path: file,
          knownRuleIds: KNOWN_IDS,
          ruleOptionDefaults: RULE_OPTION_DEFAULTS,
        }),
      ).toEqual({
        rules: {},
        ruleOptions: {
          "ads-hide": { subRules: { hex: false } },
        },
      });
    });

    it("rejects an object value for a rule without declared options", () => {
      const file = writeFile(
        "wrong-rule.json",
        JSON.stringify({ "pii-redact": { enabled: true } }),
      );
      expect(() =>
        loadDefaultOverrides({
          path: file,
          knownRuleIds: KNOWN_IDS,
          ruleOptionDefaults: RULE_OPTION_DEFAULTS,
        }),
      ).toThrow(/object value for rules without declared options: pii-redact/);
    });

    it("rejects unknown sub-rule keys with a path-qualified name", () => {
      const file = writeFile(
        "unknown-subrule.json",
        JSON.stringify({
          "ads-hide": { subRules: { bogus: false } },
        }),
      );
      expect(() =>
        loadDefaultOverrides({
          path: file,
          knownRuleIds: KNOWN_IDS,
          ruleOptionDefaults: RULE_OPTION_DEFAULTS,
        }),
      ).toThrow(/unknown option keys: ads-hide\.subRules\.bogus/);
    });

    it("rejects unknown top-level keys under a rule object", () => {
      const file = writeFile(
        "unknown-group.json",
        JSON.stringify({
          "ads-hide": { unknownGroup: { leetspeak: false } },
        }),
      );
      expect(() =>
        loadDefaultOverrides({
          path: file,
          knownRuleIds: KNOWN_IDS,
          ruleOptionDefaults: RULE_OPTION_DEFAULTS,
        }),
      ).toThrow(/unknown option keys: ads-hide\.unknownGroup/);
    });

    it("rejects non-boolean sub-rule leaves with a path-qualified name", () => {
      const file = writeFile(
        "nonbool-subrule.json",
        JSON.stringify({
          "ads-hide": { subRules: { leetspeak: "off" } },
        }),
      );
      expect(() =>
        loadDefaultOverrides({
          path: file,
          knownRuleIds: KNOWN_IDS,
          ruleOptionDefaults: RULE_OPTION_DEFAULTS,
        }),
      ).toThrow(/non-boolean option values for: ads-hide\.subRules\.leetspeak/);
    });

    it("rejects a non-boolean `enabled` field", () => {
      const file = writeFile(
        "nonbool-enabled.json",
        JSON.stringify({
          "ads-hide": { enabled: "yes" },
        }),
      );
      expect(() =>
        loadDefaultOverrides({
          path: file,
          knownRuleIds: KNOWN_IDS,
          ruleOptionDefaults: RULE_OPTION_DEFAULTS,
        }),
      ).toThrow(/non-boolean values for: ads-hide\.enabled/);
    });

    it("omits the rule from ruleOptions when no sub-rule overrides are provided", () => {
      const file = writeFile(
        "enabled-only.json",
        JSON.stringify({ "ads-hide": { enabled: true } }),
      );
      expect(
        loadDefaultOverrides({
          path: file,
          knownRuleIds: KNOWN_IDS,
          ruleOptionDefaults: RULE_OPTION_DEFAULTS,
        }),
      ).toEqual({
        rules: { "ads-hide": true },
        ruleOptions: {},
      });
    });
  });
});
