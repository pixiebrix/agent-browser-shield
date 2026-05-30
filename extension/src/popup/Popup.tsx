import { useEffect, useState } from "react";
import {
  getRuleStates,
  type RuleStates,
  setRuleEnabled,
  subscribe,
} from "../lib/storage";
import { RULES } from "../rules";

export function Popup() {
  const [states, setStates] = useState<RuleStates | null>(null);

  useEffect(() => {
    let cancelled = false;
    getRuleStates().then((initial) => {
      if (!cancelled) setStates(initial);
    });
    const unsubscribe = subscribe((next) => {
      setStates(next);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  if (!states) {
    return <div className="loading">Loading…</div>;
  }

  return (
    <div className="popup">
      <h1>Agent Browser Shield</h1>
      <ul className="rules">
        {RULES.map((rule) => {
          const unavailable = rule.available === false;
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
                  {unavailable && rule.unavailableReason && (
                    <p className="unavailable-reason">
                      {rule.unavailableReason}
                    </p>
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
