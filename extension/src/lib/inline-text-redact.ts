// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Factory for rules that scan text nodes and replace matched ranges in
// place with click-to-reveal inline placeholders. Used by `pii-redact`,
// `secrets-redact`, and `encoded-payload-redact`, which previously
// duplicated the same lifecycle scaffolding around a one-line difference
// in `collectMatches`.
//
// The walk groups text nodes by inline-formatting context (see
// `collectTextNodesWithInlineGroups`) so `collectMatches` sees the
// concatenation of sibling text nodes within one inline run — a card
// number rendered as `<span>4111</span> <span>1111</span> ...` is
// detected, while digits split across a `<br>` or block boundary are
// not.
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
import type { TextNodeWithInlineGroup } from "./dom-utils";
import type { InlineMatch, MultiNodeMatch } from "./placeholder";
import {
  replaceMatchesAcrossTextNodes,
  replaceMatchesInTextNode,
} from "./placeholder";
import { subscribeRouteChange } from "./route-change";
import type { RuleId } from "./storage";
import { createSubtreeWatcher } from "./subtree-watcher";
import { walkTextNodeGroupsChunked } from "./yielding-text-walk";

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
    // Per-node `minLength` is intentionally NOT passed to the walker —
    // it would drop legitimate cross-node matches whose individual text
    // nodes sit below the floor (the card-in-spans bypass we're fixing
    // is exactly this shape: each `<span>` carries a 4-digit fragment,
    // well below pii-redact's MIN_TEXT_LENGTH=9). The per-group floor
    // applies in `processBucket` against the concatenated length, which
    // preserves the per-rule cheap early-out for prose nodes.
    walkTextNodeGroupsChunked(root, {
      signal: lifecycle.signal,
      process: (chunk) => {
        for (const bucket of bucketByGroup(chunk)) {
          processBucket(bucket, id, collectMatches, minLength);
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

// Bucket a chunk of group-tagged text nodes into runs of consecutive
// entries that share a group id. Chunk-internal grouping only —
// cross-chunk groups (rare: >100 text nodes in one inline-formatting
// context, e.g. a single huge `<p>` with span-per-word rendering) are
// processed as two separate buckets. Accepted miss: matches that span
// the chunk boundary go undetected. The 100-node default cushion makes
// this vanishingly rare in practice.
function bucketByGroup(
  chunk: readonly TextNodeWithInlineGroup[],
): TextNodeWithInlineGroup[][] {
  const buckets: TextNodeWithInlineGroup[][] = [];
  let current: TextNodeWithInlineGroup[] = [];
  let currentGroup: number | null = null;
  for (const entry of chunk) {
    if (currentGroup === null || entry.group !== currentGroup) {
      if (current.length > 0) {
        buckets.push(current);
      }
      current = [entry];
      currentGroup = entry.group;
    } else {
      current.push(entry);
    }
  }
  if (current.length > 0) {
    buckets.push(current);
  }
  return buckets;
}

interface BucketLayout {
  // Sibling text nodes whose nodeValues concatenate to form `concatenated`.
  nodes: Text[];
  // `lengths[i] = nodes[i].nodeValue.length`. Parallel to `nodes`.
  lengths: number[];
  // `offsets[i] = sum(lengths[0..i-1])`. Parallel to `nodes`.
  offsets: number[];
  // Joined value of every node, in document order.
  concatenated: string;
}

function buildBucketLayout(bucket: TextNodeWithInlineGroup[]): BucketLayout {
  const nodes: Text[] = [];
  const lengths: number[] = [];
  const offsets: number[] = [];
  let total = 0;
  const parts: string[] = [];
  for (const entry of bucket) {
    const value = entry.node.nodeValue ?? "";
    nodes.push(entry.node);
    lengths.push(value.length);
    offsets.push(total);
    parts.push(value);
    total += value.length;
  }
  return { nodes, lengths, offsets, concatenated: parts.join("") };
}

// Run `collectMatches` over a single inline-group bucket and materialize
// each match. Single-node buckets fall through `replaceMatchesInTextNode`
// (bit-identical to the pre-grouping behavior). Multi-node buckets
// concatenate values, run `collectMatches` on the concatenation, then
// hand the full match set to `replaceMatchesAcrossTextNodes` which
// applies all mutations atomically per affected node.
//
// All-at-once application is load-bearing: applying matches sequentially
// would let each match invalidate the layout offsets the next match
// depends on (a single-node match replaces its text node, detaching it
// from the DOM and silently dropping any later match into the same node;
// a cross-node match truncates a boundary node's value, shifting offsets
// for any later match in that node). The plural helper plans every
// affected node's new content from a single snapshot of the originals,
// so each text node is mutated exactly once.
function processBucket(
  bucket: TextNodeWithInlineGroup[],
  ruleId: RuleId,
  collectMatches: (text: string) => InlineMatch[],
  minLength: number,
): void {
  const [firstEntry] = bucket;
  if (!firstEntry) {
    return;
  }
  if (bucket.length === 1) {
    const node = firstEntry.node;
    const value = node.nodeValue ?? "";
    if (value.length < minLength) {
      return;
    }
    const matches = collectMatches(value);
    if (matches.length > 0) {
      replaceMatchesInTextNode(node, matches, ruleId);
    }
    return;
  }

  const layout = buildBucketLayout(bucket);
  if (layout.concatenated.length < minLength) {
    return;
  }
  const matches = collectMatches(layout.concatenated);
  if (matches.length === 0) {
    return;
  }

  const multiMatches: MultiNodeMatch[] = [];
  for (const match of matches) {
    const start = locateStart(layout, match.start);
    const end = locateEnd(layout, match.end);
    multiMatches.push({
      startIndex: start.index,
      startOffset: start.offset,
      endIndex: end.index,
      endOffset: end.offset,
      label: match.label,
    });
  }
  replaceMatchesAcrossTextNodes(layout.nodes, multiMatches, ruleId);
}

// Translate a concatenated-string offset to (node index, local offset).
// `start` semantics: at an exact node boundary, prefer the right node
// (offset=0) so the placeholder lands inside the wrapper that holds the
// matched content rather than at the trailing edge of a non-matching
// sibling.
function locateStart(
  layout: BucketLayout,
  position: number,
): { index: number; offset: number } {
  for (const [i, length] of layout.lengths.entries()) {
    const offset = layout.offsets[i] ?? 0;
    if (position < offset + length) {
      return { index: i, offset: position - offset };
    }
  }
  const lastIndex = layout.lengths.length - 1;
  return { index: lastIndex, offset: layout.lengths[lastIndex] ?? 0 };
}

// `end` semantics: at an exact node boundary, prefer the left node
// (offset=length). Otherwise the cross-node helper would be asked to
// truncate a node from offset 0 to 0 — a no-op that leaves the trailing
// node's text fully intact and pushes the placeholder past content the
// match was supposed to consume.
function locateEnd(
  layout: BucketLayout,
  position: number,
): { index: number; offset: number } {
  for (let i = layout.offsets.length - 1; i >= 0; i--) {
    const offset = layout.offsets[i] ?? 0;
    if (offset < position) {
      return { index: i, offset: position - offset };
    }
  }
  return { index: 0, offset: 0 };
}
