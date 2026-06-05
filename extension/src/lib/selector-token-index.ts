// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Reverse index from id / class tokens to the rules that contain a
// selector keyed on them. Lets the subtree dispatcher run constant-time
// per-added-node lookup instead of full-document querySelectorAll for
// every rule.
//
// Each selector is parsed into a "primary token" if it reduces to a
// trivial `#id` or `.class` form. Selectors with combinators, compounds,
// attribute filters, or pseudos fall into the complex-fallback bucket —
// every added subtree triggers them, but they're a minority of the
// rule set (footers via `[role="contentinfo"]`, generic role markers).
//
// uBO, Brave Shields, and Ghostery's adblocker all converge on this
// pattern independently: on token-dense scroll feeds it's how cosmetic
// filter engines avoid quadratic dispatch.

import type { RuleId } from "./storage";
import type { SubtreeWatcher } from "./subtree-watcher";
import { createSubtreeWatcher } from "./subtree-watcher";

export type SelectorKind = "id" | "class" | "complex";

export interface ParsedSelector {
  kind: SelectorKind;
  // Token value when kind is "id" or "class"; empty when kind is "complex".
  token: string;
}

// Strict shape: bare `#ident` or `.ident` only. Anything with whitespace,
// attribute brackets, combinators, pseudo-classes, multiple compound
// segments, or tag prefixes is complex.
const ID_SELECTOR = /^#([\w-]+)$/;
const CLASS_SELECTOR = /^\.([\w-]+)$/;

export function parseSelector(selector: string): ParsedSelector {
  const trimmed = selector.trim();
  const idMatch = ID_SELECTOR.exec(trimmed);
  if (idMatch) {
    return { kind: "id", token: idMatch[1] as string };
  }
  const classMatch = CLASS_SELECTOR.exec(trimmed);
  if (classMatch) {
    return { kind: "class", token: classMatch[1] as string };
  }
  return { kind: "complex", token: "" };
}

interface Registration {
  ruleId: RuleId;
  dispatchScan: (root: Element) => void;
}

const idIndex = new Map<string, Set<RuleId>>();
const classIndex = new Map<string, Set<RuleId>>();
const complexFallback = new Set<RuleId>();
const registrations = new Map<RuleId, Registration>();

let sharedWatcher: SubtreeWatcher | null = null;

function addToBucket(
  map: Map<string, Set<RuleId>>,
  key: string,
  ruleId: RuleId,
): void {
  let bucket = map.get(key);
  if (!bucket) {
    bucket = new Set();
    map.set(key, bucket);
  }
  bucket.add(ruleId);
}

function removeFromBucket(map: Map<string, Set<RuleId>>, ruleId: RuleId): void {
  for (const [key, bucket] of map) {
    if (bucket.delete(ruleId) && bucket.size === 0) {
      map.delete(key);
    }
  }
}

function collectTokens(element: Element, into: Set<RuleId>): void {
  if (element.id !== "" && idIndex.size > 0) {
    const bucket = idIndex.get(element.id);
    if (bucket) {
      for (const ruleId of bucket) {
        into.add(ruleId);
      }
    }
  }
  if (classIndex.size > 0 && element.classList.length > 0) {
    for (const cls of element.classList) {
      const bucket = classIndex.get(cls);
      if (bucket) {
        for (const ruleId of bucket) {
          into.add(ruleId);
        }
      }
    }
  }
}

// Walk root + its descendants, collecting rule IDs whose tokens (id or
// class) appear on any element in the subtree. Always includes
// complexFallback — attribute/combinator/pseudo selectors can't be
// filtered with the token index, so they have to run against every
// added subtree.
export function findTriggeredRules(root: Element): Set<RuleId> {
  const triggered = new Set<RuleId>(complexFallback);
  // Walking the added subtree's elements once (rather than N times)
  // amortizes the token check across every registered rule — the win the
  // index is named for.
  collectTokens(root, triggered);
  if (idIndex.size > 0 || classIndex.size > 0) {
    const descendants = root.querySelectorAll("*");
    for (const descendant of descendants) {
      collectTokens(descendant, triggered);
    }
  }
  return triggered;
}

