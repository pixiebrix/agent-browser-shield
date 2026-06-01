// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { RULE_IDS, type RuleId, type RuleStates } from "../lib/storage";

const RULE_ID_SET = new Set<string>(RULE_IDS);

export type ParseResult =
  | { ok: true; value: Partial<RuleStates> }
  | { ok: false; error: string };

// Parses the JSON pasted into the "Apply configuration" textarea. Returns a
// partial rule-state map on success; on failure returns a single multi-line
// error string suitable for rendering in the alert region.
export function parseConfig(input: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Invalid JSON: ${message}` };
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      error: "Expected a JSON object mapping rule IDs to booleans.",
    };
  }

  const errors: string[] = [];
  const result: Partial<RuleStates> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!RULE_ID_SET.has(key)) {
      errors.push(`Unknown rule: ${key}`);
      continue;
    }
    if (typeof value !== "boolean") {
      errors.push(`Non-boolean value for ${key}: ${typeof value}`);
      continue;
    }
    result[key as RuleId] = value;
  }

  if (errors.length > 0) {
    return { ok: false, error: errors.join("\n") };
  }
  return { ok: true, value: result };
}
