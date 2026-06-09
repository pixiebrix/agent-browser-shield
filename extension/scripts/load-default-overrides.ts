// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Loads and validates a build-time defaults override file. Consumed by
// build.ts when the operator passes `--defaults <path>` or
// `EXTENSION_DEFAULTS_FILE=<path>`.
//
// The file is a flat JSON object. Most keys are rule ids — usually mapped to
// booleans (same shape as the in-extension Options page export). Rules that
// declare a sub-rule option shape in `RULE_OPTION_DEFAULTS` may instead take
// an ESLint-style object value `{ enabled?: boolean, ...optionShape }`. A
// small set of reserved keys is also accepted for non-rule build-time toggles
// (e.g. `optionsButton`).
//
// Validation is strict: unknown keys (neither a registered rule id nor a
// reserved key) and ill-typed values fail the build. Infra operators want
// loud failures, not silent drift if a rule was renamed.

import { readFileSync } from "node:fs";

export interface LoadOverridesOptions {
  path: string;
  knownRuleIds: readonly string[];
  // Map of rule ids to their option-shape default tree. Rules absent from
  // this map only accept a plain boolean value in the override file. Walking
  // this tree drives sub-rule validation (unknown keys / non-boolean leaves
  // are reported with a path like `encoded-payload-redact.subRules.leetspeak`).
  ruleOptionDefaults?: Readonly<Record<string, unknown>>;
}

export interface DefaultOverrides {
  rules: Record<string, boolean>;
  // Validated per-rule option values, keyed by rule id. Values are
  // structurally-validated subsets of the corresponding `ruleOptionDefaults`
  // entry (only override-present leaves are included).
  ruleOptions: Record<string, unknown>;
  optionsButton?: boolean;
  runOnInactiveTabs?: boolean;
  debugTrace?: boolean;
  placeholderAdaptivePalette?: boolean;
}

const RESERVED_KEYS = new Set<string>([
  "optionsButton",
  "runOnInactiveTabs",
  "debugTrace",
  "placeholderAdaptivePalette",
]);

// Walks the per-rule override object against the rule's option-shape default
// tree. Accepts boolean leaves at boolean default positions, finite-number
// leaves at number default positions, object overrides at object positions
// (recursed), and the bare-boolean shorthand `{ enabled: ... }` at object
// positions whose `enabled` field is a boolean. Collects unknown-key and
// mistyped-leaf paths into `unknownPaths` / `mistypedPaths` so the loader
// can report them alongside any top-level issues in a single error message.
function validateRuleOptions(
  prefix: string,
  defaultTree: Readonly<Record<string, unknown>>,
  override: Record<string, unknown>,
  unknownPaths: string[],
  mistypedPaths: string[],
): Record<string, unknown> {
  const validated: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(override)) {
    if (!(key in defaultTree)) {
      unknownPaths.push(`${prefix}.${key}`);
      continue;
    }
    const defaultValue = defaultTree[key];
    const path = `${prefix}.${key}`;
    if (typeof defaultValue === "boolean") {
      if (typeof value !== "boolean") {
        mistypedPaths.push(path);
        continue;
      }
      validated[key] = value;
      continue;
    }
    if (typeof defaultValue === "number") {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        mistypedPaths.push(path);
        continue;
      }
      validated[key] = value;
      continue;
    }
    if (defaultValue && typeof defaultValue === "object") {
      // Bare-boolean shorthand at a nested object position whose `enabled`
      // default is a boolean — interpret as `{ enabled: <boolean> }`.
      const defaultObject = defaultValue as Readonly<Record<string, unknown>>;
      if (
        typeof value === "boolean" &&
        typeof defaultObject.enabled === "boolean"
      ) {
        validated[key] = { enabled: value };
        continue;
      }
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        mistypedPaths.push(path);
        continue;
      }
      validated[key] = validateRuleOptions(
        path,
        defaultObject,
        value as Record<string, unknown>,
        unknownPaths,
        mistypedPaths,
      );
    }
  }
  return validated;
}

