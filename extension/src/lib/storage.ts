// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { RULE_IDS, RULES, type RuleId } from "../rules";
import { createChromeStorageValue } from "./chrome-storage-value";

export type RuleStates = Record<RuleId, boolean>;

// Defaults derived once at module load — each rule carries its own
// `defaultEnabled` flag. Availability is resolved separately via
// `lib/availability.ts` (which supports reactive accessors), and the rule
// engine gates application on it at apply time. We deliberately don't mask
// unavailable rules' stored state here: if availability is reactive (e.g.
// gated on a user-supplied API key) we want the user's toggle preference
// preserved so it takes effect the moment the rule becomes available.
const DEFAULT_STATES: RuleStates = Object.fromEntries(
  RULES.map((rule) => [rule.id, rule.defaultEnabled]),
);

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
