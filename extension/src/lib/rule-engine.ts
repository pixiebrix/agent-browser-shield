// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { RULES, type Rule } from "../rules";
import {
  getRuleAvailabilityStates,
  type RuleAvailabilityStates,
  subscribeRuleAvailability,
} from "./availability";
import {
  getEnforcementEnabled,
  subscribeEnforcementEnabled,
} from "./enforcement";
import { isTopFrame } from "./frame";
import { log } from "./log";
import {
  LABEL_CLASS,
  LABEL_ICON_CLASS,
  LABEL_TEXT_CLASS,
  PLACEHOLDER_CLASS,
  revealAll,
} from "./placeholder";
import {
  getPlaceholderDisplayMode,
  PLACEHOLDER_DISPLAY_MODE_DEFAULT,
  type PlaceholderDisplayMode,
  subscribePlaceholderDisplayMode,
} from "./placeholder-display";
import { getRuleStates, type RuleStates, subscribe } from "./storage";

const PLACEHOLDER_MODE_ATTR = "data-abs-placeholder-mode";

// Inline placeholders and the inner .${LABEL_CLASS} of block placeholders are
// <button> elements so screen readers and browser-use agents see them as
// actionable in the a11y tree. The block container itself is a <div> because
// position: sticky doesn't work on a <button>'s children — that broke the
// "pinned to top" reveal button when we tried making the container a button.
const PLACEHOLDER_STYLES = `
.${PLACEHOLDER_CLASS} {
  background: repeating-linear-gradient(
    45deg,
    #f0f0f0,
    #f0f0f0 6px,
    #e6e6e6 6px,
    #e6e6e6 12px
  );
  border: 1px dashed #999;
  border-radius: 3px;
  color: #555;
  cursor: pointer;
  font-family: system-ui, sans-serif;
  font-size: 12px;
}
.${PLACEHOLDER_CLASS}--inline {
  appearance: none;
  -webkit-appearance: none;
  display: inline-block;
  padding: 0 4px;
  margin: 0 1px;
  vertical-align: baseline;
  text-align: inherit;
  line-height: inherit;
}
.${PLACEHOLDER_CLASS}--block {
  box-sizing: border-box;
  padding: 8px;
  text-align: center;
}
.${LABEL_CLASS} {
  appearance: none;
  -webkit-appearance: none;
  position: sticky;
  top: 8px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: #fff;
  border: 1px solid #999;
  border-radius: 3px;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.${LABEL_ICON_CLASS} {
  width: 14px;
  height: 14px;
  flex: none;
  display: inline-block;
}
.${LABEL_TEXT_CLASS} {
  display: inline;
}
[${PLACEHOLDER_MODE_ATTR}="icon"] .${LABEL_TEXT_CLASS} {
  display: none;
}
[${PLACEHOLDER_MODE_ATTR}="icon"] .${LABEL_CLASS} {
  padding: 4px;
}
.${PLACEHOLDER_CLASS}:hover {
  background: #fff8c5;
}
.${LABEL_CLASS}:hover {
  background: #fff8c5;
}
`;

let stylesInjected = false;

function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement("style");
  style.setAttribute("data-abs-styles", "");
  style.textContent = PLACEHOLDER_STYLES;
  document.documentElement.appendChild(style);
}

function isApplicableHere(
  rule: Rule,
  topFrame: boolean,
  availability: RuleAvailabilityStates,
): boolean {
  if (!availability[rule.id]?.available) return false;
  // topFrameOnly rules target page-wide concepts (site footer, cookie/newsletter
  // overlays, per-host URL recipes). Running them in subframes would either
  // be a no-op (selectors don't match) or actively harmful (duplicate
  // landmark injection into every iframe's body).
  if (rule.topFrameOnly && !topFrame) return false;
  return true;
}

function applyEnabled(
  states: RuleStates,
  topFrame: boolean,
  availability: RuleAvailabilityStates,
): void {
  // document.body may be missing in some about:blank / about:srcdoc iframes
  // at document_idle if the parent injects the frame without children. Skip
  // rule application entirely in that case — there's nothing to scan, and
  // attempting to pass a null body would TypeError every rule.
  if (!document.body) {
    log("rule engine skipping — no document.body", {
      url: window.location.href,
    });
    return;
  }
  const enabled = RULES.filter(
    (rule) => isApplicableHere(rule, topFrame, availability) && states[rule.id],
  ).map((r) => r.id);
  log("initial rule application", {
    enabled,
    url: window.location.href,
    topFrame,
  });
  for (const rule of RULES) {
    if (!isApplicableHere(rule, topFrame, availability)) continue;
    if (states[rule.id]) {
      log("applying rule", { ruleId: rule.id });
      rule.apply(document.body);
    }
  }
}

