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
  const pending = new Set<Element>();

  function drain(): void {
    if (pending.size === 0) return;
    const roots = Array.from(pending).filter((root) => root.isConnected);
    pending.clear();
    if (roots.length > 0) onSubtrees(roots);
  }

  function enqueue(mutations: MutationRecord[]): void {
    for (const mutation of mutations) {
      for (const added of Array.from(mutation.addedNodes)) {
        if (added.nodeType !== Node.ELEMENT_NODE) continue;
        const element = added as Element;
        if (skipPlaceholderSubtrees) {
          if (element.classList.contains(PLACEHOLDER_CLASS)) continue;
          if (element.closest(`.${PLACEHOLDER_CLASS}`)) continue;
        }
        pending.add(element);
      }
    }
    if (pending.size > 0) throttledScan?.();
  }

  return {
    start(root: ParentNode): void {
      if (observer) return;
      throttledScan = throttle(drain, throttleMs, {
        leading: true,
        trailing: true,
      });
      observer = new MutationObserver(enqueue);
      // rule-engine always passes document.body, but accept Document for
      // robustness and resolve to its body.
      const target =
        (root as Node).nodeType === Node.DOCUMENT_NODE
          ? (root as Document).body
          : (root as Node);
      if (target) {
        observer.observe(target, { childList: true, subtree: true });
      }
    },
    stop(): void {
      observer?.disconnect();
      observer = null;
      throttledScan?.cancel();
      throttledScan = null;
      pending.clear();
    },
  };
}
