// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import type { RuleId } from "../rules";
import { RULE_IDS } from "../rules";
import { RULE_DEFAULTS } from "../rules/rule-defaults.generated";
import { createChromeStorageValue } from "./chrome-storage-value";

export type RuleStates = Record<RuleId, boolean>;

// Defaults come from extension/data/rule-defaults.json via codegen — one
// scannable file lists every rule's initial state. Availability is resolved
// separately via `lib/availability.ts` (which supports reactive accessors),
// and the rule engine gates application on it at apply time. We deliberately
// don't mask unavailable rules' stored state here: if availability is
// reactive (e.g. gated on a user-supplied API key) we want the user's toggle
// preference preserved so it takes effect the moment the rule becomes
// available.
//
// `EXTENSION_DEFAULT_OVERRIDES` is injected by build.ts when the operator
// passes --defaults or EXTENSION_DEFAULTS_FILE; it layers on top of the
// committed defaults so infra teams can ship a build with their own initial
// state without their agent flipping toggles via the Options UI. Only
// affects fresh chrome.storage — existing users keep their toggles.
function parseOverrides(): Partial<RuleStates> {
  const raw = process.env.EXTENSION_DEFAULT_OVERRIDES;
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
  const result: Partial<RuleStates> = {};
  for (const id of RULE_IDS) {
    const value = (parsed as Record<string, unknown>)[id];
    if (typeof value === "boolean") {
      result[id] = value;
    }
  }
  return result;
}

const OVERRIDES: Partial<RuleStates> = parseOverrides();

const DEFAULT_STATES: RuleStates = Object.fromEntries(
  RULE_IDS.map((id) => [id, OVERRIDES[id] ?? RULE_DEFAULTS[id]]),
) as RuleStates;

function normalize(raw: unknown): RuleStates {
  const result: RuleStates = { ...DEFAULT_STATES };
  if (raw && typeof raw === "object") {
    for (const id of RULE_IDS) {
      const value = (raw as Record<string, unknown>)[id];
      if (typeof value === "boolean") {
        result[id] = value;
      }
    }
  }
  return result;
}

export const ruleStatesStorage = createChromeStorageValue<RuleStates>({
  key: "agent-browser-shield.rules",
  defaultValue: DEFAULT_STATES,
  normalize,
});

export const getRuleStates = ruleStatesStorage.get;
export const subscribe = ruleStatesStorage.subscribe;

export async function setRuleEnabled(
  id: RuleId,
  enabled: boolean,
): Promise<void> {
  const current = await ruleStatesStorage.get();
  current[id] = enabled;
  await ruleStatesStorage.set(current);
}

export async function setAllRuleStates(
  states: Partial<RuleStates>,
): Promise<void> {
  await ruleStatesStorage.set(normalize(states));
}

export { RULE_IDS, type RuleId } from "../rules";
