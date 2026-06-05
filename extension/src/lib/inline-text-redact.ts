// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Factory for rules that scan text nodes and replace matched ranges in
// place with click-to-reveal inline placeholders. Used by `pii-redact`,
// `secrets-redact`, and `encoded-payload-redact`, which previously
// duplicated the same lifecycle scaffolding around a one-line difference
// in `collectMatches`.
//
// Lifecycle the factory owns:
//   - One `ReusableAbortController` whose signal is threaded into every
//     chunked text walk. Route changes call `abortAndReset` to cancel
//     in-flight scans against the old tree; teardown does the same.
//   - One lazy `subscribeRouteChange` registration created on first
//     `apply`. Teardown unsubscribes and clears the slot so a later
//     `apply` re-registers cleanly.
//   - One `createSubtreeWatcher` with `skipPlaceholderSubtrees: true`
//     so the rule's own inserted placeholders don't re-trigger it.
//
// Incremental subtree-watcher batches deliberately do NOT abort on
// route change — they target their own scoped root and don't compete
// with the previous scan.

import { ReusableAbortController } from "abort-utils";
import type { Rule } from "../rules/types";
import type { InlineMatch } from "./placeholder";
import { replaceMatchesInTextNode } from "./placeholder";
import { subscribeRouteChange } from "./route-change";
import type { RuleId } from "./storage";
import { createSubtreeWatcher } from "./subtree-watcher";
import { walkTextNodesChunked } from "./yielding-text-walk";

export interface InlineTextRedactRuleOptions {
  id: RuleId;
  label: string;
  description: string;
  // Skip text nodes shorter than this — cheap per-node early-out before
  // the regex pass runs. Set to the shortest pattern the rule can match.
  minLength: number;
  // Pure function: given a text node's value, return any inline matches
  // (already merged / sorted as the rule wants them applied).
  collectMatches: (text: string) => InlineMatch[];
}

// Tighter than `Rule` — the factory always installs a teardown, so callers
// (notably tests that call `rule.teardown()` directly in `afterEach`) don't
// need to widen with `?.()` or assertion.
export type InlineTextRedactRule = Rule & { teardown: () => void };

export function defineInlineTextRedactRule(
  options: InlineTextRedactRuleOptions,
): InlineTextRedactRule {
  const { id, label, description, minLength, collectMatches } = options;

  const lifecycle = new ReusableAbortController();
  let unsubscribeRouteChange: (() => void) | null = null;

  function scanAndMask(root: ParentNode): void {
    walkTextNodesChunked(root, {
      signal: lifecycle.signal,
      minLength,
      process: (chunk) => {
        for (const node of chunk) {
          const matches = collectMatches(node.nodeValue ?? "");
          if (matches.length > 0) {
            replaceMatchesInTextNode(node, matches, id);
          }
        }
      },
    });
  }

  const watcher = createSubtreeWatcher({
    skipPlaceholderSubtrees: true,
    onSubtrees: (roots) => {
      for (const root of roots) {
        scanAndMask(root);
      }
    },
  });

  return {
    id,
    label,
    description,
    apply(root: ParentNode): void {
      unsubscribeRouteChange ??= subscribeRouteChange(() => {
        lifecycle.abortAndReset();
      });
      scanAndMask(root);
      watcher.start(root);
    },
    teardown(): void {
      watcher.stop();
      lifecycle.abortAndReset();
      unsubscribeRouteChange?.();
      unsubscribeRouteChange = null;
    },
  } satisfies InlineTextRedactRule;
}
