// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Factory for the common "find elements matching a list of selectors and
// replace each outermost match with a block placeholder" rule shape used by
// reviews-redact, comments-redact, and footer-redact.
//
// Each callsite defines:
//   - selectors that ship on every page (semantic markers, conventional
//     ids/classes)
//   - optional site-specific selectors gated by URLPattern hostname/pathname
//   - an optional candidateFilter for post-querySelectorAll narrowing
//     (footer-redact uses this to drop per-section <footer>s nested inside
//     <article>/<aside>/<nav>)

import type { URLPattern } from "urlpattern-polyfill";
import type { Rule } from "../rules/types";
import { HIDDEN_ATTR, REVEALED_ATTR } from "./dom-markers";
import { filterToOutermost } from "./dom-utils";
import { PLACEHOLDER_CLASS, replaceWithBlockPlaceholder } from "./placeholder";
import { registerRule as registerWithTokenIndex } from "./selector-token-index";
import type { RuleId } from "./storage";
import { traceMutation } from "./trace-mutation";

export interface SiteRule {
  patterns: URLPattern[];
  selectors: string[];
}

interface SelectorHideRuleOptions<Id extends RuleId = RuleId> {
  // Generic over the literal id so `rule.id` keeps its narrow `RuleId` literal
  // (inferred from the call site) instead of widening to `RuleId` — the rule
  // catalog's compile-time agreement check in `rules/index.ts` depends on it.
  id: Id;
  label: string;
  description: string;
  // Text shown on the placeholder's reveal button. Required unless
  // `removeEntirely` is true.
  hideLabel?: string;
  alwaysOnSelectors: string[];
  siteRules?: readonly SiteRule[];
  // Applied after querySelectorAll, before the outermost-match filter.
  candidateFilter?: (element: HTMLElement) => boolean;
  // When true, set up a throttled MutationObserver to re-scan the document
  // for matches injected after the initial apply. Required for rules that
  // target widgets loaded async after document_idle (chat widgets, cookie
  // banners, newsletter modals).
  watchSubtrees?: boolean;
  // When true, remove matching elements entirely instead of replacing them
  // with a placeholder. Use for floating overlays (cookie banners, chat
  // widgets, newsletter modals) that have no natural in-flow position —
  // a placeholder there would just be dead space.
  removeEntirely?: boolean;
  // Propagated to the Rule. See `Rule.topFrameOnly` for semantics. Default
  // is false: the rule runs in every frame the content script reaches.
  topFrameOnly?: boolean;
}

export interface SelectorHideRule<Id extends RuleId = RuleId> {
  rule: Rule & { id: Id };
  // Exposed so each rule file can re-export it for tests that assert
  // URL-gated selector composition.
  selectorsFor: (url: string) => string[];
}