// Effective application = enabled-by-user AND applicable-in-this-frame AND
// currently-available. Reconciliation reads from this so a change in any input
// (storage toggle, enforcement switch, availability flip) routes through the
// same diff logic.
function effectivelyApplied(
  rule: Rule,
  states: RuleStates,
  topFrame: boolean,
  availability: RuleAvailabilityStates,
): boolean {
  return (
    isApplicableHere(rule, topFrame, availability) && Boolean(states[rule.id])
  );
}

function reconcile(
  nextStates: RuleStates,
  previousStates: RuleStates,
  topFrame: boolean,
  nextAvailability: RuleAvailabilityStates,
  previousAvailability: RuleAvailabilityStates,
): void {
  if (!document.body) return;
  for (const rule of RULES) {
    const wasApplied = effectivelyApplied(
      rule,
      previousStates,
      topFrame,
      previousAvailability,
    );
    const isApplied = effectivelyApplied(
      rule,
      nextStates,
      topFrame,
      nextAvailability,
    );
    if (isApplied === wasApplied) continue;
    if (isApplied) {
      log("rule enabled — applying", { ruleId: rule.id });
      rule.apply(document.body);
    } else {
      log("rule disabled — revealing and tearing down", { ruleId: rule.id });
      revealAll(rule.id);
      rule.teardown?.();
    }
  }
}

function applyDisplayMode(mode: PlaceholderDisplayMode): void {
  document.documentElement.setAttribute(PLACEHOLDER_MODE_ATTR, mode);
}

const ALL_DISABLED: RuleStates = Object.fromEntries(
  RULES.map((rule) => [rule.id, false]),
) as RuleStates;

function mask(states: RuleStates, enforcementEnabled: boolean): RuleStates {
  return enforcementEnabled ? states : ALL_DISABLED;
}

export async function start(): Promise<void> {
  const topFrame = isTopFrame();
  log("rule engine starting", { url: window.location.href, topFrame });
  injectStyles();
  // Set the default synchronously so any placeholder created before storage
  // resolves gets the right CSS scoping.
  applyDisplayMode(PLACEHOLDER_DISPLAY_MODE_DEFAULT);
  void getPlaceholderDisplayMode().then(applyDisplayMode);
  subscribePlaceholderDisplayMode(applyDisplayMode);

  const [rawStates, enforcementInitial, availabilityInitial] =
    await Promise.all([
      getRuleStates(),
      getEnforcementEnabled(),
      getRuleAvailabilityStates(),
    ]);
  let rawCurrent = rawStates;
  let enforcementCurrent = enforcementInitial;
  let availabilityCurrent = availabilityInitial;
  applyEnabled(
    mask(rawCurrent, enforcementCurrent),
    topFrame,
    availabilityCurrent,
  );

  let effectiveCurrent = mask(rawCurrent, enforcementCurrent);

  function applyChange(
    nextRaw: RuleStates,
    nextEnforcement: boolean,
    nextAvailability: RuleAvailabilityStates,
  ): void {
    const nextEffective = mask(nextRaw, nextEnforcement);
    reconcile(
      nextEffective,
      effectiveCurrent,
      topFrame,
      nextAvailability,
      availabilityCurrent,
    );
    effectiveCurrent = nextEffective;
    rawCurrent = nextRaw;
    enforcementCurrent = nextEnforcement;
    availabilityCurrent = nextAvailability;
  }

  subscribe((next) => {
    applyChange(next, enforcementCurrent, availabilityCurrent);
  });
  subscribeEnforcementEnabled((enabled) => {
    log("enforcement toggle changed", { enabled });
    applyChange(rawCurrent, enabled, availabilityCurrent);
  });
  subscribeRuleAvailability((next) => {
    log("rule availability changed", {
      snapshot: Object.fromEntries(
        Object.entries(next).map(([id, snap]) => [id, snap.available]),
      ),
    });
    applyChange(rawCurrent, enforcementCurrent, next);
  });
}
