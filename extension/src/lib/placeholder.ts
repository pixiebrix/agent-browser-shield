// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { isDebugTraceEnabled, recordRuleApplication } from "./debug-trace";
import { REVEALED_ATTR, RULE_ATTR } from "./dom-markers";
import { log } from "./log";
import type { RuleId } from "./storage";

function describeForTrace(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : "";
  const classes =
    element.classList.length > 0 ? `.${[...element.classList].join(".")}` : "";
  return `${tag}${id}${classes}`;
}

export const PLACEHOLDER_CLASS = "abs-placeholder";
export const LABEL_CLASS = "abs-placeholder__label";
export const LABEL_TEXT_CLASS = "abs-placeholder__text";
export const LABEL_ICON_CLASS = "abs-placeholder__icon";

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
  "reviews-redact":
    "M12 2.5l2.6 6.3 6.8.5-5.2 4.4 1.7 6.6L12 16.9l-5.9 3.4 1.7-6.6L2.6 9.3l6.8-.5L12 2.5z",
  "comments-redact":
    "M3 6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-5l-5 4v-4H6a3 3 0 0 1-3-3V6z",
  "prompt-injection-redact": "M12 3l10 18H2L12 3zM12 10v5M12 17.5v.01",
  "countdown-timer-redact": "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 3",
  "scarcity-redact":
    "M12 22c-4 0-7-3-7-7 0-3 2-5 3-6-1 4 2 6 2 6 1-3 3-6 3-9 4 3 6 6 6 10 0 4-3 7-7 7z",
  "footer-redact": "M4 5h16v10H4zM4 19h16",
  "social-embed-redact": "M5 9h14M5 15h14M10 5l-2 14M16 5l-2 14",
  "irrelevant-sections-redact": "M3 4h18l-7 9v6l-4 2v-8L3 4z",
  // Globe with one meridian + one parallel — signals "different web origin".
  "cross-origin-frame-redact":
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
  // outerHTML is non-trivial on large subtrees — only pay the cost when
  // the dev-mode trace toggle is on. Capture before the swap so the
  // serialization reflects the original tree, not the placeholder.
  const beforeHtml = isDebugTraceEnabled() ? element.outerHTML : "";
  const selector = isDebugTraceEnabled() ? describeForTrace(element) : "";
  element.replaceWith(placeholder);
  log("block placeholder created", {
    ruleId,
    label,
    hidden: describeNode(element),
    size: { width: rect.width, height: rect.height },
  });
  recordRuleApplication({
    ruleId,
    kind: "hide",
    selector,
    beforeHtml,
    afterHtml: isDebugTraceEnabled() ? placeholder.outerHTML : "",
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
    fragment.append(
      createInlinePlaceholder(
        ruleId,
        match.label,
        text.slice(match.start, match.end),
      ),
    );
    cursor = match.end;
  }

  if (cursor < text.length) {
    fragment.append(document.createTextNode(text.slice(cursor)));
  }

  textNode.parentNode?.replaceChild(fragment, textNode);
}

function createInlinePlaceholder(
  ruleId: RuleId,
  label: string,
  originalText: string,
): HTMLButtonElement {
  // Inline placeholders are short and have no scrollable area, so the
  // <button> serves as both the visual chip and the a11y-tree exposure.
  const placeholder = document.createElement("button");
  placeholder.type = "button";
  placeholder.className = `${PLACEHOLDER_CLASS} ${PLACEHOLDER_CLASS}--inline`;
  placeholder.setAttribute(RULE_ATTR, ruleId);
  placeholder.textContent = label;
  attachReveal(placeholder, document.createTextNode(originalText));
  log("inline placeholder created", {
    ruleId,
    label,
    hiddenLength: originalText.length,
  });
  if (isDebugTraceEnabled()) {
    recordRuleApplication({
      ruleId,
      kind: "mask",
      selector: `text:${label}`,
      beforeHtml: "",
      afterHtml: placeholder.outerHTML,
      beforeText: originalText,
    });
  }
  return placeholder;
}

// One match in a bucket-level operation. Offsets are in each text node's
// local nodeValue space; `startIndex` / `endIndex` index into the `nodes`
// array passed to `replaceMatchesAcrossTextNodes`. Single-node matches
// have `startIndex === endIndex`.
export interface MultiNodeMatch {
  startIndex: number;
  startOffset: number;
  endIndex: number;
  endOffset: number;
  label: string;
}

