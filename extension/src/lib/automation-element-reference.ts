// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Stable, opaque identifiers for DOM elements that survive a round-trip through
// the LLM. We hand the LLM a serialized page tree with `data-ref` attributes
// stamped on candidate nodes; the LLM responds with refs to act on; the rule
// then resolves each ref back to the original live element.
//
// Refs are bidirectional:
//   - WeakMap<Element, string> for forward lookup so re-stamping the same
//     element returns the same ref (keeps the prompt stable across passes).
//   - Map<string, WeakRef<Element>> for resolution after the LLM responds.
//     WeakRef lets the GC reclaim elements that were detached between request
//     and response.

import { nanoid } from "nanoid";

const REF_LENGTH = 10;

const refsByElement = new WeakMap<Element, string>();
const elementsByRef = new Map<string, WeakRef<Element>>();

export function getReferenceForElement(element: Element): string {
  const existing = refsByElement.get(element);
  if (existing) return existing;
  const ref = nanoid(REF_LENGTH);
  refsByElement.set(element, ref);
  elementsByRef.set(ref, new WeakRef(element));
  return ref;
}

export function resolveReference(ref: string): Element | undefined {
  const element = elementsByRef.get(ref)?.deref();
  if (!element?.isConnected) return undefined;
  return element;
}

// Forget any refs whose elements have been GC'd. Cheap to run between passes;
// keeps the reverse map from growing unbounded over long-lived tabs.
export function pruneReferences(): void {
  for (const [ref, weakRef] of elementsByRef) {
    if (!weakRef.deref()) elementsByRef.delete(ref);
  }
}
