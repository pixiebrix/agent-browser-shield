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
// Validation runs through a zod schema built dynamically from the supplied
// `knownRuleIds` and `ruleOptionDefaults`. Strict objects at every level
// reject any key not declared in those maps — infra operators want loud
// failures, not silent drift if a rule was renamed.

import { readFileSync } from "node:fs";
import { z } from "zod";

export interface LoadOverridesOptions {
  path: string;
  knownRuleIds: readonly string[];
  // Map of rule ids to their option-shape default tree. Rules absent from
  // this map only accept a plain boolean value in the override file. Walking
  // this tree drives sub-rule validation; the structure mirrors
  // `RULE_OPTION_DEFAULTS` exported from `src/rules/rule-metadata.ts`.
  ruleOptionDefaults?: Readonly<Record<string, unknown>>;
}

export interface DefaultOverrides {
  rules: Record<string, boolean>;
  // Validated per-rule option values, keyed by rule id. Values are
  // structurally-validated subsets of the corresponding `ruleOptionDefaults`
  // entry (only override-present leaves are included). Bare-boolean
  // shorthands at `{ enabled, ... }` sub-rule positions are normalized to
  // `{ enabled: <boolean> }` before reaching this map.
  ruleOptions: Record<string, unknown>;
  optionsButton?: boolean;
  runOnInactiveTabs?: boolean;
  debugTrace?: boolean;
  placeholderAdaptivePalette?: boolean;
}

const RESERVED_KEYS = [
  "optionsButton",
  "runOnInactiveTabs",
  "debugTrace",
  "placeholderAdaptivePalette",
] as const;

type ReservedKey = (typeof RESERVED_KEYS)[number];

function isReservedKey(key: string): key is ReservedKey {
  return (RESERVED_KEYS as readonly string[]).includes(key);
}

// Builds a zod schema for one position in the option-shape default tree.
// Boolean defaults accept a boolean; number defaults accept a finite number
// (zod 4's `z.number()` rejects NaN / Infinity by default); object defaults
// recurse, with the bare-boolean shorthand expanded into `{ enabled }` when
// the default object declares an `enabled` boolean.
function leafSchema(defaultValue: unknown): z.ZodType {
  if (typeof defaultValue === "boolean") {
    return z.boolean();
  }
  if (typeof defaultValue === "number") {
    return z.number();
  }
  if (defaultValue !== null && typeof defaultValue === "object") {
    const defaultObject = defaultValue as Record<string, unknown>;
    const objectSchema = z.strictObject(shapeFromDefaultTree(defaultObject));
    if (typeof defaultObject.enabled === "boolean") {
      return z.union([
        z.boolean().transform((value) => ({ enabled: value })),
        objectSchema,
      ]);
    }
    return objectSchema;
  }
  return z.unknown();
}

function shapeFromDefaultTree(
  tree: Record<string, unknown>,
): Record<string, z.ZodType> {
  const shape: Record<string, z.ZodType> = {};
  for (const [key, value] of Object.entries(tree)) {
    shape[key] = leafSchema(value).optional();
  }
  return shape;
}

// Builds the rule-value schema for one rule id. Rules without declared
// options accept only a boolean; rules with declared options accept a
// boolean (shorthand for the `enabled` toggle) or a strict object containing
// `enabled?` and any subset of the option-shape tree.
function ruleValueSchema(
  ruleOptionDefault: Readonly<Record<string, unknown>> | undefined,
): z.ZodType {
  if (!ruleOptionDefault) {
    return z.boolean();
  }
  return z.union([
    z.boolean(),
    z.strictObject({
      enabled: z.boolean().optional(),
      ...shapeFromDefaultTree(ruleOptionDefault as Record<string, unknown>),
    }),
  ]);
}

function buildOverridesSchema(options: LoadOverridesOptions): z.ZodType {
  const { knownRuleIds, ruleOptionDefaults = {} } = options;
  const shape: Record<string, z.ZodType> = {};
  for (const reserved of RESERVED_KEYS) {
    shape[reserved] = z.boolean().optional();
  }
  for (const id of knownRuleIds) {
    shape[id] = ruleValueSchema(
      ruleOptionDefaults[id] as Readonly<Record<string, unknown>> | undefined,
    ).optional();
  }
  return z.strictObject(shape);
}

