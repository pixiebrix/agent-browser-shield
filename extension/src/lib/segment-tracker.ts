// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Watches the content-script lifecycle for events that should partition
// the dev-mode trace into segments: the initial document_idle apply, SPA
// route changes, modal/dialog openings, and mutation bursts.
//
// All emission goes through `recordSegment` in `debug-trace.ts`, which is
// a no-op when the user hasn't enabled the dev-mode toggle — so the cost
// of running this in production is one MutationObserver subscriber on
// document.body (shared with all other rules through the subtree-watcher
// router) plus one route-change listener. No additional observers when
// the toggle is off.

import throttle from "lodash/throttle";
import { initDebugTrace, recordSegment } from "./debug-trace";
import { describeElement } from "./element-describe";
import { subscribeRouteChange } from "./route-change";
import { createSubtreeWatcher, setBurstFlushObserver } from "./subtree-watcher";

// Selector union for "modal opened" detection. Kept narrow so a tooltip,
// popover, or non-modal dialog (`role=dialog` without `aria-modal=true`)
// doesn't drown the timeline. Modals fronted by web components (closed
// shadow root, custom element) will be missed here — that's acceptable
// since the subtree-watcher fans into shadow trees and would still emit a
// burst marker on the same insertion.
const MODAL_SELECTOR =
  '[role="dialog"][aria-modal="true"], [role="alertdialog"]';

const MODAL_THROTTLE_MS = 1000;
const BURST_THROTTLE_MS = 500;

let installed = false;
let modalWatcher: ReturnType<typeof createSubtreeWatcher> | null = null;
let unsubscribeRouteChange: (() => void) | null = null;

function describeModal(element: Element): string {
  const role = element.getAttribute("role") ?? "";
  return describeElement(element, `[role="${role}"]`);
}

export function startSegmentTracker(): void {
  if (installed) {
    return;
  }
  installed = true;

  // Defer the initial-load marker until the persisted toggle has been
  // loaded from storage — emitting synchronously would race the storage
  // read and drop the marker. Route-change / modal / burst emissions
  // happen later in the page lifetime and always see the resolved value,
  // so they install synchronously below.
  void initDebugTrace().then(() => {
    recordSegment("initial-load", { url: location.href });
  });

  unsubscribeRouteChange = subscribeRouteChange(() => {
    recordSegment("route-change", { to: location.href });
  });

  // Throttle modal detection — a framework that re-renders the dialog
  // shouldn't ping the timeline multiple times for the same open. The
  // throttle is shared across all modals to avoid double-fire when a
  // dialog re-renders into a sibling within the same window.
  const emitModal = throttle(
    (selector: string) => {
      recordSegment("modal-open", { selector });
    },
    MODAL_THROTTLE_MS,
    { leading: true, trailing: false },
  );

  modalWatcher = createSubtreeWatcher({
    onSubtrees: (roots) => {
      for (const root of roots) {
        // Check the root itself and any descendants. Modals are usually
        // inserted as the root of a portal subtree, but framework
        // wrappers can push them one level deeper.
        if (root.matches(MODAL_SELECTOR)) {
          emitModal(describeModal(root));
          continue;
        }
        const inner = root.querySelector(MODAL_SELECTOR);
        if (inner) {
          emitModal(describeModal(inner));
        }
      }
    },
  });
  modalWatcher.start(document.body);

  const emitBurst = throttle(
    (pendingCount: number) => {
      recordSegment("mutation-burst", { pendingCount });
    },
    BURST_THROTTLE_MS,
    { leading: true, trailing: false },
  );
  setBurstFlushObserver(emitBurst);
}

// Test-only: tear down listeners between cases so module state doesn't
// leak across describe blocks. Mirrors the same hook in route-change.ts /
// subtree-watcher.ts.
export function __resetSegmentTrackerForTesting(): void {
  if (installed) {
    modalWatcher?.stop();
    modalWatcher = null;
    unsubscribeRouteChange?.();
    unsubscribeRouteChange = null;
    setBurstFlushObserver(null);
  }
  installed = false;
}
