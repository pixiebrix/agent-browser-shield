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
import { PLACEHOLDER_CLASS, replaceWithBlockPlaceholder } from "./placeholder";
import type { RuleId } from "./storage";
import { createSubtreeWatcher } from "./subtree-watcher";

export interface SiteRule {
  patterns: URLPattern[];
  selectors: string[];
}

interface SelectorHideRuleOptions {
  id: RuleId;
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

export interface SelectorHideRule {
  rule: Rule;
  // Exposed so each rule file can re-export it for tests that assert
  // URL-gated selector composition.
  selectorsFor: (url: string) => string[];
}

export function createSelectorHideRule(
  options: SelectorHideRuleOptions,
): SelectorHideRule {
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

  function selectorsFor(url: string): string[] {
    const selectors = [...alwaysOnSelectors];
    for (const rule of siteRules) {
      if (rule.patterns.some((pattern) => pattern.test(url))) {
        selectors.push(...rule.selectors);
      }
    }
    return selectors;
  }

  function scan(root: ParentNode): void {
    const selectors = selectorsFor(globalThis.location.href);
    if (selectors.length === 0) {
      return;
    }

    let candidates = [
      ...root.querySelectorAll<HTMLElement>(selectors.join(",")),
    ];
    if (candidateFilter) {
      candidates = candidates.filter(candidateFilter);
    }

    for (const element of candidates) {
      if (!element.isConnected) {
        continue;
      }
      if (element.classList.contains(PLACEHOLDER_CLASS)) {
        continue;
      }
      if (element.closest(`.${PLACEHOLDER_CLASS}`)) {
        continue;
      }
      if (element.getAttribute(REVEALED_ATTR) === id) {
        continue;
      }
      if (element.closest(`[${REVEALED_ATTR}="${id}"]`)) {
        continue;
      }
      if (element.getAttribute(HIDDEN_ATTR) === id) {
        continue;
      }
      // Outermost-match only — if a parent is also a candidate, skip this
      // nested one so we don't double-hide.
      if (
        candidates.some((other) => other !== element && other.contains(element))
      ) {
        continue;
      }
      if (removeEntirely) {
        // Don't detach: if the page renders this overlay through a framework
        // that retains DOM references (React's fiber, Vue's vnode), removing
        // the node breaks the next reconciliation pass (insertBefore against
        // a stale sibling throws NotFoundError and unmounts the tree). Hiding
        // in place with !important is visually equivalent and removes the
        // node from the a11y tree, without invalidating those references.
        element.style.setProperty("display", "none", "important");
        element.setAttribute(HIDDEN_ATTR, id);
      } else {
        // hideLabel is guaranteed non-undefined by the constructor check above.
        replaceWithBlockPlaceholder(element, id, hideLabel as string);
      }
    }
  }

  // When the watcher is enabled, rescan from document.body on every batch
  // rather than from the added subtree roots. MutationObserver hands us the
  // newly-inserted element itself, but querySelectorAll on that element does
  // not match the element itself — so a widget whose top-level container is
  // appended directly (e.g., HubSpot's #hubspot-messages-iframe-container)
  // would be missed. Scanning from body is idempotent thanks to the
  // placeholder-skip in `scan`, and the throttle inside the watcher coalesces
  // bursts of mutations into a single pass.
  const watcher = watchSubtrees
    ? createSubtreeWatcher({
        skipPlaceholderSubtrees: true,
        onSubtrees: () => {
          scan(document.body);
        },
      })
    : null;

  function apply(root: ParentNode): void {
    scan(root);
    watcher?.start(root);
  }

  const rule: Rule = watcher
    ? {
        id,
        label,
        description,
        topFrameOnly,
        apply,
        teardown: () => {
          watcher.stop();
        },
      }
    : { id, label, description, topFrameOnly, apply };

  return { rule, selectorsFor };
}
