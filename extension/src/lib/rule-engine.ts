// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import type { CatalogRule } from "../rules";
import { RULES } from "../rules";
import { buildRuleRecord } from "../rules/rule-metadata";
import type { RuleAvailabilityStates } from "./availability";
import {
  getRuleAvailabilityStates,
  subscribeRuleAvailability,
} from "./availability";
import { initDebugTrace } from "./debug-trace";
import { PLACEHOLDER_MODE_ATTR, PLACEHOLDER_PALETTE_ATTR } from "./dom-markers";
import {
  initEffectiveEnforcement,
  subscribeEffectiveEnforcement,
} from "./effective-enforcement";
import { isTopFrame } from "./frame";
import { createRuleLogger, log } from "./log";
import {
  LABEL_CLASS,
  LABEL_ICON_CLASS,
  LABEL_TEXT_CLASS,
  PLACEHOLDER_CLASS,
  revealAll,
} from "./placeholder";
import {
  placeholderAdaptivePaletteStorage,
  setAdaptivePaletteCache,
} from "./placeholder-adaptive-palette";
import type { PlaceholderDisplayMode } from "./placeholder-display";
import {
  getPlaceholderDisplayMode,
  PLACEHOLDER_DISPLAY_MODE_DEFAULT,
  subscribePlaceholderDisplayMode,
} from "./placeholder-display";
import { adoptStylesheetIntoShadowRoots } from "./shadow-stylesheets";
import type { RuleStates } from "./storage";
import { getRuleStates, subscribe } from "./storage";

// Inline placeholders and the inner .${LABEL_CLASS} of block placeholders are
// <button> elements so screen readers and browser-use agents see them as
// actionable in the a11y tree. The block container itself is a <div> because
// position: sticky doesn't work on a <button>'s children — that broke the
// "pinned to top" reveal button when we tried making the container a button.
// Colors are exposed as CSS variables so the experimental adaptive-palette
// path can swap them per-placeholder. When `placeholderAdaptivePalette` is
// on, `placeholder.ts` stamps `data-abs-placeholder-palette="dark"` on each
// placeholder whose ancestor background sampled dark; the override block
// below redefines the same variables and the rest of the stylesheet picks
// them up via `var(--abs-pl-…)`. With the toggle off, no placeholder carries
// the attribute and the default light palette wins everywhere.
const PLACEHOLDER_STYLES = `
.${PLACEHOLDER_CLASS} {
  --abs-pl-stripe-a: #f0f0f0;
  --abs-pl-stripe-b: #e6e6e6;
  --abs-pl-border: #999;
  --abs-pl-text: #555;
  --abs-pl-label-bg: #fff;
  --abs-pl-hover-bg: #fff8c5;
  background: repeating-linear-gradient(
    45deg,
    var(--abs-pl-stripe-a),
    var(--abs-pl-stripe-a) 6px,
    var(--abs-pl-stripe-b) 6px,
    var(--abs-pl-stripe-b) 12px
  );
  border: 1px dashed var(--abs-pl-border);
  border-radius: 3px;
  color: var(--abs-pl-text);
  cursor: pointer;
  font-family: system-ui, sans-serif;
  font-size: 12px;
}
.${PLACEHOLDER_CLASS}[${PLACEHOLDER_PALETTE_ATTR}="dark"] {
  --abs-pl-stripe-a: #2a2a2a;
  --abs-pl-stripe-b: #1f1f1f;
  --abs-pl-border: #555;
  --abs-pl-text: #c8c8c8;
  --abs-pl-label-bg: #1a1a1a;
  --abs-pl-hover-bg: #3a3000;
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
  background: var(--abs-pl-label-bg);
  border: 1px solid var(--abs-pl-border);
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
  background: var(--abs-pl-hover-bg);
}
.${LABEL_CLASS}:hover {
  background: var(--abs-pl-hover-bg);
}
`;

let stylesInjected = false;

function injectStyles(): void {
  if (stylesInjected) {
    return;
  }
  stylesInjected = true;
  const style = document.createElement("style");
  style.dataset.absStyles = "";
  style.textContent = PLACEHOLDER_STYLES;
  document.documentElement.append(style);
  // Also adopt the same rules into every open shadow root so a
  // placeholder rendered inside a web-component shadow tree
  // (irrelevant-sections-redact resolves refs through page-tree
  // and can land a placeholder there) renders with its stripes,
  // border, and reveal-button chrome instead of as a bare <div>.
  // Document stylesheets don't cross shadow boundaries; the
  // adoptedStyleSheets primitive does.
  adoptStylesheetIntoShadowRoots(PLACEHOLDER_STYLES);
}