// Pulls leaf issues out of `invalid_union` aggregators. For our
// `boolean | object` unions, when the operator supplies an object the
// object-branch errors carry the actionable sub-path; the boolean-branch
// error is always a single "expected boolean" at the union site and would
// be noise. Picks the branch whose deepest leaf path (including the
// trailing key on `unrecognized_keys`) reaches furthest into the tree.
//
// zod 4 reports branch-issue paths RELATIVE to the union site, so the
// recursive walk threads a `prefix` that prepends every parent union's
// path before formatting — without this, an `unrecognized_keys` deep
// under a sub-rule loses the rule-id and sub-rule prefix.
function flattenIssues(
  issues: readonly z.core.$ZodIssue[],
  prefix: readonly PropertyKey[] = [],
): z.core.$ZodIssue[] {
  const out: z.core.$ZodIssue[] = [];
  for (const issue of issues) {
    const prefixedIssue =
      prefix.length === 0
        ? issue
        : { ...issue, path: [...prefix, ...issue.path] };
    if (
      issue.code === "invalid_union" &&
      "errors" in issue &&
      Array.isArray(issue.errors)
    ) {
      const innerPrefix = [...prefix, ...issue.path];
      let best: z.core.$ZodIssue[] | undefined;
      let bestDepth = -1;
      for (const branchIssues of issue.errors as z.core.$ZodIssue[][]) {
        const flat = flattenIssues(branchIssues, innerPrefix);
        const depth = flat.reduce(
          (max, sub) => Math.max(max, effectivePathLength(sub)),
          0,
        );
        if (depth > bestDepth) {
          bestDepth = depth;
          best = flat;
        }
      }
      if (best && best.length > 0) {
        out.push(...best);
        continue;
      }
    }
    out.push(prefixedIssue);
  }
  return out;
}

function effectivePathLength(issue: z.core.$ZodIssue): number {
  if (
    issue.code === "unrecognized_keys" &&
    "keys" in issue &&
    Array.isArray(issue.keys)
  ) {
    return issue.path.length + 1;
  }
  return issue.path.length;
}

function formatIssue(issue: z.core.$ZodIssue): string[] {
  if (
    issue.code === "unrecognized_keys" &&
    "keys" in issue &&
    Array.isArray(issue.keys)
  ) {
    return issue.keys.map(
      (key) => `  - ${[...issue.path, key].join(".")}: unrecognized key`,
    );
  }
  const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
  return [`  - ${path}: ${issue.message}`];
}

function splitOverrides(parsed: Record<string, unknown>): DefaultOverrides {
  const rules: Record<string, boolean> = {};
  const ruleOptions: Record<string, unknown> = {};
  const out: DefaultOverrides = { rules, ruleOptions };
  for (const [key, value] of Object.entries(parsed)) {
    if (value === undefined) {
      continue;
    }
    if (isReservedKey(key)) {
      switch (key) {
        case "optionsButton": {
          out.optionsButton = value as boolean;
          break;
        }
        case "runOnInactiveTabs": {
          out.runOnInactiveTabs = value as boolean;
          break;
        }
        case "debugTrace": {
          out.debugTrace = value as boolean;
          break;
        }
        case "placeholderAdaptivePalette": {
          out.placeholderAdaptivePalette = value as boolean;
          break;
        }
      }
      continue;
    }
    if (typeof value === "boolean") {
      rules[key] = value;
      continue;
    }
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const object = value as Record<string, unknown>;
      if (typeof object.enabled === "boolean") {
        rules[key] = object.enabled;
      }
      const optionsOnly: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(object)) {
        if (k !== "enabled" && v !== undefined) {
          optionsOnly[k] = v;
        }
      }
      if (Object.keys(optionsOnly).length > 0) {
        ruleOptions[key] = optionsOnly;
      }
    }
  }
  return out;
}

export function loadDefaultOverrides(
  options: LoadOverridesOptions,
): DefaultOverrides {
  const { path } = options;

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

  const schema = buildOverridesSchema(options);
  const result = schema.safeParse(parsed);
  if (!result.success) {
    const lines = flattenIssues(result.error.issues).flatMap(formatIssue);
    throw new Error(
      `Defaults file ${path} failed validation:\n${lines.join("\n")}`,
      { cause: result.error },
    );
  }

  return splitOverrides(result.data as Record<string, unknown>);
}
