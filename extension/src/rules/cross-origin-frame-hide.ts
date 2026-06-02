// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Remove cross-origin <iframe> elements and replace them with a click-to-reveal
// placeholder so a browser-use agent reading the parent page never ingests the
// embedded-origin content unless the user explicitly opts in.
//
// Motivation: Roesner & Kohlbrenner ("Agentic Browsers and the Same-Origin
// Policy", ICLR 2026 Workshop) show that an agent willing to read content from
// an embedded cross-origin frame turns a successful prompt injection into a
// same-origin-policy bypass — exfiltrating cross-origin data, forging
// cross-origin actions, etc. Removing the iframe entirely is a stronger
// defense than provenance markers: the agent can't be misled about content it
// never sees. Ships off by default because legitimate cross-origin embeds
// (payment widgets, OAuth pop-ins, video, embeds) are common.
//
// Per-frame: the extension's content script runs in every frame via
// all_frames: true, so each frame independently hides its own direct
// cross-origin iframe children. Nested cross-origin frames inside a
// same-origin iframe are caught by the same-origin frame's own instance.

import { REVEALED_ATTR } from "../lib/dom-markers";
import { replaceWithBlockPlaceholder } from "../lib/placeholder";
import { createSubtreeWatcher } from "../lib/subtree-watcher";
import type { Rule } from "./types";

const RULE_ID = "cross-origin-frame-hide" as const;

function resolveOrigin(iframe: HTMLIFrameElement): string | null {
  // srcdoc iframes inherit the embedding origin — not a cross-origin threat.
  if (iframe.hasAttribute("srcdoc")) {
    return null;
  }
  const raw = iframe.getAttribute("src");
  if (!raw) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(raw, document.baseURI);
  } catch {
    return null;
  }
  // Only http(s) iframes carry a distinct web origin. about:, javascript:,
  // data:, blob: all either inherit the parent origin or are inert for our
  // purposes; skip them.
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }
  return url.origin;
}

function hideIfCrossOrigin(iframe: HTMLIFrameElement): void {
  // Skip iframes the user has already revealed for this rule, so the subtree
  // observer doesn't immediately re-hide the just-restored content.
  if (iframe.getAttribute(REVEALED_ATTR) === RULE_ID) {
    return;
  }
  const origin = resolveOrigin(iframe);
  if (!origin || origin === globalThis.location.origin) {
    return;
  }
  replaceWithBlockPlaceholder(
    iframe,
    RULE_ID,
    `Cross-origin frame from ${origin}`,
  );
}

function scan(root: ParentNode): void {
  for (const iframe of root.querySelectorAll<HTMLIFrameElement>("iframe")) {
    if (!iframe.isConnected) {
      continue;
    }
    hideIfCrossOrigin(iframe);
  }
}

const watcher = createSubtreeWatcher({
  onSubtrees: (roots) => {
    for (const root of roots) {
      scan(root);
    }
  },
  skipPlaceholderSubtrees: true,
});

function apply(root: ParentNode): void {
  scan(root);
  watcher.start(root);
}

function teardown(): void {
  // The rule engine calls revealAll() before teardown(), so placeholders are
  // already restored to their original iframes by the time we get here.
  watcher.stop();
}

export const crossOriginFrameHideRule = {
  id: RULE_ID,
  label: "Hide Cross-Origin Frames (Experimental)",
  description:
    "Remove cross-origin iframes from the page and replace them with a click-to-reveal placeholder, so browser-use agents don't ingest embedded-origin content unless the user opts in.",
  apply,
  teardown,
} satisfies Rule;
