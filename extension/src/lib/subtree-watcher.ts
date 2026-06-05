// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Shared MutationObserver lifecycle for rules that need to re-scan lazily
// inserted subtrees. Coalesces a burst of additions into a single throttled
// callback so React-style render bursts don't drive N scans.
//
// Each rule constructs one watcher at module scope and toggles it on/off via
// start() / stop() from its apply / teardown.
//
// All watchers that observe the same root share one MutationObserver, one
// visibilitychange listener, and one route-change subscription via a
// module-level router keyed by the observed node. With 24 rules all watching
// document.body, the browser fires one mutation callback that fans out to 24
// subscribers — instead of 24 separate observers each running the same
// `IGNORE_TAGS` / `isConnected` filtering for every record.

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

// `id` and `class` are the only attributes the selector-token-index
// dispatcher keys on. Limiting the filter at the MO level keeps the
// burst from page JS toggling unrelated attributes (style, data-*,
// aria-*) off the hot path.
const OBSERVED_ATTRIBUTES = ["id", "class"];

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
  // When true, this subscriber also receives elements whose `id` or
  // `class` attribute changed in place — surfaced through the same
  // onSubtrees callback as freshly-added subtrees. The shared router
  // upgrades the MO config when any subscriber asks; other subscribers
  // are unaffected. Use this for token-index-style dispatch where a
  // jQuery-style `addClass` on an existing node would otherwise be
  // silently missed.
  observeAttributes?: boolean;
}

export interface SubtreeWatcher {
  start(root: ParentNode): void;
  stop(): void;
}

interface Subscriber {
  onSubtrees: (roots: Element[]) => void;
  skipPlaceholderSubtrees: boolean;
  observeAttributes: boolean;
  throttledScan: ReturnType<typeof throttle>;
  pending: Set<Element>;
}

interface Router {
  target: Node;
  observer: MutationObserver | null;
  observingAttributes: boolean;
  subscribers: Set<Subscriber>;
  visibilityListener: (() => void) | null;
  unsubscribeRouteChange: (() => void) | null;
  routeSweepHandle: number | null;
}

// One router per observed root. document.body is the common case; the head
// gets its own entry because meta-injection-strip observes it separately.
const routersByTarget = new Map<Node, Router>();

function resolveTarget(root: ParentNode): Node | null {
  // rule-engine always passes document.body, but accept Document for
  // robustness and resolve to its body. `Document.body` is typed as
  // non-null, but iframe edge cases at document_idle can leave it
  // missing — guard rather than trust the type.
  const node = root as Node;
  if (node.nodeType === Node.DOCUMENT_NODE) {
    const body = (root as Document).body;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    return body ?? null;
  }
  return node;
}

function drainSubscriber(subscriber: Subscriber): void {
  if (subscriber.pending.size === 0) {
    return;
  }
  const roots = [...subscriber.pending].filter((root) => root.isConnected);
  subscriber.pending.clear();
  if (roots.length > 0) {
    subscriber.onSubtrees(roots);
  }
}

function enqueueAttributeMutation(
  router: Router,
  mutation: MutationRecord,
): void {
  const target = mutation.target;
  if (target.nodeType !== Node.ELEMENT_NODE) {
    return;
  }
  const element = target as Element;
  if (IGNORE_TAGS.has(element.tagName)) {
    return;
  }
  if (!element.isConnected) {
    return;
  }
  for (const subscriber of router.subscribers) {
    if (!subscriber.observeAttributes) {
      continue;
    }
    if (subscriber.skipPlaceholderSubtrees) {
      if (element.classList.contains(PLACEHOLDER_CLASS)) {
        continue;
      }
      if (element.closest(`.${PLACEHOLDER_CLASS}`)) {
        continue;
      }
    }
    subscriber.pending.add(element);
  }
}

