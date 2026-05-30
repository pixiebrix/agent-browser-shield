import { log } from "./log";
import type { RuleId } from "./storage";

export const PLACEHOLDER_CLASS = "abs-placeholder";
export const LABEL_CLASS = "abs-placeholder__label";
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
    const el = node as Element;
    return {
      tag: el.tagName,
      id: el.id || undefined,
      classes: el.className || undefined,
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
    if (revealed) return;
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

function createRevealButton(label: string): HTMLButtonElement {
  const button = document.createElement("button");
  // type="button" prevents form submission when the placeholder happens to be
  // inserted inside a <form>.
  button.type = "button";
  button.className = LABEL_CLASS;
  button.textContent = label;
  return button;
}

export function replaceWithBlockPlaceholder(
  element: HTMLElement,
  ruleId: RuleId,
  label: string,
): HTMLDivElement {
  const rect = element.getBoundingClientRect();
  const computed = window.getComputedStyle(element);

  // Outer container is a non-interactive <div> so the inner reveal button can
  // use position: sticky (which doesn't work as a child of <button>). Click
  // on the container — including clicks bubbled up from the inner button —
  // triggers the reveal. The button is the element exposed in the a11y tree.
  const placeholder = document.createElement("div");
  placeholder.className = `${PLACEHOLDER_CLASS} ${PLACEHOLDER_CLASS}--block`;
  placeholder.setAttribute(RULE_ATTR, ruleId);

  placeholder.appendChild(createRevealButton(label));

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
  if (matches.length === 0) return;
  const text = textNode.nodeValue ?? "";
  const fragment = document.createDocumentFragment();
  let cursor = 0;

  for (const match of matches) {
    if (match.start < cursor) continue;
    if (match.start > cursor) {
      fragment.appendChild(
        document.createTextNode(text.slice(cursor, match.start)),
      );
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
    fragment.appendChild(placeholder);
    log("inline placeholder created", {
      ruleId,
      label: match.label,
      hiddenLength: match.end - match.start,
    });
    cursor = match.end;
  }

  if (cursor < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(cursor)));
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
