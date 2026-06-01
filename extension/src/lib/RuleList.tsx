// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { RULES } from "../rules";
import type { RuleAvailabilityStates } from "./availability";
import type { RuleStates } from "./storage";
import { setRuleEnabled } from "./storage";

// Shared per-rule checkbox list rendered by both the popup and options page.
// Pass `disabledByEnforcement` when the surface should grey out every rule
// (popup, when global enforcement is off); the options page omits it because
// the user can still edit preferences while enforcement is paused.
export function RuleList({
  states,
  availability,
  disabledByEnforcement = false,
  className,
}: {
  states: RuleStates;
  availability: RuleAvailabilityStates;
  disabledByEnforcement?: boolean;
  className?: string;
}) {
  const listClass = className ? `rules ${className}` : "rules";
  return (
    <ul
      className={
        disabledByEnforcement
          ? `${listClass} rules--enforcement-off`
          : listClass
      }
    >
      {RULES.map((rule) => {
        const snapshot = availability[rule.id];
        const unavailable = !snapshot?.available;
        const disabled = unavailable || disabledByEnforcement;
        return (
          <li
            key={rule.id}
            className={unavailable ? "rule rule--unavailable" : "rule"}
          >
            <label>
              <input
                type="checkbox"
                checked={unavailable ? false : states[rule.id]}
                disabled={disabled}
                onChange={(event) => {
                  void setRuleEnabled(rule.id, event.target.checked);
                }}
              />
              <div>
                <strong>
                  {rule.label}
                  {unavailable && <span className="badge">Unavailable</span>}
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
  );
}
