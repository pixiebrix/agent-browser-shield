// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import type { Rule, RuleId } from "../rules";
import { RULES } from "../rules";
import type { RuleAvailabilityStates } from "./availability";
import { RULE_GROUPS } from "./rule-groups";
import type { RuleStates } from "./storage";
import { setRuleEnabled } from "./storage";

const RULES_BY_ID = new Map<RuleId, Rule>(RULES.map((rule) => [rule.id, rule]));

// The catalog invariant test (`places every rule in exactly one group`)
// guarantees every group id resolves; this throws loudly if anyone ever
// breaks that invariant by adding a rule without updating `RULE_GROUPS`.
function ruleById(id: RuleId): Rule {
  const rule = RULES_BY_ID.get(id);
  if (!rule) {
    throw new Error(`Rule ${id} listed in RULE_GROUPS but not in RULES`);
  }
  return rule;
}

// Per-rule checkbox list rendered on the options page. Rules are grouped by
// the same top-level threat/pattern categories used on the docs Rules reference
// page; the catalog test enforces every rule belongs to exactly one group.
export function RuleList({
  states,
  availability,
  className,
}: {
  states: RuleStates;
  availability: RuleAvailabilityStates;
  className?: string;
}) {
  const rootClass = className ? `rule-groups ${className}` : "rule-groups";
  return (
    <div className={rootClass}>
      {RULE_GROUPS.map((group) => (
        <section key={group.id} className="rule-group">
          <h3 className="rule-group__heading">{group.label}</h3>
          <ul className="rules">
            {group.ruleIds.map((ruleId) => {
              const rule = ruleById(ruleId);
              const snapshot = availability[rule.id];
              const unavailable = !snapshot?.available;
              return (
                <li
                  key={rule.id}
                  className={unavailable ? "rule rule--unavailable" : "rule"}
                >
                  <label>
                    <input
                      type="checkbox"
                      checked={unavailable ? false : states[rule.id]}
                      disabled={unavailable}
                      onChange={(event) => {
                        void setRuleEnabled(rule.id, event.target.checked);
                      }}
                    />
                    <div>
                      <strong>
                        {rule.label}
                        {unavailable && (
                          <span className="badge">Unavailable</span>
                        )}
                      </strong>
                      {unavailable && snapshot?.reason && (
                        <p className="unavailable-reason">{snapshot.reason}</p>
                      )}
                      <p>{rule.description}</p>
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
