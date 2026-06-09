// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { isValidPattern } from "../lib/site-denylist";
import type { RuleStates } from "../lib/storage";
import { RULE_IDS } from "../lib/storage";

const RULE_ID_SET = new Set<string>(RULE_IDS);

// Reserved non-rule keys the Options-page *Apply configuration* round-trip
// understands. Mirrors the reserved-keys set in the build-time defaults
// loader (`scripts/load-default-overrides.ts`). Today only `siteDenylist`
// round-trips through this surface; the boolean reserved keys
// (`optionsButton`, `runOnInactiveTabs`, etc.) are wired through their own
// storage modules and ignored here so a paste-in won't churn them
// silently.
export interface ParsedConfig {
  rules: Partial<RuleStates>;
  siteDenylist?: string[];
}

export type ParseResult =
  | { ok: true; value: ParsedConfig }
  | { ok: false; error: string };

// Parses the JSON pasted into the "Apply configuration" textarea. Returns
// the parsed rule states and any supported reserved keys; on failure
// returns a single multi-line error string suitable for rendering in the
// alert region.
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
  const rules: Partial<RuleStates> = {};
  let siteDenylist: string[] | undefined;
  for (const [key, value] of Object.entries(parsed)) {
    if (key === "siteDenylist") {
      const result = parseSiteDenylist(value);
      if (result.ok) {
        siteDenylist = result.value;
      } else {
        errors.push(...result.errors);
      }
      continue;
    }
    if (!RULE_ID_SET.has(key)) {
      errors.push(`Unknown rule: ${key}`);
      continue;
    }
    if (typeof value !== "boolean") {
      errors.push(`Non-boolean value for ${key}: ${typeof value}`);
      continue;
    }
    rules[key] = value;
  }

  if (errors.length > 0) {
    return { ok: false, error: errors.join("\n") };
  }
  const value: ParsedConfig = { rules };
  if (siteDenylist !== undefined) {
    value.siteDenylist = siteDenylist;
  }
  return { ok: true, value };
}

function parseSiteDenylist(
  raw: unknown,
): { ok: true; value: string[] } | { ok: false; errors: string[] } {
  if (!Array.isArray(raw)) {
    return {
      ok: false,
      errors: ["siteDenylist must be an array of URL Pattern strings."],
    };
  }
  const errors: string[] = [];
  const value: string[] = [];
  for (const [index, entry] of raw.entries()) {
    if (typeof entry !== "string") {
      errors.push(
        `siteDenylist[${index}]: expected string, got ${typeof entry}`,
      );
      continue;
    }
    if (!isValidPattern(entry)) {
      errors.push(`siteDenylist[${index}]: invalid URL Pattern (${entry})`);
      continue;
    }
    value.push(entry);
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value };
}
