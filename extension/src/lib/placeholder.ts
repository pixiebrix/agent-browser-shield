// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { log } from "./log";
import type { RuleId } from "./storage";

export const PLACEHOLDER_CLASS = "abs-placeholder";
export const LABEL_CLASS = "abs-placeholder__label";
export const LABEL_TEXT_CLASS = "abs-placeholder__text";
export const LABEL_ICON_CLASS = "abs-placeholder__icon";
export const RULE_ATTR = "data-abs-rule";
// Stamped onto the original element after the user clicks to reveal, so a
// rule's subtree watcher doesn't immediately re-hide it on the next scan.
export const REVEALED_ATTR = "data-abs-revealed";
// Stamped onto elements hidden in-place via display:none (removeEntirely
// rules). We don't detach the node because doing so breaks React's fiber when
// it tries to reconcile siblings — the original is left in the DOM, just
// non-rendering. The attribute lets the rule skip re-processing it.
export const HIDDEN_ATTR = "data-abs-hidden";

export interface InlineMatch {
  start: number;
  end: number;
  label: string;
}

function describeNode(node: Node): Record<string, unknown> {
  if (node.nodeType === Node.ELEMENT_NODE) {
    const element = node as Element;
    return {
      tag: element.tagName,
      id: element.id || undefined,
      classes: element.className || undefined,
    };
  }
  return { nodeType: node.nodeType };
}

function attachReveal(container: HTMLElement, original: Node): void {
  const ruleId = container.getAttribute(RULE_ATTR);
  let revealed = false;
  const reveal = (event: Event) => {
    const target = event.target as Element | null;
    log("reveal click received", {
      ruleId,
      eventType: event.type,
      isTrusted: event.isTrusted,
      targetTag: target?.tagName,
      targetIsButton: target?.tagName === "BUTTON",
      alreadyRevealed: revealed,
    });
    if (revealed) {
      return;
    }
    revealed = true;
    event.preventDefault();
    event.stopPropagation();
    container.removeEventListener("click", reveal);
    if (original.nodeType === Node.ELEMENT_NODE && ruleId) {
      (original as Element).setAttribute(REVEALED_ATTR, ruleId);
    }
    container.replaceWith(original);
    log("reveal complete — original restored", {
      ruleId,
      restored: describeNode(original),
    });
  };
  container.addEventListener("click", reveal);
}

const SVG_NS = "http://www.w3.org/2000/svg";

// 24×24 viewBox SVG paths, stroke-style (no fill) so they read well at 14px.
// Each path stands alone — multi-path icons would need to render multiple
// children, and the visual differentiation we want is fine with a single
// expressive silhouette per rule. Default shield is used when no rule-specific
// icon is registered.
const SHIELD_PATH = "M12 21a9 9 0 0 1-9-9V5l9-3 9 3v7a9 9 0 0 1-9 9z";

const RULE_ICON_PATHS: Partial<Record<RuleId, string>> = {
  "reviews-hide":
    "M12 2.5l2.6 6.3 6.8.5-5.2 4.4 1.7 6.6L12 16.9l-5.9 3.4 1.7-6.6L2.6 9.3l6.8-.5L12 2.5z",
  "comments-hide":
    "M3 6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-5l-5 4v-4H6a3 3 0 0 1-3-3V6z",
  "prompt-injection-hide": "M12 3l10 18H2L12 3zM12 10v5M12 17.5v.01",
  "countdown-timer-hide": "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 3",
  "scarcity-hide":
    "M12 22c-4 0-7-3-7-7 0-3 2-5 3-6-1 4 2 6 2 6 1-3 3-6 3-9 4 3 6 6 6 10 0 4-3 7-7 7z",
  "footer-hide": "M4 5h16v10H4zM4 19h16",
  "social-embed-hide": "M5 9h14M5 15h14M10 5l-2 14M16 5l-2 14",
  "irrelevant-sections-hide": "M3 4h18l-7 9v6l-4 2v-8L3 4z",
  // Globe with one meridian + one parallel — signals "different web origin".
  "cross-origin-frame-hide":
    "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.5 4 5.7 4 9s-1.5 6.5-4 9c-2.5-2.5-4-5.7-4-9s1.5-6.5 4-9z",
};