export function loadDefaultOverrides(
  options: LoadOverridesOptions,
): DefaultOverrides {
  const { path, knownRuleIds, ruleOptionDefaults = {} } = options;

  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Defaults file ${path} could not be read: ${message}`, {
      cause: error,
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Defaults file ${path} is not valid JSON: ${message}`, {
      cause: error,
    });
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      `Defaults file ${path} must be a JSON object mapping rule ids (or reserved keys) to booleans.`,
    );
  }

  const known = new Set<string>(knownRuleIds);
  const unknownIds: string[] = [];
  const nonBooleanIds: string[] = [];
  const objectsForRulesWithoutOptions: string[] = [];
  const unknownOptionPaths: string[] = [];
  const mistypedOptionPaths: string[] = [];
  const rules: Record<string, boolean> = {};
  const ruleOptions: Record<string, unknown> = {};
  const result: DefaultOverrides = { rules, ruleOptions };

  for (const [key, value] of Object.entries(
    parsed as Record<string, unknown>,
  )) {
    if (RESERVED_KEYS.has(key)) {
      if (typeof value !== "boolean") {
        nonBooleanIds.push(key);
        continue;
      }
      switch (key) {
        case "optionsButton": {
          result.optionsButton = value;
          break;
        }
        case "runOnInactiveTabs": {
          result.runOnInactiveTabs = value;
          break;
        }
        case "debugTrace": {
          result.debugTrace = value;
          break;
        }
        case "placeholderAdaptivePalette": {
          result.placeholderAdaptivePalette = value;
          break;
        }
      }
      continue;
    }
    if (!known.has(key)) {
      unknownIds.push(key);
      continue;
    }
    if (typeof value === "boolean") {
      rules[key] = value;
      continue;
    }
    // Object value — only allowed for rules with declared options.
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const defaultsForRule = ruleOptionDefaults[key];
      if (!defaultsForRule || typeof defaultsForRule !== "object") {
        objectsForRulesWithoutOptions.push(key);
        continue;
      }
      const valueObject = value as Record<string, unknown>;
      // `enabled` is reserved at the rule-object root and projects back onto
      // the flat boolean storage shape. It does not appear in the
      // option-shape default tree, so peel it off before recursing.
      if ("enabled" in valueObject) {
        const enabled = valueObject.enabled;
        if (typeof enabled === "boolean") {
          rules[key] = enabled;
        } else {
          nonBooleanIds.push(`${key}.enabled`);
        }
      }
      const optionsOnly: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(valueObject)) {
        if (k !== "enabled") {
          optionsOnly[k] = v;
        }
      }
      const validated = validateRuleOptions(
        key,
        defaultsForRule as Readonly<Record<string, unknown>>,
        optionsOnly,
        unknownOptionPaths,
        mistypedOptionPaths,
      );
      if (Object.keys(validated).length > 0) {
        ruleOptions[key] = validated;
      }
      continue;
    }
    nonBooleanIds.push(key);
  }

  const issues: string[] = [];
  if (unknownIds.length > 0) {
    issues.push(`unknown keys: ${unknownIds.join(", ")}`);
  }
  if (objectsForRulesWithoutOptions.length > 0) {
    issues.push(
      `object value for rules without declared options: ${objectsForRulesWithoutOptions.join(", ")}`,
    );
  }
  if (unknownOptionPaths.length > 0) {
    issues.push(`unknown option keys: ${unknownOptionPaths.join(", ")}`);
  }
  if (nonBooleanIds.length > 0) {
    issues.push(`non-boolean values for: ${nonBooleanIds.join(", ")}`);
  }
  if (mistypedOptionPaths.length > 0) {
    issues.push(
      `mistyped option values for: ${mistypedOptionPaths.join(", ")}`,
    );
  }
  if (issues.length > 0) {
    throw new Error(
      `Defaults file ${path} failed validation — ${issues.join("; ")}`,
    );
  }

  return result;
}
