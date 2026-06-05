// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Shared MutationObserver lifecycle for rules that need to re-scan lazily
// inserted subtrees. Coalesces a burst of additions into a single throttled
// callback so React-style render bursts don't drive N scans.
//
// Each rule constructs one watcher at module scope and toggles it on/off via
// start() / stop() from its apply / teardown.

import throttle from "lodash/throttle";
import { PLACEHOLDER_CLASS } from "./placeholder";
import { subscribeRouteChange } from "./route-change";

// Tags whose insertion is never interesting to any rule. Filtering at enqueue
// keeps `pending` small during noisy bursts where a framework injects
// stylesheets and linebreaks alongside real content. Kept conservative:
// `SCRIPT` is not here because json-ld-sanitize / schema-trust-sanitize
// observe `<script type="application/ld+json">` additions, and `META`,
// `LINK`, `TITLE`, `NOSCRIPT`, `HEAD` are similarly load-bearing for
// meta-injection-strip / noscript-strip.
const IGNORE_TAGS: ReadonlySet<string> = new Set(["STYLE", "BR"]);

// Above this many pending roots we flush immediately instead of waiting out
// the throttle window. SPA route swaps and `appendChild` storms from
// virtualized lists can dump thousands of nodes per tick; the user-visible
// hide should not wait 250ms just because lodash's timer hasn't fired.
// (Pattern from Ghostery's adblocker DOMMonitor.)
const BURST_FLUSH_THRESHOLD = 512;

interface SubtreeWatcherOptions {
  // Called once per throttle window with all the (still-connected) subtree
  // roots that were added since the previous drain. Batched together so
  // callers can amortize work — e.g., scheduling a single timeout for many
  // newly-injected sections.
  onSubtrees: (roots: Element[]) => void;
  throttleMs?: number;
  // When true, added subtrees that are themselves a placeholder or live
  // inside one are dropped during enqueue. Rules whose own placeholder
  // insertions would otherwise re-trigger them want this on.
  skipPlaceholderSubtrees?: boolean;
}

export interface SubtreeWatcher {
  start(root: ParentNode): void;
  stop(): void;
}

export function createSubtreeWatcher(
  options: SubtreeWatcherOptions,
): SubtreeWatcher {
  const {
    onSubtrees,
    throttleMs = 250,
    skipPlaceholderSubtrees = false,
  } = options;

  let observer: MutationObserver | null = null;
  let throttledScan: ReturnType<typeof throttle> | null = null;
  let observedTarget: Node | null = null;
  let visibilityListener: (() => void) | null = null;
  let unsubscribeRouteChange: (() => void) | null = null;
  let routeSweepHandle: number | null = null;
  const pending = new Set<Element>();

  function drain(): void {
    if (pending.size === 0) {
      return;
    }
    const roots = [...pending].filter((root) => root.isConnected);
    pending.clear();
    if (roots.length > 0) {
      onSubtrees(roots);
    }
  }

  function enqueue(mutations: MutationRecord[]): void {
    for (const mutation of mutations) {
      for (const added of mutation.addedNodes) {
        if (added.nodeType !== Node.ELEMENT_NODE) {
          continue;
        }
        const element = added as Element;
        if (IGNORE_TAGS.has(element.tagName)) {
          continue;
        }
        // React-style reconciliation routinely adds-then-removes a node in
        // the same tick. By the time MutationObserver fires (microtask
        // afterward), the addition record is still there but the node is
        // already detached. drain() filters by isConnected too — checking
        // at enqueue avoids buffering churn in pending during a 5k-node
        // route swap with high in-tick removal rate.
        if (!element.isConnected) {
          continue;
        }
        if (skipPlaceholderSubtrees) {
          if (element.classList.contains(PLACEHOLDER_CLASS)) {
            continue;
          }
          if (element.closest(`.${PLACEHOLDER_CLASS}`)) {
            continue;
          }
        }
        pending.add(element);
      }
    }
    if (pending.size === 0) {
      return;
    }
    if (pending.size >= BURST_FLUSH_THRESHOLD) {
      // Cancel the pending trailing call and drain right now. drain() guards
      // its own empty case, so an in-flight throttle that fires later is a
      // no-op.
      throttledScan?.cancel();
      drain();
      return;
    }
    throttledScan?.();
  }

  function handleRouteChange(): void {
    if (!observer) {
      return;
    }
    // Cancel anything pending — the new route's content will arrive in the
    // next render and we want the user-visible hide to happen against the
    // new tree, not as a tail of the old throttle window. Discard buffered
    // MutationRecords for the same reason: they describe the old route's
    // teardown, which we're about to re-scan past anyway.
    observer.takeRecords();
    throttledScan?.cancel();
    pending.clear();

    // Wait one frame so React/Vue/Svelte can finish committing the new
    // route's DOM, then sweep document.body once. Passing document.body
    // makes rules that scan from their root argument do a full re-scan;
    // selector-hide-rule's onSubtrees already scans from document.body
    // regardless — both shapes end up doing the right thing.
    if (routeSweepHandle !== null) {
      cancelAnimationFrame(routeSweepHandle);
    }
    routeSweepHandle = requestAnimationFrame(() => {
      routeSweepHandle = null;
      if (!observer || document.hidden) {
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!document.body) {
        return;
      }
      onSubtrees([document.body]);
    });
  }

  function handleVisibilityChange(): void {
    if (document.hidden) {
      // Flush whatever's pending so we don't sit on a stale snapshot until
      // the user returns, then stop receiving mutations. Background tabs
      // keep firing observer callbacks; disconnecting is the cheap way to
      // opt out for the duration.
      throttledScan?.flush();
      observer?.disconnect();
    } else if (observer && observedTarget) {
      observer.observe(observedTarget, { childList: true, subtree: true });
    }
  }

  return {
    start(root: ParentNode): void {
      if (observer) {
        return;
      }
      // Trailing-only: a burst of additions inside one window collapses to a
      // single drain at the end of it, instead of one drain at the leading
      // edge plus another at the trailing edge (which is what leading+trailing
      // produced — every burst scanned twice).
      throttledScan = throttle(drain, throttleMs, {
        leading: false,
        trailing: true,
      });
      observer = new MutationObserver(enqueue);
      // rule-engine always passes document.body, but accept Document for
      // robustness and resolve to its body. `Document.body` is typed as
      // non-null, but iframe edge cases at document_idle can leave it
      // missing — guard rather than trust the type.
      const target =
        (root as Node).nodeType === Node.DOCUMENT_NODE
          ? (root as Document).body
          : (root as Node);
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!target) {
        return;
      }
      observedTarget = target;
      if (!document.hidden) {
        observer.observe(target, { childList: true, subtree: true });
      }
      visibilityListener = handleVisibilityChange;
      document.addEventListener("visibilitychange", visibilityListener);
      unsubscribeRouteChange = subscribeRouteChange(handleRouteChange);
    },
    stop(): void {
      observer?.disconnect();
      observer = null;
      throttledScan?.cancel();
      throttledScan = null;
      pending.clear();
      observedTarget = null;
      if (visibilityListener) {
        document.removeEventListener("visibilitychange", visibilityListener);
        visibilityListener = null;
      }
      unsubscribeRouteChange?.();
      unsubscribeRouteChange = null;
      if (routeSweepHandle !== null) {
        cancelAnimationFrame(routeSweepHandle);
        routeSweepHandle = null;
      }
    },
  };
}
