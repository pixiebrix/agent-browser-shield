// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import type { RuleCountEntry } from "../lib/detection-messages";
import { RULE_LABELS } from "./rule-labels";

export function PerRuleCountsSection({
  entries,
}: {
  entries: RuleCountEntry[];
}) {
  if (entries.length === 0) {
    return null;
  }
  return (
    <section className="rule-counts">
      <h2 className="rule-counts__heading">Rule activity</h2>
      <ul className="rule-counts__list">
        {entries.map((entry) => (
          <li key={entry.ruleId} className="rule-count">
            <span className="rule-count__label">
              {RULE_LABELS[entry.ruleId]}
            </span>
            <span className="rule-count__value">{entry.count}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
