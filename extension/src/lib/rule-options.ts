// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Build-time per-rule options. The `--defaults <path>` / `EXTENSION_DEFAULTS_FILE`
// loader emits an object value for any rule listed in `RULE_OPTION_DEFAULTS`;
// `extension/build.ts` serializes that object into the bundle via the
// `process.env.EXTENSION_RULE_OPTIONS` define substitution. Rules with sub-rule
// configuration read their merged options from this module at module init.
//
// A malformed `EXTENSION_RULE_OPTIONS` payload silently degrades to the
// committed defaults rather than crashing the engine — mirrors the
// `parseOverrides` behaviour in `lib/storage.ts` (spec 0011 NFR-S-2).

import type { RuleOptions, RuleWithOptionsId } from "../rules/rule-metadata";
import { RULE_OPTION_DEFAULTS } from "../rules/rule-metadata";

function parseRuleOptionsEnv(): Record<string, unknown> {
  const raw = process.env.EXTENSION_RULE_OPTIONS;
  if (!raw) {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  return parsed as Record<string, unknown>;
}

// Recursively merges a validated override tree over a default tree. Only
// boolean leaves at positions that exist in the default tree are accepted;
// anything else falls back to the default — defence-in-depth against a
// malformed bundle slipping past the build-time loader.
function mergeBooleanTree<T>(defaults: T, overrides: unknown): T {
  if (
    overrides === null ||
    typeof overrides !== "object" ||
    Array.isArray(overrides)
  ) {
    return defaults;
  }
  const result: Record<string, unknown> = {
    ...(defaults as Record<string, unknown>),
  };
  for (const [key, defaultValue] of Object.entries(
    defaults as Record<string, unknown>,
  )) {
    const candidate = (overrides as Record<string, unknown>)[key];
    if (candidate === undefined) {
      continue;
    }
    if (typeof defaultValue === "boolean") {
      if (typeof candidate === "boolean") {
        result[key] = candidate;
      }
      continue;
    }
    if (defaultValue && typeof defaultValue === "object") {
      result[key] = mergeBooleanTree(defaultValue, candidate);
    }
  }
  return result as T;
}

const ENV_OVERRIDES = parseRuleOptionsEnv();

const RESOLVED_OPTIONS: RuleOptions = Object.fromEntries(
  Object.entries(RULE_OPTION_DEFAULTS).map(([id, defaults]) => [
    id,
    mergeBooleanTree(defaults, ENV_OVERRIDES[id]),
  ]),
) as RuleOptions;

export function getRuleOptions<Id extends RuleWithOptionsId>(
  id: Id,
): RuleOptions[Id] {
  return RESOLVED_OPTIONS[id];
}
