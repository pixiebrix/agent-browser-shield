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

// Recursively merges a validated override tree over a default tree. Accepts:
//   - boolean override at a boolean default position
//   - finite-number override at a number default position
//   - object override at an object default position (recurse)
//   - boolean override at an object default position whose `enabled` field is
//     a boolean (the bare-boolean shorthand for `{ enabled: <boolean> }`,
//     used at sub-rule positions; see ADR-0017)
// Anything else falls back to the default — defence-in-depth against a
// malformed bundle slipping past the build-time loader.
function mergeOptionTree<T>(defaults: T, overrides: unknown): T {
  if (overrides === undefined) {
    return defaults;
  }
  if (typeof defaults === "boolean") {
    return (typeof overrides === "boolean" ? overrides : defaults) as T;
  }
  if (typeof defaults === "number") {
    return (
      typeof overrides === "number" && Number.isFinite(overrides)
        ? overrides
        : defaults
    ) as T;
  }
  if (defaults === null || typeof defaults !== "object") {
    return defaults;
  }
  const defaultsObject = defaults as Record<string, unknown>;
  // Bare-boolean shorthand at a sub-rule position: `{ enabled: false }` is
  // equivalent to `false`. Generalizes the rule-level shorthand the loader
  // applies at the top level.
  if (typeof overrides === "boolean" && "enabled" in defaultsObject) {
    return { ...defaultsObject, enabled: overrides } as T;
  }
  if (
    overrides === null ||
    typeof overrides !== "object" ||
    Array.isArray(overrides)
  ) {
    return defaults;
  }
  const overridesObject = overrides as Record<string, unknown>;
  const result: Record<string, unknown> = { ...defaultsObject };
  for (const [key, defaultValue] of Object.entries(defaultsObject)) {
    const candidate = overridesObject[key];
    if (candidate === undefined) {
      continue;
    }
    result[key] = mergeOptionTree(defaultValue, candidate);
  }
  return result as T;
}

const ENV_OVERRIDES = parseRuleOptionsEnv();

const RESOLVED_OPTIONS: RuleOptions = Object.fromEntries(
  Object.entries(RULE_OPTION_DEFAULTS).map(([id, defaults]) => [
    id,
    mergeOptionTree(defaults, ENV_OVERRIDES[id]),
  ]),
) as RuleOptions;

export function getRuleOptions<Id extends RuleWithOptionsId>(
  id: Id,
): RuleOptions[Id] {
  return RESOLVED_OPTIONS[id];
}
