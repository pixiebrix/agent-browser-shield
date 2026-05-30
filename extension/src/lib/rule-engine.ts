import { RULES, type Rule } from "../rules";
import { log } from "./log";
import { LABEL_CLASS, PLACEHOLDER_CLASS, revealAll } from "./placeholder";
import { getRuleStates, type RuleStates, subscribe } from "./storage";

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
  display: inline-block;
  padding: 4px 8px;
  background: #fff;
  border: 1px solid #999;
  border-radius: 3px;
  color: inherit;
  font: inherit;
  cursor: pointer;
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

function isAvailable(rule: Rule): boolean {
  return rule.available !== false;
}

function applyEnabled(states: RuleStates): void {
  const enabled = RULES.filter(
    (rule) => isAvailable(rule) && states[rule.id],
  ).map((r) => r.id);
  log("initial rule application", { enabled, url: window.location.href });
  for (const rule of RULES) {
    if (!isAvailable(rule)) continue;
    if (states[rule.id]) {
      log("applying rule", { ruleId: rule.id });
      rule.apply(document.body);
    }
  }
}

function reconcile(next: RuleStates, previous: RuleStates): void {
  for (const rule of RULES) {
    if (!isAvailable(rule)) continue;
    const wasEnabled = previous[rule.id];
    const isEnabled = next[rule.id];
    if (isEnabled === wasEnabled) continue;
    if (isEnabled) {
      log("rule enabled — applying", { ruleId: rule.id });
      rule.apply(document.body);
    } else {
      log("rule disabled — revealing and tearing down", { ruleId: rule.id });
      revealAll(rule.id);
      rule.teardown?.();
    }
  }
}

export async function start(): Promise<void> {
  log("rule engine starting", { url: window.location.href });
  injectStyles();
  const initial = await getRuleStates();
  applyEnabled(initial);

  let current = initial;
  subscribe((next) => {
    reconcile(next, current);
    current = next;
  });
}
