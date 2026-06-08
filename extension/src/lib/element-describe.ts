// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// "tag#id.classes" selector-shaped description used to label trace events
// (rule mutations and modal-open markers). Not a real querySelector — IDs
// and class names aren't escaped — but good enough for a human reading
// the trace to recognize the element.

export function describeElement(element: Element, suffix = ""): string {
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : "";
  const classes =
    element.classList.length > 0 ? `.${[...element.classList].join(".")}` : "";
  return `${tag}${id}${classes}${suffix}`;
}
