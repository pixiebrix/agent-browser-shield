// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Shared resolution logic for `Rule.available`. A rule can be statically
// available, statically unavailable (build-time), or reactively gated on
// runtime state (e.g. user-supplied API key). This module hides the three-way
// split behind a snapshot map so the engine, popup, and options page don't
// each duplicate the resolution.

import type { RuleId } from "../rules";
import { RULES } from "../rules";
import type {
  AvailabilitySnapshot,
  Rule,
  RuleAvailability,
} from "../rules/types";
import {
  getUserApiKey,
  HAS_BUILT_IN_OPENAI_KEY,
  subscribeUserApiKey,
} from "./api-key-storage";

export type RuleAvailabilityStates = Record<RuleId, AvailabilitySnapshot>;

const ALWAYS_AVAILABLE: AvailabilitySnapshot = { available: true };

function isReactive(value: Rule["available"]): value is RuleAvailability {
  return typeof value === "object";
}

export async function resolveAvailability(
  rule: Rule,
): Promise<AvailabilitySnapshot> {
  const accessor = rule.available;
  if (isReactive(accessor)) {
    return accessor.get();
  }
  if (accessor === false) {
    return rule.unavailableReason === undefined
      ? { available: false }
      : { available: false, reason: rule.unavailableReason };
  }
  return ALWAYS_AVAILABLE;
}

export async function getRuleAvailabilityStates(): Promise<RuleAvailabilityStates> {
  const entries = await Promise.all(
    RULES.map(
      async (rule) => [rule.id, await resolveAvailability(rule)] as const,
    ),
  );
  // Entries cover every `RuleId` (keyed off `RULES`); `Object.fromEntries`
  // widens the key back to `string`, so cast to the exact map shape.
  return Object.fromEntries(entries) as RuleAvailabilityStates;
}

// Subscribe to changes in any rule's reactive availability. The listener is
// invoked with a freshly-resolved snapshot map whenever an underlying source
// signals a change.
export function subscribeRuleAvailability(
  listener: (next: RuleAvailabilityStates) => void,
): () => void {
  const unsubs: Array<() => void> = [];
  const refresh = () => {
    void getRuleAvailabilityStates().then(listener);
  };
  for (const rule of RULES) {
    if (!isReactive(rule.available)) {
      continue;
    }
    unsubs.push(rule.available.subscribe(refresh));
  }
  return () => {
    for (const unsub of unsubs) {
      unsub();
    }
  };
}

// Stable source bundle for use with `useChromeStorageValue`. Frozen so the
// hook's effect dep stays referentially stable across renders.
export const availabilitySource = Object.freeze({
  get: getRuleAvailabilityStates,
  subscribe: subscribeRuleAvailability,
});

// Factory for rules that depend on the OpenAI API key being available — either
// bundled at build time or supplied by the user via the options page. The
// snapshot recomputes when the stored user key changes so the popup/options
// flip the toggle from "Unavailable" the moment a key is saved.
export function createApiKeyAvailability(reason: string): RuleAvailability {
  return {
    async get() {
      if (HAS_BUILT_IN_OPENAI_KEY) {
        return { available: true };
      }
      const userKey = await getUserApiKey();
      return userKey ? { available: true } : { available: false, reason };
    },
    subscribe: (listener) => subscribeUserApiKey(listener),
  };
}
