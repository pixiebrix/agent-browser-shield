// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Factory for the most common DOM-mutating rule shape: scan a root once on
// `apply`, then re-scan every lazily-inserted subtree the shared
// MutationObserver surfaces. The rules that adopt this (scarcity-redact,
// json-ld-sanitize, hidden-text-strip, …) previously hand-rolled the identical
// four-part skeleton — a module-level `watcher`, a `scanAndX(root)`, an `apply`
// wiring the two, and a `teardown` calling `watcher.stop()` — once each.
// AGENTS.md documented that skeleton, but documenting boilerplate doesn't stop
// a new rule from forgetting `skipPlaceholderSubtrees` (its own placeholders
// then re-trigger the watcher) or dropping the teardown (the observer leaks).
//
// This factory deliberately covers ONLY the no-extra-lifecycle case. Rules
// whose lifecycle is anything more keep hand-wiring `createSubtreeWatcher`
// directly:
//   - a second watcher / head router (meta-injection-strip)
//   - a route / focus subscription (form-prefill-annotate)
//   - a deferred snapshot reconcile (countdown-timer-redact)
//   - an onSubtrees callback that ignores `roots` and re-scans document.body
//     (cross-origin-frame-redact, svg-sprite-strip)
//   - a teardown that restores page state (confirmshame-sanitize)

import type { Rule } from "../rules/types";
import type { RuleId } from "./storage";
import { createSubtreeWatcher } from "./subtree-watcher";

export interface ScanRuleOptions<Id extends RuleId = RuleId> {
  // Generic over the literal id so `rule.id` keeps its narrow `RuleId` literal
  // (inferred from the call site) rather than widening to `RuleId`. The rule
  // catalog's compile-time agreement check in `rules/index.ts` relies on it.
  id: Id;
  label: string;
  description: string;
  // Scan `root` and apply the rule's mutation to every match within it. Called
  // once per `apply(root)` and once per subtree the watcher surfaces, so it
  // must be idempotent (the same node can be handed back on a later batch).
  //
  // `querySelectorAll` only matches descendants, so when the rule's targets can
  // arrive as a bare inserted root (a `<script type="application/ld+json">`
  // appended directly), `scan` is responsible for the `root.matches(...)`
  // self-check — see json-ld-sanitize / attribute-injection-sanitize.
  scan: (root: ParentNode) => void;
  // Forwarded to `createSubtreeWatcher`. Set when `scan` inserts placeholders
  // so the rule's own insertions don't re-trigger the watcher.
  skipPlaceholderSubtrees?: boolean;
  // Propagated to the Rule. See `Rule.topFrameOnly` for semantics. Default
  // false: the rule runs in every frame the content script reaches.
  topFrameOnly?: boolean;
}

// Tighter than `Rule` — the factory always installs a teardown, so callers
// (notably tests that call `rule.teardown()` directly in `afterEach`) don't
// need to widen with `?.()` or an assertion.
export type ScanRule<Id extends RuleId = RuleId> = Rule & {
  id: Id;
  teardown: () => void;
};

export function createScanRule<Id extends RuleId>(
  options: ScanRuleOptions<Id>,
): ScanRule<Id> {
  const {
    id,
    label,
    description,
    scan,
    skipPlaceholderSubtrees = false,
    topFrameOnly = false,
  } = options;

  const watcher = createSubtreeWatcher({
    skipPlaceholderSubtrees,
    onSubtrees: (roots) => {
      for (const root of roots) {
        scan(root);
      }
    },
  });

  return {
    id,
    label,
    description,
    topFrameOnly,
    apply(root: ParentNode): void {
      scan(root);
      watcher.start(root);
    },
    teardown(): void {
      watcher.stop();
    },
  } satisfies ScanRule<Id>;
}