// Atomic-by-node materializer for a bucket of sibling text nodes in one
// inline-formatting context. `nodes` is the ordered text-node run; each
// match's offsets are interpreted against the *original* nodeValues, so
// the caller passes pre-mutation positions for all matches at once. The
// helper plans every affected node's new content before touching the DOM,
// then performs at most one replaceChild per affected node.
//
// Why batch: applying matches one at a time invalidates the offset map.
// Calling `parentNode.replaceChild(fragment, textNode)` for the first
// match detaches that text node; a second match into the same node finds
// `parentNode === null` and silently drops. Cross-node matches that
// truncate a boundary node shift every later offset in that node by the
// truncation amount, so a single-node match that lands in the truncated
// region masks the wrong characters. Batching sidesteps both: each
// affected text node is mutated exactly once, against its original
// content.
//
// Wrapping inline elements (the `<span>`s a framework rendered around
// per-digit groups) are NOT detached. Interior text nodes consumed
// entirely have their `nodeValue` blanked instead of being removed, so
// any framework tracking the parent span's child list still sees a
// (now-empty) text node child. This matches the "scrub the carrier,
// don't detach framework-owned nodes" pattern used by the rest of the
// codebase.
//
// Reveal restores the matched substring as a single new text node at the
// placeholder's position — the original per-node split is not
// reconstructed. The user sees the same characters; the surrounding
// wrapper elements remain in place around them.
export function replaceMatchesAcrossTextNodes(
  nodes: readonly Text[],
  matches: readonly MultiNodeMatch[],
  ruleId: RuleId,
): void {
  if (matches.length === 0) {
    return;
  }

  // Snapshot original values up front — every offset in `matches` is
  // interpreted against these, regardless of order. nodeValue can change
  // out from under us as we mutate, but the snapshot stays canonical.
  const originalValues = nodes.map((node) => node.nodeValue ?? "");

  // For each match, build its reveal-text from the matched span (which
  // can cross node boundaries) and create one placeholder element. The
  // placeholder is anchored to the first node the match touches.
  interface NodeSegment {
    localStart: number;
    localEnd: number;
    // Present only on the node that anchors this match's placeholder.
    placeholder?: HTMLButtonElement;
  }
  const perNode = new Map<number, NodeSegment[]>();

  function pushSegment(index: number, segment: NodeSegment): void {
    let list = perNode.get(index);
    if (!list) {
      list = [];
      perNode.set(index, list);
    }
    list.push(segment);
  }

  for (const match of matches) {
    if (
      match.startIndex < 0 ||
      match.startIndex >= nodes.length ||
      match.endIndex < 0 ||
      match.endIndex >= nodes.length ||
      match.startIndex > match.endIndex
    ) {
      continue;
    }
    const matchedText = collectMatchedText(originalValues, match);
    const placeholder = createInlinePlaceholder(
      ruleId,
      match.label,
      matchedText,
    );
    if (match.startIndex === match.endIndex) {
      pushSegment(match.startIndex, {
        localStart: match.startOffset,
        localEnd: match.endOffset,
        placeholder,
      });
      continue;
    }
    pushSegment(match.startIndex, {
      localStart: match.startOffset,
      localEnd: originalValues[match.startIndex]?.length ?? 0,
      placeholder,
    });
    for (let i = match.startIndex + 1; i < match.endIndex; i++) {
      pushSegment(i, {
        localStart: 0,
        localEnd: originalValues[i]?.length ?? 0,
      });
    }
    pushSegment(match.endIndex, {
      localStart: 0,
      localEnd: match.endOffset,
    });
  }

  // Materialize each affected node from its original value. Segments
  // come in concat order already (matches are sorted ascending in the
  // caller); per-node segments inherit that ordering.
  for (const [index, segments] of perNode) {
    const node = nodes[index];
    const originalValue = originalValues[index];
    if (!node || originalValue === undefined) {
      continue;
    }
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const segment of segments) {
      if (segment.localStart > cursor) {
        fragment.append(
          document.createTextNode(
            originalValue.slice(cursor, segment.localStart),
          ),
        );
      }
      if (segment.placeholder) {
        fragment.append(segment.placeholder);
      }
      cursor = segment.localEnd;
    }
    if (cursor < originalValue.length) {
      fragment.append(document.createTextNode(originalValue.slice(cursor)));
    }
    if (fragment.childNodes.length === 0) {
      // Interior text node fully consumed by a cross-node match with no
      // placeholder anchor here — blank rather than detach so the parent
      // element still sees a child text node in its layout-time position.
      node.nodeValue = "";
    } else {
      node.parentNode?.replaceChild(fragment, node);
    }
  }
}

function collectMatchedText(
  originalValues: readonly string[],
  match: MultiNodeMatch,
): string {
  const firstValue = originalValues[match.startIndex] ?? "";
  if (match.startIndex === match.endIndex) {
    return firstValue.slice(match.startOffset, match.endOffset);
  }
  const interior = originalValues
    .slice(match.startIndex + 1, match.endIndex)
    .join("");
  const lastValue = originalValues[match.endIndex] ?? "";
  return (
    firstValue.slice(match.startOffset) +
    interior +
    lastValue.slice(0, match.endOffset)
  );
}

// Single-match convenience wrapper. Most callers (and the placeholder.ts
// tests) operate on one match at a time; the bucket factory uses the
// plural form directly so its planning step can see every match at once.
export function replaceMatchAcrossTextNodes(
  nodes: readonly Text[],
  startIndex: number,
  startOffset: number,
  endIndex: number,
  endOffset: number,
  ruleId: RuleId,
  label: string,
): void {
  replaceMatchesAcrossTextNodes(
    nodes,
    [{ startIndex, startOffset, endIndex, endOffset, label }],
    ruleId,
  );
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
