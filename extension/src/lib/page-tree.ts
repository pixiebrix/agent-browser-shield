// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Build a compressed, semantic representation of the page suitable for sending
// to an LLM. Strips layout/styling noise (script/style/empty divs), keeps
// semantic attributes and current form values, and stamps `data-ref`
// identifiers on two categories of elements:
//   - Interactive nodes (buttons, inputs, links, ARIA roles like "tab") so the
//     LLM knows what stays load-bearing and never proposes hiding them.
//   - Container nodes (section/aside/nav/article/header/footer/main/figure/
//     dialog, plus block elements whose direct child is a heading) so the LLM
//     can pick the right granularity when flagging engagement rails.

import { getReferenceForElement } from "./automation-element-reference";

// Attributes that carry semantic intent. ids and classes are excluded because
// modern frameworks routinely auto-generate them and they add noise without
// meaning.
const attributeAllowlist = [
  /^title$/,
  /^role$/,
  /^aria-.*$/,
  /^href$/,
  /^alt$/,
  /^name$/,
  /^placeholder$/,
  /^type$/,
  /^pattern$/,
];

const tagDenyList = new Set([
  "SCRIPT",
  "CODE",
  "STYLE",
  "LINK",
  "META",
  "HEAD",
  "TITLE",
  "NOSCRIPT",
]);

const interactiveTagAllowlist = new Set([
  "BUTTON",
  "INPUT",
  "SELECT",
  "TEXTAREA",
  "A",
]);

// https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles
const interactiveRoleAllowlist = new Set([
  "button",
  "checkbox",
  "input",
  "link",
  "menuitem",
  "option",
  "radio",
  "tab",
  "textbox",
]);

// Layout-only tags. Stripped from the compressed tree if they don't carry
// semantic attributes or child elements.
const nonSemanticTags = new Set(["SPAN", "DIV"]);

// Inherently zero-size elements that should not be filtered as hidden.
const zeroDimensionAllowlist = new Set(["BR", "HR", "WBR", "COL"]);

// Cap per-text-node length so a single paragraph or textarea can't blow the
// prompt budget. The LLM still gets the leading content to classify the
// section by; a trailing ellipsis signals truncation occurred.
const MAX_TEXT_NODE_CHARS = 160;

// Normalize a text node's content for the prompt: collapse internal whitespace
// runs to single spaces (the LLM doesn't need newlines or indentation), trim
// the edges, and cap the length. Returns null for content that's entirely
// whitespace so callers can skip emitting an empty text node.
function normalizeTextContent(raw: string): string | null {
  const collapsed = raw.replaceAll(/\s+/g, " ").trim();
  if (collapsed.length === 0) {
    return null;
  }
  if (collapsed.length <= MAX_TEXT_NODE_CHARS) {
    return collapsed;
  }
  return `${collapsed.slice(0, MAX_TEXT_NODE_CHARS).trimEnd()}…`;
}

// Containers that anchor a meaningful subtree. Stamped with a ref so the LLM
// can target them when flagging engagement rails / "you might also like" /
// recommendation grids.
const containerTagAllowlist = new Set([
  "SECTION",
  "ASIDE",
  "NAV",
  "ARTICLE",
  "HEADER",
  "FOOTER",
  "MAIN",
  "FIGURE",
  "DIALOG",
]);

const DIRECT_HEADING_SELECTOR = ":scope > h1, :scope > h2, :scope > h3";
const NESTED_HEADING_SELECTOR =
  ":scope > * > h1, :scope > * > h2, :scope > * > h3";

// Visibility check on the live DOM. Mirrors jQuery's `:visible` semantics:
// display:none, visibility:hidden, content-visibility:hidden, or zero box.
// Must be called on the live element, not a clone — visibility depends on the
// live document's computed styles.
function isElementVisible(element: HTMLElement): boolean {
  // Hidden inputs are display:none by UA stylesheet but carry form state. Keep
  // them so the LLM sees the input's role in the form.
  if (element instanceof HTMLInputElement && element.type === "hidden") {
    return true;
  }

  if (!element.checkVisibility()) {
    // display:contents elements have no layout box (checkVisibility returns
    // false) but participate in parent layout normally. Pay for
    // getComputedStyle only on this uncommon fall-through path.
    if (getComputedStyle(element).display === "contents") {
      return true;
    }
    return false;
  }

  if (zeroDimensionAllowlist.has(element.tagName)) {
    return true;
  }

  // Catch zero-dimension elements (e.g. height:0 + overflow:hidden) that
  // checkVisibility considered visible.
  if (element.offsetHeight === 0 && element.offsetWidth === 0) {
    return false;
  }

  return true;
}

