// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Per-frame tally of hidden/masked elements, reported to the background so it
// can render the total as a toolbar badge. Counts both placeholders that ship
// with a reveal control and elements hidden in-place via display:none.
//
// Two count sources:
//
// 1. JS-path hides — elements stamped with HIDDEN_ATTR or wrapped in a
//    PLACEHOLDER_CLASS element by selector-hide-rule. Found via one
//    querySelectorAll on the union selector below.
// 2. CSS-first hides — rules that hide via an injected stylesheet
//    (chat-widget-hide, etc.) call registerCssFirstSelectors with their
//    selector union. We QSA each registered union and add the count. No
//    HIDDEN_ATTR is stamped on those elements (the stylesheet does the
//    hiding), so they wouldn't be picked up by source #1.
//
// We watch document.body with a single MutationObserver and recount on each
// throttled batch. Recounting via querySelectorAll is cheap relative to the
// work the rules themselves do, and avoids us having to instrument every
// placeholder construction/destruction site individually.

import throttle from "lodash/throttle";
import { HIDDEN_ATTR } from "./dom-markers";
import { PLACEHOLDER_CLASS } from "./placeholder";

const COUNT_SELECTOR = `.${PLACEHOLDER_CLASS}, [${HIDDEN_ATTR}]`;
const REPORT_THROTTLE_MS = 250;

export interface PlaceholderCountMessage {
  type: "placeholder-count";
  count: number;
}

const cssFirstUnions = new Set<string>();
let recountTrigger: (() => void) | null = null;

function noop(): void {
  // Returned from registerCssFirstSelectors when the caller passed an
  // empty union — nothing to unregister.
}

// Register a CSS-first selector union with the counter. Returns an
// unregister fn. Safe to call before startPlaceholderCountReporter runs
// (the union is recorded and picked up by the first count).
export function registerCssFirstSelectors(union: string): () => void {
  if (union.length === 0) {
    return noop;
  }
  cssFirstUnions.add(union);
  recountTrigger?.();
  return () => {
    cssFirstUnions.delete(union);
    recountTrigger?.();
  };
}

function currentCount(): number {
  let count = document.body.querySelectorAll(COUNT_SELECTOR).length;
  for (const union of cssFirstUnions) {
    count += document.body.querySelectorAll(union).length;
  }
  return count;
}

function send(count: number): void {
  const message: PlaceholderCountMessage = {
    type: "placeholder-count",
    count,
  };
  // Service worker may be asleep / receiver not yet ready — swallow the
  // resulting "Receiving end does not exist" rejection so it doesn't surface
  // as an unhandled promise warning on every page load.
  chrome.runtime.sendMessage(message).catch(() => {
    // noop
  });
}

export function startPlaceholderCountReporter(): void {
  let lastReported = -1;
  const reportIfChanged = () => {
    const count = currentCount();
    if (count === lastReported) {
      return;
    }
    lastReported = count;
    send(count);
  };

  const throttled = throttle(reportIfChanged, REPORT_THROTTLE_MS, {
    leading: true,
    trailing: true,
  });

  // Allow registerCssFirstSelectors callers to trigger a recount when a
  // rule applies/tears down after startup — otherwise we'd wait for the
  // next DOM mutation, which never comes on a static page.
  recountTrigger = throttled;

  // Initial report — fires whether or not any rule has run yet, so the badge
  // clears on pages with no matches.
  reportIfChanged();

  const observer = new MutationObserver(() => {
    throttled();
  });

  // Content script runs at `document_idle`, so `document.body` is always
  // present here.
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [HIDDEN_ATTR],
  });

  // Flush a final zero on unload so the background can decrement this frame's
  // contribution before the new document's content script registers itself.
  window.addEventListener("pagehide", () => {
    throttled.cancel();
    send(0);
  });
}
