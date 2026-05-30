// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { useEffect, useState } from "react";
import {
  getRuleAvailabilityStates,
  type RuleAvailabilityStates,
  subscribeRuleAvailability,
} from "../lib/availability";
import {
  getEnforcementEnabled,
  setEnforcementEnabled,
  subscribeEnforcementEnabled,
} from "../lib/enforcement";
import {
  getRuleStates,
  type RuleStates,
  setRuleEnabled,
  subscribe,
} from "../lib/storage";
import { RULES } from "../rules";

export function Popup() {
  const [states, setStates] = useState<RuleStates | null>(null);
  const [enforcementEnabled, setEnforcementState] = useState<boolean | null>(
    null,
  );
  const [availability, setAvailability] =
    useState<RuleAvailabilityStates | null>(null);

  useEffect(() => {
    let cancelled = false;
    getRuleStates().then((initial) => {
      if (!cancelled) setStates(initial);
    });
    getEnforcementEnabled().then((value) => {
      if (!cancelled) setEnforcementState(value);
    });
    getRuleAvailabilityStates().then((initial) => {
      if (!cancelled) setAvailability(initial);
    });
    const unsubscribe = subscribe((next) => {
      setStates(next);
    });
    const unsubscribeEnforcement = subscribeEnforcementEnabled((value) => {
      setEnforcementState(value);
    });
    const unsubscribeAvailability = subscribeRuleAvailability((next) => {
      setAvailability(next);
    });
    return () => {
      cancelled = true;
      unsubscribe();
      unsubscribeEnforcement();
      unsubscribeAvailability();
    };
  }, []);

  if (!states || enforcementEnabled === null || !availability) {
    return <div className="loading">Loading…</div>;
  }

  const handleEnforcementToggle = (enabled: boolean) => {
    setEnforcementState(enabled);
    void setEnforcementEnabled(enabled);
  };

  return (
    <div className="popup">
      <h1>Agent Browser Shield</h1>
      <div
        className={
          enforcementEnabled
            ? "enforcement enforcement--on"
            : "enforcement enforcement--off"
        }
      >
        <label className="enforcement__label">
          <span className="enforcement__text">
            <strong>Enforcement</strong>
            <span className="enforcement__state">
              {enforcementEnabled ? "On" : "Off"}
            </span>
          </span>
          <span
            className="switch"
            role="presentation"
            aria-hidden={enforcementEnabled === null}
          >
            <input
              type="checkbox"
              checked={enforcementEnabled}
              onChange={(event) =>
                handleEnforcementToggle(event.target.checked)
              }
              aria-label="Enable enforcement"
            />
            <span className="switch__track" />
          </span>
        </label>
        {!enforcementEnabled && (
          <p className="enforcement__hint">
            All rules are paused for every tab. Your per-rule selection below is
            preserved and restored when you turn enforcement back on.
          </p>
        )}
      </div>
      <ul
        className={
          enforcementEnabled ? "rules" : "rules rules--enforcement-off"
        }
      >
        {RULES.map((rule) => {
          const snapshot = availability[rule.id];
          const unavailable = !snapshot?.available;
          const disabled = unavailable || !enforcementEnabled;
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
                    const enabled = event.target.checked;
                    setStates((prev) =>
                      prev ? { ...prev, [rule.id]: enabled } : prev,
                    );
                    void setRuleEnabled(rule.id, enabled);
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
    </div>
  );
}
