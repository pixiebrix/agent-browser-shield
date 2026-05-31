// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { RULE_IDS, RULES, type RuleId } from "../rules";

export type RuleStates = Record<RuleId, boolean>;

const STORAGE_KEY = "agent-browser-shield.rules";

// Defaults derived once at module load — each rule carries its own
// `defaultEnabled` flag. Availability is resolved separately via
// `lib/availability.ts` (which supports reactive accessors), and the rule
// engine gates application on it at apply time. We deliberately don't mask
// unavailable rules' stored state here: if availability is reactive (e.g.
// gated on a user-supplied API key) we want the user's toggle preference
// preserved so it takes effect the moment the rule becomes available.
const DEFAULT_STATES: RuleStates = Object.fromEntries(
  RULES.map((rule) => [rule.id, rule.defaultEnabled]),
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

export async function getRuleStates(): Promise<RuleStates> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return normalize(stored[STORAGE_KEY]);
}

export async function setRuleEnabled(
  id: RuleId,
  enabled: boolean,
): Promise<void> {
  const current = await getRuleStates();
  current[id] = enabled;
  await chrome.storage.local.set({ [STORAGE_KEY]: current });
}

export async function setAllRuleStates(
  states: Partial<RuleStates>,
): Promise<void> {
  const next = normalize(states);
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
}

export type RuleStatesListener = (
  next: RuleStates,
  previous: RuleStates,
) => void;

export function subscribe(listener: RuleStatesListener): () => void {
  const handler = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== "local") return;
    const change = changes[STORAGE_KEY];
    if (!change) return;
    listener(normalize(change.newValue), normalize(change.oldValue));
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}

export { RULE_IDS, type RuleId } from "../rules";