function fanOut(router: Router, mutations: MutationRecord[]): void {
  // Walk every added node once and dispatch into each subscriber's pending
  // set. The shared filters (nodeType, IGNORE_TAGS, isConnected) run once
  // per node regardless of subscriber count — the whole point of the
  // router. Per-subscriber filters (skipPlaceholderSubtrees) still run
  // per (node, subscriber) pair, but they're cheap classlist reads.
  for (const mutation of mutations) {
    if (mutation.type === "attributes") {
      // id/class changed on an existing element. Only subscribers that
      // opted into observeAttributes hear about it — other rules don't
      // benefit from re-scanning the same node just because a class
      // toggled.
      enqueueAttributeMutation(router, mutation);
      continue;
    }
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
      // already detached. drainSubscriber() filters by isConnected too —
      // checking at enqueue avoids buffering churn in pending during a
      // 5k-node route swap with high in-tick removal rate.
      if (!element.isConnected) {
        continue;
      }
      for (const subscriber of router.subscribers) {
        if (subscriber.skipPlaceholderSubtrees) {
          if (element.classList.contains(PLACEHOLDER_CLASS)) {
            continue;
          }
          if (element.closest(`.${PLACEHOLDER_CLASS}`)) {
            continue;
          }
        }
        subscriber.pending.add(element);
      }
    }
  }

  for (const subscriber of router.subscribers) {
    if (subscriber.pending.size === 0) {
      continue;
    }
    if (subscriber.pending.size >= BURST_FLUSH_THRESHOLD) {
      // Cancel the trailing throttle call and drain right now. drainSubscriber()
      // guards its own empty case, so an in-flight throttle that fires later
      // is a no-op.
      subscriber.throttledScan.cancel();
      drainSubscriber(subscriber);
    } else {
      subscriber.throttledScan();
    }
  }
}

function observerInit(router: Router): MutationObserverInit {
  // Attribute observation rides on the same MO. We attach it whenever
  // any current subscriber wants attribute mutations; the per-subscriber
  // gate in fanOut keeps non-opted-in subscribers from seeing them.
  const wantsAttributes = router.observingAttributes;
  return {
    childList: true,
    subtree: true,
    ...(wantsAttributes
      ? { attributes: true, attributeFilter: OBSERVED_ATTRIBUTES }
      : {}),
  };
}

function refreshObservation(router: Router): void {
  if (!router.observer || document.hidden) {
    return;
  }
  // observe() on an already-observed MO replaces the existing options
  // without re-emitting historical records.
  router.observer.observe(router.target, observerInit(router));
}

function handleVisibilityChange(router: Router): void {
  if (document.hidden) {
    // Flush whatever's pending so we don't sit on a stale snapshot until
    // the user returns, then stop receiving mutations. Background tabs
    // keep firing observer callbacks; disconnecting is the cheap way to
    // opt out for the duration.
    for (const subscriber of router.subscribers) {
      subscriber.throttledScan.flush();
    }
    router.observer?.disconnect();
  } else if (router.observer) {
    refreshObservation(router);
  }
}

function handleRouteChange(router: Router): void {
  if (!router.observer) {
    return;
  }
  // Cancel anything pending — the new route's content will arrive in the
  // next render and we want the user-visible hide to happen against the
  // new tree, not as a tail of the old throttle window. Discard buffered
  // MutationRecords for the same reason: they describe the old route's
  // teardown, which we're about to re-scan past anyway.
  router.observer.takeRecords();
  for (const subscriber of router.subscribers) {
    subscriber.throttledScan.cancel();
    subscriber.pending.clear();
  }

  // Wait one frame so React/Vue/Svelte can finish committing the new
  // route's DOM, then sweep document.body once. Passing document.body
  // makes rules that scan from their root argument do a full re-scan;
  // selector-hide-rule's onSubtrees already scans from document.body
  // regardless — both shapes end up doing the right thing.
  if (router.routeSweepHandle !== null) {
    cancelAnimationFrame(router.routeSweepHandle);
  }
  router.routeSweepHandle = requestAnimationFrame(() => {
    router.routeSweepHandle = null;
    if (!router.observer || document.hidden) {
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!document.body) {
      return;
    }
    for (const subscriber of router.subscribers) {
      subscriber.onSubtrees([document.body]);
    }
  });
}

function startRouter(router: Router): void {
  if (router.observer) {
    return;
  }
  const observer = new MutationObserver((mutations) => {
    fanOut(router, mutations);
  });
  router.observer = observer;
  if (!document.hidden) {
    observer.observe(router.target, observerInit(router));
  }
  router.visibilityListener = () => {
    handleVisibilityChange(router);
  };
  document.addEventListener("visibilitychange", router.visibilityListener);
  router.unsubscribeRouteChange = subscribeRouteChange(() => {
    handleRouteChange(router);
  });
}

