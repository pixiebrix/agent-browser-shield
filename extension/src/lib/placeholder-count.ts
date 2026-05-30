// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Per-frame tally of hidden/masked elements, reported to the background so it
// can render the total as a toolbar badge. Counts both placeholders that ship
// with a reveal control and elements hidden in-place via display:none.
//
// We watch document.body with a single MutationObserver and recount on each
// throttled batch. Recounting via querySelectorAll is cheap relative to the
// work the rules themselves do, and avoids us having to instrument every
// placeholder construction/destruction site individually.

import throttle from "lodash/throttle";
import { HIDDEN_ATTR, PLACEHOLDER_CLASS } from "./placeholder";

const COUNT_SELECTOR = `.${PLACEHOLDER_CLASS}, [${HIDDEN_ATTR}]`;
const REPORT_THROTTLE_MS = 250;

export interface PlaceholderCountMessage {
  type: "placeholder-count";
  count: number;
}

function currentCount(): number {
  if (!document.body) return 0;
  return document.body.querySelectorAll(COUNT_SELECTOR).length;
}

function send(count: number): void {
  const message: PlaceholderCountMessage = {
    type: "placeholder-count",
    count,
  };
  // Service worker may be asleep / receiver not yet ready — swallow the
  // resulting "Receiving end does not exist" rejection so it doesn't surface
  // as an unhandled promise warning on every page load.
  chrome.runtime.sendMessage(message).catch(() => {});
}

export function startPlaceholderCountReporter(): void {
  let lastReported = -1;
  const reportIfChanged = () => {
    const count = currentCount();
    if (count === lastReported) return;
    lastReported = count;
    send(count);
  };

  const throttled = throttle(reportIfChanged, REPORT_THROTTLE_MS, {
    leading: true,
    trailing: true,
  });

  // Initial report — fires whether or not any rule has run yet, so the badge
  // clears on pages with no matches.
  reportIfChanged();

  const observer = new MutationObserver(() => {
    throttled();
  });

  const startObserving = () => {
    if (!document.body) return;
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [HIDDEN_ATTR],
    });
  };

  if (document.body) {
    startObserving();
  } else {
    document.addEventListener("DOMContentLoaded", startObserving, {
      once: true,
    });
  }

  // Flush a final zero on unload so the background can decrement this frame's
  // contribution before the new document's content script registers itself.
  window.addEventListener("pagehide", () => {
    throttled.cancel();
    send(0);
  });
}