export function createSelectorHideRule<Id extends RuleId>(
  options: SelectorHideRuleOptions<Id>,
): SelectorHideRule<Id> {
  const {
    id,
    label,
    description,
    hideLabel,
    alwaysOnSelectors,
    siteRules = [],
    candidateFilter,
    watchSubtrees = false,
    removeEntirely = false,
    topFrameOnly = false,
  } = options;

  if (!removeEntirely && hideLabel === undefined) {
    throw new Error(
      `createSelectorHideRule("${id}"): hideLabel is required unless removeEntirely is true`,
    );
  }

  // Single-entry memo keyed by URL. selectorsFor is hot — scan() calls it on
  // every drain, and the URLPattern.test cost scales with siteRules.length.
  // Invalidates on SPA route change because globalThis.location.href changes
  // — no manual cache-bust needed.
  let memoUrl: string | null = null;
  let memoSelectors: readonly string[] = [];
  let memoJoined = "";

  // Per-rule cache of elements this scan has already concluded a skip
  // (or hide) for. Bypasses the 5 marker reads (PLACEHOLDER_CLASS check,
  // 2 closest() walks, 2 getAttribute calls) on subsequent scans where
  // the same element keeps surfacing — typical on infinite-scroll feeds
  // and SPA route sweeps where the dispatcher's QSA re-finds every
  // already-processed candidate.
  //
  // Markers stay in the DOM so other rules and reveal-click handlers
  // can read them; the WeakSet is purely a hot-loop perf bypass for
  // this rule's own re-scans. Membership is only added when the skip
  // reason is the element's *own* state (its own classList /
  // attribute marker) — ancestor-relative checks (`closest(.placeholder)`
  // / `closest([REVEALED_ATTR=id])`) intentionally do NOT add to the
  // set, because the element could later move out from under the
  // matched ancestor.
  const processed = new WeakSet<HTMLElement>();

  function refreshMemo(url: string): void {
    if (url === memoUrl) {
      return;
    }
    const selectors = [...alwaysOnSelectors];
    for (const rule of siteRules) {
      if (rule.patterns.some((pattern) => pattern.test(url))) {
        selectors.push(...rule.selectors);
      }
    }
    memoUrl = url;
    memoSelectors = selectors;
    memoJoined = selectors.join(",");
  }

  function selectorsFor(url: string): string[] {
    refreshMemo(url);
    // Defensive copy — public function, callers shouldn't share the memo.
    return [...memoSelectors];
  }

  function scan(root: ParentNode): void {
    refreshMemo(globalThis.location.href);
    if (memoJoined.length === 0) {
      return;
    }

    // Include `root` itself when it's an Element that matches — the
    // shared dispatcher now hands us inserted subtree roots directly,
    // and querySelectorAll only matches descendants. Without this,
    // top-level container insertions (HubSpot's
    // #hubspot-messages-iframe-container, OneTrust's
    // #onetrust-banner-sdk) would slip through every batch where
    // they're the added root.
    let candidates: HTMLElement[] = [];
    if (
      root.nodeType === Node.ELEMENT_NODE &&
      (root as Element).matches(memoJoined)
    ) {
      candidates.push(root as HTMLElement);
    }
    candidates.push(...root.querySelectorAll<HTMLElement>(memoJoined));
    if (candidateFilter) {
      candidates = candidates.filter(candidateFilter);
    }

    // Outermost-match dedupe via the shared helper. Pre-filtering up front
    // (instead of an inline ancestor check inside the loop) keeps the loop
    // body focused on the placeholder/marker skips, and means only one
    // implementation of "outermost" exists across the codebase.
    const outermost = new Set<HTMLElement>(filterToOutermost(candidates));

    for (const element of candidates) {
      if (!outermost.has(element)) {
        continue;
      }
      if (!element.isConnected) {
        continue;
      }
      // Fast path: a previous scan already concluded this element should
      // be skipped (or hid it). Saves the 5 marker reads below.
      if (processed.has(element)) {
        continue;
      }
      if (element.classList.contains(PLACEHOLDER_CLASS)) {
        processed.add(element);
        continue;
      }
      if (element.closest(`.${PLACEHOLDER_CLASS}`)) {
        // Ancestor-relative — don't memoize. If the placeholder is
        // later revealed (its click handler swaps the placeholder back
        // out), this element's "inside a placeholder" status flips and
        // we want the next scan to re-evaluate.
        continue;
      }
      if (element.getAttribute(REVEALED_ATTR) === id) {
        processed.add(element);
        continue;
      }
      if (element.closest(`[${REVEALED_ATTR}="${id}"]`)) {
        // Same reason as above: ancestor-relative, don't memoize.
        continue;
      }
      if (element.getAttribute(HIDDEN_ATTR) === id) {
        processed.add(element);
        continue;
      }
      if (removeEntirely) {
        // Don't detach: if the page renders this overlay through a framework
        // that retains DOM references (React's fiber, Vue's vnode), removing
        // the node breaks the next reconciliation pass (insertBefore against
        // a stale sibling throws NotFoundError and unmounts the tree). Hiding
        // in place with !important is visually equivalent and removes the
        // node from the a11y tree, without invalidating those references.
        traceMutation(
          {
            ruleId: id,
            kind: "hide",
            target: element,
            selector: memoJoined,
          },
          () => {
            element.style.setProperty("display", "none", "important");
            element.setAttribute(HIDDEN_ATTR, id);
          },
        );
      } else {
        // hideLabel is guaranteed non-undefined by the constructor check above.
        replaceWithBlockPlaceholder(element, id, hideLabel as string);
      }
      processed.add(element);
    }
  }

  // Build the union selector list passed to the token index. Indexing
  // siteRule selectors alongside alwaysOn means rules see no surprise
  // misses when a URL-gated id/class appears on the current page —
  // even though the rule's effective `memoJoined` for that URL may
  // include only a subset. Over-trigger cost is bounded: the dispatch
  // costs one no-op scan call against the added root, not a full-doc
  // QSA against all selectors.
  const allSelectors: string[] = [...alwaysOnSelectors];
  for (const siteRule of siteRules) {
    allSelectors.push(...siteRule.selectors);
  }

  let unregisterFromTokenIndex: (() => void) | null = null;

  function apply(root: ParentNode): void {
    scan(root);
    if (watchSubtrees && !unregisterFromTokenIndex) {
      // Lazy-register on first apply so module-load doesn't touch the
      // document body before the rule engine asks for it. The shared
      // dispatcher owns the watcher and fans out per added subtree
      // root — this rule's dispatchScan only fires when the token
      // index says one of `id` / `class` tokens appeared, or when the
      // rule landed in complex-fallback.
      unregisterFromTokenIndex = registerWithTokenIndex({
        ruleId: id,
        selectors: allSelectors,
        dispatchScan: scan,
      });
    }
  }

  const rule: Rule & { id: Id } = watchSubtrees
    ? {
        id,
        label,
        description,
        topFrameOnly,
        apply,
        teardown: () => {
          unregisterFromTokenIndex?.();
          unregisterFromTokenIndex = null;
        },
      }
    : { id, label, description, topFrameOnly, apply };

  return { rule, selectorsFor };
}