function isApplicableHere(
  rule: CatalogRule,
  topFrame: boolean,
  availability: RuleAvailabilityStates,
): boolean {
  if (!availability[rule.id].available) {
    return false;
  }
  // topFrameOnly rules target page-wide concepts (site footer, cookie/newsletter
  // overlays, per-host URL recipes). Running them in subframes would either
  // be a no-op (selectors don't match) or actively harmful (duplicate
  // landmark injection into every iframe's body).
  if (rule.topFrameOnly && !topFrame) {
    return false;
  }
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
  // TS lib types `document.body` as non-null; reality disagrees in iframes.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!document.body) {
    log.info("rule engine skipping — no document.body", {
      url: location.href,
    });
    return;
  }
  const enabled = RULES.filter(
    (rule) => isApplicableHere(rule, topFrame, availability) && states[rule.id],
  ).map((r) => r.id);
  log.info("initial rule application", {
    enabled,
    url: location.href,
    topFrame,
  });
  for (const rule of RULES) {
    if (!isApplicableHere(rule, topFrame, availability)) {
      continue;
    }
    if (states[rule.id]) {
      createRuleLogger(rule.id).info("applying rule");
      rule.apply(document.body);
    }
  }
}

// Effective application = enabled-by-user AND applicable-in-this-frame AND
// currently-available. Reconciliation reads from this so a change in any input
// (storage toggle, enforcement switch, availability flip) routes through the
// same diff logic.
function effectivelyApplied(
  rule: CatalogRule,
  states: RuleStates,
  topFrame: boolean,
  availability: RuleAvailabilityStates,
): boolean {
  return isApplicableHere(rule, topFrame, availability) && states[rule.id];
}

function reconcile(
  nextStates: RuleStates,
  previousStates: RuleStates,
  topFrame: boolean,
  nextAvailability: RuleAvailabilityStates,
  previousAvailability: RuleAvailabilityStates,
): void {
  // See note in applyAll — same iframe edge case.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!document.body) {
    return;
  }
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
    if (isApplied === wasApplied) {
      continue;
    }
    const ruleLog = createRuleLogger(rule.id);
    if (isApplied) {
      ruleLog.info("rule enabled — applying");
      rule.apply(document.body);
    } else {
      ruleLog.info("rule disabled — revealing and tearing down");
      revealAll(rule.id);
      rule.teardown?.();
    }
  }
}

function applyDisplayMode(mode: PlaceholderDisplayMode): void {
  document.documentElement.setAttribute(PLACEHOLDER_MODE_ATTR, mode);
}

const ALL_DISABLED: RuleStates = buildRuleRecord(() => false);

function mask(states: RuleStates, enforcementEnabled: boolean): RuleStates {
  return enforcementEnabled ? states : ALL_DISABLED;
}

export async function start(): Promise<void> {
  const topFrame = isTopFrame();
  log.info("rule engine starting", { url: location.href, topFrame });
  injectStyles();
  // Set the default synchronously so any placeholder created before storage
  // resolves gets the right CSS scoping.
  applyDisplayMode(PLACEHOLDER_DISPLAY_MODE_DEFAULT);
  void getPlaceholderDisplayMode().then(applyDisplayMode);
  subscribePlaceholderDisplayMode(applyDisplayMode);

  // Block on the debug-trace toggle alongside the rule state loads. If we
  // don't, the first document_idle apply emits its rule mutations while
  // the in-memory `enabled` flag is still its default (false) — the
  // storage round-trip resolves a tick later and the entire initial
  // burst gets silently dropped from the trace buffer.
  const [
    rawStates,
    enforcementInitial,
    availabilityInitial,
    adaptivePaletteInitial,
  ] = await Promise.all([
    getRuleStates(),
    initEffectiveEnforcement(),
    getRuleAvailabilityStates(),
    placeholderAdaptivePaletteStorage.get(),
    initDebugTrace(),
  ]);
  setAdaptivePaletteCache(adaptivePaletteInitial);
  placeholderAdaptivePaletteStorage.subscribe(setAdaptivePaletteCache);
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
  subscribeEffectiveEnforcement((enabled) => {
    log.info("effective enforcement changed", { enabled });
    applyChange(rawCurrent, enabled, availabilityCurrent);
  });
  subscribeRuleAvailability((next) => {
    log.info("rule availability changed", {
      snapshot: Object.fromEntries(
        Object.entries(next).map(([id, snap]) => [id, snap.available]),
      ),
    });
    applyChange(rawCurrent, enforcementCurrent, next);
  });
}
