// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Loads and validates a build-time defaults override file. Consumed by
// build.ts when the operator passes `--defaults <path>` or
// `EXTENSION_DEFAULTS_FILE=<path>`.
//
// The file is a flat JSON object. Most keys are rule ids mapped to booleans —
// the same shape the in-extension Options page exports/imports. A small set
// of reserved keys is also accepted for non-rule build-time toggles (e.g.
// `optionsButton`, which controls the floating on-page options button).
//
// Validation is strict: unknown keys (neither a registered rule id nor a
// reserved key) and non-boolean values fail the build. Infra operators want
// loud failures, not silent drift if a rule was renamed.

import { readFileSync } from "node:fs";

export interface LoadOverridesOptions {
  path: string;
  knownRuleIds: readonly string[];
}

export interface DefaultOverrides {
  rules: Record<string, boolean>;
  optionsButton?: boolean;
  runOnInactiveTabs?: boolean;
  debugTrace?: boolean;
  placeholderAdaptivePalette?: boolean;
}

// Reserved top-level keys are not rule ids; the loader maps each one to a
// typed field on `DefaultOverrides`. Add new build-time toggles here as they
// appear.
const RESERVED_KEYS = new Set<string>([
  "optionsButton",
  "runOnInactiveTabs",
  "debugTrace",
  "placeholderAdaptivePalette",
]);

export function loadDefaultOverrides(
  options: LoadOverridesOptions,
): DefaultOverrides {
  const { path, knownRuleIds } = options;

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
  const rules: Record<string, boolean> = {};
  const result: DefaultOverrides = { rules };

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
    if (typeof value !== "boolean") {
      nonBooleanIds.push(key);
      continue;
    }
    rules[key] = value;
  }

  const issues: string[] = [];
  if (unknownIds.length > 0) {
    issues.push(`unknown keys: ${unknownIds.join(", ")}`);
  }
  if (nonBooleanIds.length > 0) {
    issues.push(`non-boolean values for: ${nonBooleanIds.join(", ")}`);
  }
  if (issues.length > 0) {
    throw new Error(
      `Defaults file ${path} failed validation — ${issues.join("; ")}`,
    );
  }

  return result;
}