function stopRouter(router: Router): void {
  router.observer?.disconnect();
  router.observer = null;
  if (router.visibilityListener) {
    document.removeEventListener("visibilitychange", router.visibilityListener);
    router.visibilityListener = null;
  }
  router.unsubscribeRouteChange?.();
  router.unsubscribeRouteChange = null;
  if (router.routeSweepHandle !== null) {
    cancelAnimationFrame(router.routeSweepHandle);
    router.routeSweepHandle = null;
  }
  routersByTarget.delete(router.target);
}

function getOrCreateRouter(target: Node): Router {
  let router = routersByTarget.get(target);
  if (!router) {
    router = {
      target,
      observer: null,
      observingAttributes: false,
      subscribers: new Set(),
      visibilityListener: null,
      unsubscribeRouteChange: null,
      routeSweepHandle: null,
    };
    routersByTarget.set(target, router);
  }
  return router;
}

export function createSubtreeWatcher(
  options: SubtreeWatcherOptions,
): SubtreeWatcher {
  const {
    onSubtrees,
    throttleMs = 250,
    skipPlaceholderSubtrees = false,
    observeAttributes = false,
  } = options;

  let subscriber: Subscriber | null = null;
  let router: Router | null = null;

  return {
    start(root: ParentNode): void {
      if (subscriber) {
        return;
      }
      const target = resolveTarget(root);
      if (!target) {
        return;
      }
      router = getOrCreateRouter(target);
      const ownSubscriber: Subscriber = {
        onSubtrees,
        skipPlaceholderSubtrees,
        observeAttributes,
        pending: new Set(),
        // Trailing-only: a burst of additions inside one window collapses
        // to a single drain at the end of it, instead of one drain at the
        // leading edge plus another at the trailing edge (which is what
        // leading+trailing produced — every burst scanned twice).
        throttledScan: throttle(
          () => {
            drainSubscriber(ownSubscriber);
          },
          throttleMs,
          { leading: false, trailing: true },
        ),
      };
      subscriber = ownSubscriber;
      router.subscribers.add(ownSubscriber);
      const needsAttributeUpgrade =
        observeAttributes && !router.observingAttributes;
      if (needsAttributeUpgrade) {
        router.observingAttributes = true;
      }
      if (router.observer === null) {
        startRouter(router);
      } else if (needsAttributeUpgrade) {
        // Re-observe with the upgraded options. Calling observe() on an
        // already-active MO with the same target merges configurations
        // without re-emitting historical mutations.
        refreshObservation(router);
      }
    },
    stop(): void {
      if (!subscriber || !router) {
        return;
      }
      router.subscribers.delete(subscriber);
      subscriber.throttledScan.cancel();
      subscriber.pending.clear();
      if (router.subscribers.size === 0) {
        stopRouter(router);
      } else if (subscriber.observeAttributes) {
        // Downgrade if this was the last attribute-observing subscriber.
        // We leave the MO connected — only the option set narrows.
        const stillWantsAttributes = [...router.subscribers].some(
          (s) => s.observeAttributes,
        );
        if (!stillWantsAttributes && router.observingAttributes) {
          router.observingAttributes = false;
          refreshObservation(router);
        }
      }
      subscriber = null;
      router = null;
    },
  };
}

// Test-only: tear down every shared router and clear the registry. Tests
// that exercise the route-change / visibility paths can leak router state
// across cases if a watcher's stop() is missed; this restores the module
// to the same shape as a fresh import.
export function __resetSubtreeWatcherForTesting(): void {
  for (const router of routersByTarget.values()) {
    router.observer?.disconnect();
    if (router.visibilityListener) {
      document.removeEventListener(
        "visibilitychange",
        router.visibilityListener,
      );
    }
    router.unsubscribeRouteChange?.();
    if (router.routeSweepHandle !== null) {
      cancelAnimationFrame(router.routeSweepHandle);
    }
    for (const subscriber of router.subscribers) {
      subscriber.throttledScan.cancel();
    }
  }
  routersByTarget.clear();
}
