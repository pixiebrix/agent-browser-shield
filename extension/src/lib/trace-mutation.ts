// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Single chokepoint every rule routes its DOM mutation through so the
// dev-mode trace captures before/after `outerHTML` for the whole catalog
// — not just the placeholder + selector-hide paths that originally had
// bespoke emit sites.
//
// The wrapper runs the mutation synchronously and snapshots either the
// target element or a caller-supplied ancestor twice (before and after).
// Capture is gated on `isDebugTraceEnabled()`: when the toggle is off,
// the wrapper is a thin pass-through and pays no serialization cost — a
// busy page can run thousands of mutations per tick.
//
// The capture-ancestor escape hatch matters for two patterns:
//
// 1. Flag/annotate rules append a sibling chip. The element's own
//    `outerHTML` doesn't include the new chip, so the caller passes
//    `captureFrom: element.parentElement` to snapshot the surrounding
//    region instead.
// 2. Strip rules that mutate non-Element nodes (Comment data, Text
//    content nested under another element) target the parent Element
//    and snapshot from there — the parent's `outerHTML` reflects the
//    child's change.
//
// CSS-first hides (currently `chat-widget-hide`) can't route through
// this wrapper because the mutation is a declarative stylesheet
// injection — there's no element-level write and `beforeHtml` would
// equal `afterHtml`. They take a separate path: the counter sweep in
// `rule-count.ts` emits `cssOnly: true` events per matched element so
// false-positive triage still has the matched element's outerHTML to
// look at.

import { isDebugTraceEnabled, recordRuleApplication } from "./debug-trace";
import type { RuleApplicationKind } from "./detection-messages";
import { describeElement } from "./element-describe";

export interface TraceMutationOptions {
  ruleId: string;
  kind: RuleApplicationKind;
  // The element the trace event is attributed to. Used to derive a
  // selector when one is not supplied. Need not be the element the
  // mutation physically writes to — see `captureFrom`.
  target: Element;
  // Override the auto-derived "tag#id.class" selector. Pass when the
  // rule already has a more meaningful identifier (e.g. the selector
  // union that triggered a match).
  selector?: string;
  // The element whose `outerHTML` is snapshotted before and after the
  // mutation. Defaults to `target`. Pass a parent when the mutation
  // adds a sibling chip or edits a non-Element child — `target`'s own
  // outerHTML wouldn't reflect either change.
  captureFrom?: Element;
}

export function traceMutation<T>(
  options: TraceMutationOptions,
  mutate: () => T,
): T {
  if (!isDebugTraceEnabled()) {
    return mutate();
  }
  const capture = options.captureFrom ?? options.target;
  const beforeHtml = capture.outerHTML;
  const result = mutate();
  const afterHtml = capture.outerHTML;
  recordRuleApplication({
    ruleId: options.ruleId,
    kind: options.kind,
    selector: options.selector ?? describeElement(options.target),
    beforeHtml,
    afterHtml,
  });
  return result;
}
