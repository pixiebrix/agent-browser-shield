// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Compact human-readable summary of what the extension stripped from the
// current page. Builds a single sentence from the per-rule counts, then
// reveals the full per-rule list on expand. Designed to answer the
// agent-builder question "what disappeared?" in one glance, without the
// raw rule-id detail the dev-mode trace surfaces.

import { useState } from "react";
import type { RuleCountEntry } from "../lib/detection-messages";
import { PerRuleCountsSection } from "./PerRuleCountsSection";
import { RULE_LABELS } from "./rule-labels";

// Verbs that prefix many rule labels and read as awkward when concatenated
// with a count. "1 Mask PII" reads worse than "1 PII"; "4 Hide Reviews"
// worse than "4 reviews." Stripping the verb leaves a noun phrase the
// summary line can splice in naturally.
const LABEL_VERBS = new Set([
  "Mask",
  "Hide",
  "Strip",
  "Remove",
  "Sanitize",
  "Annotate",
  "Flag",
  "Clear",
  "Neutralize",
  "Embed",
  "Redact",
  "Scrub",
]);

function nounPhrase(label: string): string {
  // Drop parenthetical disclaimers like "(Experimental)" or "(Sneak-Into-
  // Basket)" — they're useful in the per-rule list but distracting in a
  // one-line summary.
  const stripped = label.replace(/\s*\([^)]*\)\s*$/, "");
  const [first, ...rest] = stripped.split(/\s+/);
  if (rest.length > 0 && first && LABEL_VERBS.has(first)) {
    return rest.join(" ").toLowerCase();
  }
  return stripped.toLowerCase();
}

function summarize(entries: RuleCountEntry[]): string {
  if (entries.length === 0) {
    return "";
  }
  const totalCount = entries.reduce((sum, entry) => sum + entry.count, 0);
  // Cap the comma-joined list at the top 3 contributors so the line fits
  // the 280px-wide popup without wrapping aggressively.
  const top = entries.slice(0, 3);
  const phrased = top.map(
    (entry) => `${entry.count} ${nounPhrase(RULE_LABELS[entry.ruleId])}`,
  );
  const remainder = entries.length - top.length;
  if (remainder > 0) {
    phrased.push(`${remainder} more rule type${remainder === 1 ? "" : "s"}`);
  }
  const list = phrased.join(", ");
  return `Stripped ${totalCount} item${totalCount === 1 ? "" : "s"}: ${list}.`;
}

export function HumanModeSection({ entries }: { entries: RuleCountEntry[] }) {
  const [expanded, setExpanded] = useState(false);
  if (entries.length === 0) {
    return null;
  }
  const summary = summarize(entries);
  return (
    <section className="human-mode">
      <h2 className="human-mode__heading">Rule activity</h2>
      <p className="human-mode__summary">{summary}</p>
      <button
        type="button"
        className="human-mode__toggle"
        onClick={() => {
          setExpanded((value) => !value);
        }}
        aria-expanded={expanded}
      >
        {expanded ? "Hide details" : "Show details"}
      </button>
      {expanded && <PerRuleCountsSection entries={entries} />}
    </section>
  );
}