function createIcon(ruleId: RuleId): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", LABEL_ICON_CLASS);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.75");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", RULE_ICON_PATHS[ruleId] ?? SHIELD_PATH);
  svg.append(path);
  return svg;
}

function createRevealButton(ruleId: RuleId, label: string): HTMLButtonElement {
  const button = document.createElement("button");
  // type="button" prevents form submission when the placeholder happens to be
  // inserted inside a <form>.
  button.type = "button";
  button.className = LABEL_CLASS;
  // aria-label and title carry the descriptor in icon-only mode where the text
  // span is hidden by CSS. In button mode the visible text repeats the label;
  // screen readers prefer aria-label when both are present so there's no
  // double-announcement.
  button.setAttribute("aria-label", label);
  button.title = label;
  button.append(createIcon(ruleId));
  const text = document.createElement("span");
  text.className = LABEL_TEXT_CLASS;
  text.textContent = label;
  button.append(text);
  return button;
}

export function replaceWithBlockPlaceholder(
  element: HTMLElement,
  ruleId: RuleId,
  label: string,
): HTMLDivElement {
  const rect = element.getBoundingClientRect();
  const computed = globalThis.getComputedStyle(element);

  // Outer container is a non-interactive <div> so the inner reveal button can
  // use position: sticky (which doesn't work as a child of <button>). Click
  // on the container — including clicks bubbled up from the inner button —
  // triggers the reveal. The button is the element exposed in the a11y tree.
  const placeholder = document.createElement("div");
  placeholder.className = `${PLACEHOLDER_CLASS} ${PLACEHOLDER_CLASS}--block`;
  placeholder.setAttribute(RULE_ATTR, ruleId);

  placeholder.append(createRevealButton(ruleId, label));

  placeholder.style.width = `${rect.width}px`;
  placeholder.style.minHeight = `${rect.height}px`;
  const display = computed.display;
  if (display && display !== "inline") {
    placeholder.style.display =
      display === "inline-block" ? "inline-block" : "block";
  }

  attachReveal(placeholder, element);
  element.replaceWith(placeholder);
  log("block placeholder created", {
    ruleId,
    label,
    hidden: describeNode(element),
    size: { width: rect.width, height: rect.height },
  });
  return placeholder;
}

export function replaceMatchesInTextNode(
  textNode: Text,
  matches: InlineMatch[],
  ruleId: RuleId,
): void {
  if (matches.length === 0) {
    return;
  }
  const text = textNode.nodeValue ?? "";
  const fragment = document.createDocumentFragment();
  let cursor = 0;

  for (const match of matches) {
    if (match.start < cursor) {
      continue;
    }
    if (match.start > cursor) {
      fragment.append(document.createTextNode(text.slice(cursor, match.start)));
    }
    // Inline placeholders are short and have no scrollable area, so the
    // <button> serves as both the visual chip and the a11y-tree exposure.
    const placeholder = document.createElement("button");
    placeholder.type = "button";
    placeholder.className = `${PLACEHOLDER_CLASS} ${PLACEHOLDER_CLASS}--inline`;
    placeholder.setAttribute(RULE_ATTR, ruleId);
    placeholder.textContent = match.label;
    const restored = document.createTextNode(
      text.slice(match.start, match.end),
    );
    attachReveal(placeholder, restored);
    fragment.append(placeholder);
    log("inline placeholder created", {
      ruleId,
      label: match.label,
      hiddenLength: match.end - match.start,
    });
    cursor = match.end;
  }

  if (cursor < text.length) {
    fragment.append(document.createTextNode(text.slice(cursor)));
  }

  textNode.parentNode?.replaceChild(fragment, textNode);
}

export function revealAll(ruleId: RuleId): void {
  const placeholders = document.querySelectorAll<HTMLElement>(
    `[${RULE_ATTR}="${ruleId}"]`,
  );
  log("revealAll invoked", { ruleId, count: placeholders.length });
  for (const placeholder of placeholders) {
    placeholder.dispatchEvent(new MouseEvent("click"));
  }
}
