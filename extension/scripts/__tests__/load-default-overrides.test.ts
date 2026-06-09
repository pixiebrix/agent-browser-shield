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
    ).toThrow(/optionsButton: .*expected boolean/);
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
    ).toThrow(/runOnInactiveTabs: .*expected boolean/);
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
    ).toThrow(/debugTrace: .*expected boolean/);
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
    ).toThrow(/placeholderAdaptivePalette: .*expected boolean/);
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
    ).toThrow(/bogus-rule: unrecognized key/);
  });

  it("rejects non-boolean values", () => {
    const file = writeFile(
      "nonbool.json",
      JSON.stringify({ "pii-redact": "yes" }),
    );
    expect(() =>
      loadDefaultOverrides({ path: file, knownRuleIds: KNOWN_IDS }),
    ).toThrow(/pii-redact: .*expected boolean/);
  });

  it("reports unknown ids and non-boolean values together", () => {
    const file = writeFile(
      "mixed.json",
      JSON.stringify({ "bogus-rule": true, "pii-redact": 1 }),
    );
    expect(() =>
      loadDefaultOverrides({ path: file, knownRuleIds: KNOWN_IDS }),
    ).toThrow(
      /pii-redact: .*expected boolean[\s\S]*bogus-rule: unrecognized key/,
    );
  });

  describe("per-rule options (ESLint-style object value)", () => {
    // Fixture covers both leaf shapes the validator now supports: bare
    // boolean (`base64`) and `{ enabled, ...thresholds }` per-sub-rule
    // (`hex`, `leetspeak`).
    const RULE_OPTION_DEFAULTS = {
      "ads-hide": {
        subRules: {
          base64: true,
          hex: {
            enabled: true,
            minLength: 160,
            printableRatio: 0.85,
          },
          leetspeak: {
            enabled: true,
            minSubstitutions: 4,
          },
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
            subRules: { base64: false },
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
          "ads-hide": { subRules: { base64: false } },
        },
      });
    });

    it("accepts numeric threshold overrides at number-typed leaves", () => {
      const file = writeFile(
        "numeric-thresholds.json",
        JSON.stringify({
          "ads-hide": {
            subRules: {
              hex: { minLength: 240, printableRatio: 0.9 },
              leetspeak: { minSubstitutions: 6 },
            },
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
        rules: {},
        ruleOptions: {
          "ads-hide": {
            subRules: {
              hex: { minLength: 240, printableRatio: 0.9 },
              leetspeak: { minSubstitutions: 6 },
            },
          },
        },
      });
    });

    it("accepts a bare-boolean shorthand at a `{ enabled, ... }` sub-rule", () => {
      const file = writeFile(
        "boolean-shorthand.json",
        JSON.stringify({
          "ads-hide": {
            subRules: { hex: false },
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
        rules: {},
        ruleOptions: {
          "ads-hide": { subRules: { hex: { enabled: false } } },
        },
      });
    });

    it("treats a missing `enabled` field as unset (keeps committed default)", () => {
      const file = writeFile(
        "no-enabled.json",
        JSON.stringify({
          "ads-hide": { subRules: { base64: false } },
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
          "ads-hide": { subRules: { base64: false } },
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
      ).toThrow(/pii-redact: .*expected boolean/);
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
      ).toThrow(/ads-hide\.subRules\.bogus: unrecognized key/);
    });

    it("rejects unknown sub-fields under a `{ enabled, ... }` sub-rule", () => {
      const file = writeFile(
        "unknown-subfield.json",
        JSON.stringify({
          "ads-hide": { subRules: { hex: { bogus: 1 } } },
        }),
      );
      expect(() =>
        loadDefaultOverrides({
          path: file,
          knownRuleIds: KNOWN_IDS,
          ruleOptionDefaults: RULE_OPTION_DEFAULTS,
        }),
      ).toThrow(/ads-hide\.subRules\.hex\.bogus: unrecognized key/);
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
      ).toThrow(/ads-hide\.unknownGroup: unrecognized key/);
    });

    it("rejects non-boolean leaves at boolean-typed positions", () => {
      const file = writeFile(
        "nonbool-subrule.json",
        JSON.stringify({
          "ads-hide": { subRules: { base64: "off" } },
        }),
      );
      expect(() =>
        loadDefaultOverrides({
          path: file,
          knownRuleIds: KNOWN_IDS,
          ruleOptionDefaults: RULE_OPTION_DEFAULTS,
        }),
      ).toThrow(/ads-hide\.subRules\.base64: .*expected boolean/);
    });

    it("rejects non-number leaves at number-typed positions", () => {
      const file = writeFile(
        "nonnumber-threshold.json",
        JSON.stringify({
          "ads-hide": { subRules: { hex: { minLength: "240" } } },
        }),
      );
      expect(() =>
        loadDefaultOverrides({
          path: file,
          knownRuleIds: KNOWN_IDS,
          ruleOptionDefaults: RULE_OPTION_DEFAULTS,
        }),
      ).toThrow(/ads-hide\.subRules\.hex\.minLength: .*expected number/);
    });

    it("rejects non-finite numbers (NaN / Infinity) at number-typed positions", () => {
      const file = writeFile(
        "infinity-threshold.json",
        // JSON.stringify drops Infinity to null; build the literal directly.
        '{"ads-hide": {"subRules": {"hex": {"minLength": 1e500 }}}}',
      );
      expect(() =>
        loadDefaultOverrides({
          path: file,
          knownRuleIds: KNOWN_IDS,
          ruleOptionDefaults: RULE_OPTION_DEFAULTS,
        }),
      ).toThrow(/ads-hide\.subRules\.hex\.minLength/);
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
      ).toThrow(/ads-hide\.enabled: .*expected boolean/);
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