// Walk added roots, look up triggered rule IDs via the token index,
// and fan out scan calls. Each rule's dispatchScan receives the added
// subtree root — not document.body — so the rule's own querySelectorAll
// runs against just the new subtree.
//
// One special case: when the router signals a full-body sweep (route
// change, see subtree-watcher.handleRouteChange), the root is the body
// itself. Walking every body descendant just to compute the triggered
// set defeats the purpose, so we shortcut to "every registered rule."
function dispatchToRules(roots: Element[]): void {
  for (const root of roots) {
    const triggered =
      root === document.body
        ? new Set(registrations.keys())
        : findTriggeredRules(root);
    for (const ruleId of triggered) {
      const registration = registrations.get(ruleId);

      if (!registration) {
        continue;
      }
      registration.dispatchScan(root);
    }
  }
}

function ensureWatcherStarted(): void {
  if (sharedWatcher) {
    return;
  }
  sharedWatcher = createSubtreeWatcher({
    skipPlaceholderSubtrees: true,
    // Catch jQuery-style `element.id = 'foo'` / `classList.add('foo')`
    // on already-inserted nodes — without this, the token dispatcher
    // would silently miss any rule whose match was attached to a
    // post-insert attribute change.
    observeAttributes: true,
    onSubtrees: dispatchToRules,
  });
  sharedWatcher.start(document.body);
}

function maybeStopWatcher(): void {
  if (registrations.size === 0 && sharedWatcher) {
    sharedWatcher.stop();
    sharedWatcher = null;
  }
}

export interface RegisterOptions {
  ruleId: RuleId;
  // Full selector list — the union of `alwaysOnSelectors` and every
  // siteRule's `selectors`. Indexed once at registration; URL-gating is
  // handled inside the rule's scan, not at dispatch time. Over-triggering
  // for off-URL siteRule tokens is OK: the rule's scan will refresh its
  // memo, find no matches against the current URL's effective selectors,
  // and bail.
  selectors: readonly string[];
  // Invoked when the dispatcher decides this rule may match an added
  // subtree root. The rule's own scan handles candidateFilter,
  // outermost-match, placeholder skips, and URL gating.
  dispatchScan: (root: Element) => void;
}

export function registerRule(options: RegisterOptions): () => void {
  const { ruleId, selectors, dispatchScan } = options;
  // Duplicate registration shouldn't happen at module load (each rule
  // is built once), but tests may re-construct rules. Drop the older
  // entry first to keep the index consistent.
  if (registrations.has(ruleId)) {
    unregisterRule(ruleId);
  }

  let hasIdOrClass = false;
  let hasComplex = false;
  for (const selector of selectors) {
    const parsed = parseSelector(selector);
    if (parsed.kind === "id") {
      addToBucket(idIndex, parsed.token, ruleId);
      hasIdOrClass = true;
    } else if (parsed.kind === "class") {
      addToBucket(classIndex, parsed.token, ruleId);
      hasIdOrClass = true;
    } else {
      hasComplex = true;
    }
  }
  // A rule with no selectors at all (empty alwaysOn, no siteRules)
  // still goes into the fallback bucket so a future call site that
  // toggles selectors on at runtime doesn't get silently dropped.
  if (hasComplex || !hasIdOrClass) {
    complexFallback.add(ruleId);
  }

  registrations.set(ruleId, { ruleId, dispatchScan });
  ensureWatcherStarted();

  return () => {
    unregisterRule(ruleId);
  };
}

function unregisterRule(ruleId: RuleId): void {
  registrations.delete(ruleId);
  complexFallback.delete(ruleId);
  removeFromBucket(idIndex, ruleId);
  removeFromBucket(classIndex, ruleId);
  maybeStopWatcher();
}

// Test-only: clear all registrations and stop the shared watcher. Tests
// build per-rule fixtures and would otherwise see indexes leak across
// cases.
export function __resetSelectorTokenIndexForTesting(): void {
  idIndex.clear();
  classIndex.clear();
  complexFallback.clear();
  registrations.clear();
  if (sharedWatcher) {
    sharedWatcher.stop();
    sharedWatcher = null;
  }
}

// Test-only: introspect index contents. Lets unit tests assert that
// registration produced the right bucket shape without needing to
// trigger a full dispatch round-trip.
export interface IndexSnapshot {
  idIndex: ReadonlyMap<string, ReadonlySet<RuleId>>;
  classIndex: ReadonlyMap<string, ReadonlySet<RuleId>>;
  complexFallback: ReadonlySet<RuleId>;
}

export function __getIndexSnapshotForTesting(): IndexSnapshot {
  return {
    idIndex: new Map([...idIndex].map(([key, value]) => [key, new Set(value)])),
    classIndex: new Map(
      [...classIndex].map(([key, value]) => [key, new Set(value)]),
    ),
    complexFallback: new Set(complexFallback),
  };
}