function isInteractiveElement(element: HTMLElement): boolean {
  if ("disabled" in element && (element as HTMLButtonElement).disabled) {
    return false;
  }
  if ("readOnly" in element && (element as HTMLInputElement).readOnly) {
    return false;
  }
  const role = element.getAttribute("role");
  return (
    interactiveTagAllowlist.has(element.tagName) ||
    element.hasAttribute("tabindex") ||
    element.hasAttribute("contenteditable") ||
    (role != null && interactiveRoleAllowlist.has(role))
  );
}

// Containers worth labeling for the LLM. Landmark tags always qualify; a plain
// block with a heading child also qualifies because that's the common shape of
// a recommendation rail ("You might also like" + grid of cards).
function isStampableContainer(element: HTMLElement): boolean {
  if (containerTagAllowlist.has(element.tagName)) {
    return true;
  }
  if (element.querySelector(DIRECT_HEADING_SELECTOR)) {
    return true;
  }
  if (element.querySelector(NESTED_HEADING_SELECTOR)) {
    return true;
  }
  return false;
}

function shouldStampReference(element: HTMLElement): boolean {
  return isInteractiveElement(element) || isStampableContainer(element);
}

function setValueAttributesInPlace({
  element,
  compressedElement,
}: {
  element: HTMLElement;
  compressedElement: HTMLElement;
}): void {
  if (element instanceof HTMLInputElement) {
    // Current value, not the initial DOM value — the agent needs to see what's
    // actually populated in the form.
    compressedElement.setAttribute("value", element.value);
    if (element.type === "checkbox" || element.type === "radio") {
      // `checked` is a binary property.
      if (element.checked) {
        compressedElement.setAttribute("checked", "");
      } else {
        compressedElement.removeAttribute("checked");
      }
    }
  } else if (element instanceof HTMLTextAreaElement) {
    // Truncate the same way other text nodes are truncated so a multi-page
    // draft can't bloat the prompt.
    compressedElement.textContent = normalizeTextContent(element.value) ?? "";
  }
}

function getElementTree(element: HTMLElement): Node | undefined {
  if (tagDenyList.has(element.tagName)) {
    return;
  }

  // Visibility must be measured on the live element, before any cloning.
  if (!isElementVisible(element)) {
    return;
  }

  const compressedElement = document.createElement(element.tagName);
  const attributes = [...element.attributes].filter((attribute) =>
    attributeAllowlist.some((pattern) => pattern.test(attribute.name)),
  );
  for (const attribute of attributes) {
    compressedElement.setAttribute(attribute.name, attribute.value);
  }

  setValueAttributesInPlace({ element, compressedElement });

  // Recurse into children. SVG subtrees and textarea content are not walked:
  // SVG carries no useful semantics for this rule, and textarea content is
  // already set above to reflect the current value.
  if (
    !(element instanceof SVGElement) &&
    !(element instanceof HTMLTextAreaElement)
  ) {
    const visitChildNode = (node: Node): void => {
      if (node instanceof HTMLElement) {
        const childElement = getElementTree(node);
        if (childElement) {
          compressedElement.append(childElement);
        }
      } else if (node instanceof Text) {
        const normalized = normalizeTextContent(node.textContent);
        if (normalized) {
          compressedElement.append(document.createTextNode(normalized));
        }
      }
    };

    for (const node of element.childNodes) {
      visitChildNode(node);
    }

    // Open shadow roots only — closed roots are opaque by design.
    if (element.shadowRoot) {
      for (const node of element.shadowRoot.childNodes) {
        visitChildNode(node);
      }
    }
  }

  // Strip styling-only wrappers that survived attribute filtering. Lift a
  // single non-text child up to its grandparent so the tree stays shallow.
  if (nonSemanticTags.has(element.tagName) && attributes.length === 0) {
    if (compressedElement.childNodes.length === 0) {
      return;
    }
    if (
      compressedElement.childNodes.length === 1 &&
      compressedElement.firstChild?.nodeType !== Node.TEXT_NODE
    ) {
      return compressedElement.firstChild ?? undefined;
    }
  }

  if (shouldStampReference(element)) {
    compressedElement.dataset.ref = getReferenceForElement(element);
  }

  return compressedElement;
}

export function getPageTree(): HTMLBodyElement {
  const compressedBody = document.createElement("body");
  for (const child of document.body.childNodes) {
    if (child instanceof HTMLElement) {
      const elementTree = getElementTree(child);
      if (elementTree) {
        compressedBody.append(elementTree);
      }
    } else if (child instanceof Text) {
      const normalized = normalizeTextContent(child.textContent);
      if (normalized) {
        compressedBody.append(document.createTextNode(normalized));
      }
    }
  }
  return compressedBody;
}
