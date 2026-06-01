// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Loads and validates a build-time rule-defaults override file. Consumed by
// build.ts when the operator passes `--defaults <path>` or
// `EXTENSION_DEFAULTS_FILE=<path>`. The file shape matches the JSON the
// in-extension Options page exports/imports — flat
// `{ "<rule-id>": <boolean>, ... }` — so the same file works in both
// places.
//
// Validation is strict: unknown rule ids and non-boolean values fail the
// build. Infra operators want loud failures, not silent drift if a rule was
// renamed.

import { readFileSync } from "node:fs";

export interface LoadOverridesOptions {
  path: string;
  knownRuleIds: readonly string[];
}

export function loadDefaultOverrides(
  options: LoadOverridesOptions,
): Record<string, boolean> {
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
      `Defaults file ${path} must be a JSON object mapping rule ids to booleans.`,
    );
  }

  const known = new Set<string>(knownRuleIds);
  const unknownIds: string[] = [];
  const nonBooleanIds: string[] = [];
  const result: Record<string, boolean> = {};

  for (const [key, value] of Object.entries(
    parsed as Record<string, unknown>,
  )) {
    if (!known.has(key)) {
      unknownIds.push(key);
      continue;
    }
    if (typeof value !== "boolean") {
      nonBooleanIds.push(key);
      continue;
    }
    result[key] = value;
  }

  const issues: string[] = [];
  if (unknownIds.length > 0) {
    issues.push(`unknown rule ids: ${unknownIds.join(", ")}`);
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
