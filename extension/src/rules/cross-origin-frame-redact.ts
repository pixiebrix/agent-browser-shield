// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Remove cross-origin embedded frame-like elements (`<iframe src=…>`,
// `<object data=…>`, `<embed src=…>`) and replace them with a click-to-reveal
// placeholder. A browser-use agent reading the parent page then never ingests
// the embedded-origin content unless the user explicitly opts in.
//
// Motivation: Roesner & Kohlbrenner ("Agentic Browsers and the Same-Origin
// Policy", ICLR 2026 Workshop) show that an agent willing to read content
// from an embedded cross-origin frame turns a successful prompt injection
// into a same-origin-policy bypass — exfiltrating cross-origin data, forging
// cross-origin actions, etc. `<object data=…>` and `<embed src=…>` carry the
// same SOP-bypass shape when they load a cross-origin resource: the browser
// composites the embedded document into the parent's render/a11y tree, so
// an agent that ingests the parent page ingests the cross-origin payload
// alongside it. Removing the embed entirely is a stronger defense than
// provenance markers: the agent can't be misled about content it never sees.
// Ships off by default because legitimate cross-origin embeds (payment
// widgets, OAuth pop-ins, video, embeds) are common.
//
// srcdoc iframes are deliberately left alone: srcdoc inherits the embedding
// origin (so there is no SOP crossing), and the manifest's
// `match_origin_as_fallback: true` setting means the content script runs
// inside the srcdoc frame, so every other rule already applies to that
// frame's body.
//
// Per-frame: the extension's content script runs in every frame via
// all_frames: true, so each frame independently hides its own direct
// cross-origin embedded children. Nested cross-origin frames inside a
// same-origin iframe are caught by the same-origin frame's own instance.

import { REVEALED_ATTR } from "../lib/dom-markers";
import { replaceWithBlockPlaceholder } from "../lib/placeholder";
import { createSubtreeWatcher } from "../lib/subtree-watcher";
import type { Rule } from "./types";

const RULE_ID = "cross-origin-frame-redact" as const;

const SELECTOR = "iframe, object, embed";

function resolveExternalOrigin(
  element: HTMLElement,
  urlAttribute: "src" | "data",
): string | null {
  const raw = element.getAttribute(urlAttribute);
  if (!raw) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(raw, document.baseURI);
  } catch {
    return null;
  }
  // Only http(s) embeds carry a distinct web origin. about:, javascript:,
  // data:, blob: all either inherit the parent origin or are inert for our
  // purposes; skip them.
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }
  if (url.origin === globalThis.location.origin) {
    return null;
  }
  return url.origin;
}

function describeRedaction(element: HTMLElement): string | null {
  if (element instanceof HTMLIFrameElement) {
    // srcdoc inherits the embedding origin and the content script runs
    // inside the srcdoc frame on its own — not a SOP-bypass carrier, skip.
    if (element.hasAttribute("srcdoc")) {
      return null;
    }
    const origin = resolveExternalOrigin(element, "src");
    return origin ? `Cross-origin frame from ${origin}` : null;
  }
  if (element instanceof HTMLObjectElement) {
    const origin = resolveExternalOrigin(element, "data");
    return origin ? `Cross-origin embedded object from ${origin}` : null;
  }
  if (element instanceof HTMLEmbedElement) {
    const origin = resolveExternalOrigin(element, "src");
    return origin ? `Cross-origin embedded object from ${origin}` : null;
  }
  return null;
}

function hideIfRedactable(element: HTMLElement): void {
  // Skip elements the user has already revealed for this rule, so the subtree
  // observer doesn't immediately re-hide the just-restored content.
  if (element.getAttribute(REVEALED_ATTR) === RULE_ID) {
    return;
  }
  const label = describeRedaction(element);
  if (!label) {
    return;
  }
  replaceWithBlockPlaceholder(element, RULE_ID, label);
}

function scan(root: ParentNode): void {
  for (const element of root.querySelectorAll<HTMLElement>(SELECTOR)) {
    if (!element.isConnected) {
      continue;
    }
    hideIfRedactable(element);
  }
}

const watcher = createSubtreeWatcher({
  // MutationObserver hands us the newly-inserted element itself, but
  // querySelectorAll on that element does not match the element itself —
  // so a bare embedded element appended directly to document.body would be
  // missed. Rescan from document.body on every batch; the is-connected /
  // is-revealed checks in scan() keep it idempotent.
  onSubtrees: () => {
    scan(document.body);
  },
  skipPlaceholderSubtrees: true,
});

function apply(root: ParentNode): void {
  scan(root);
  watcher.start(root);
}

function teardown(): void {
  // The rule engine calls revealAll() before teardown(), so placeholders are
  // already restored to their original elements by the time we get here.
  watcher.stop();
}

export const crossOriginFrameRedactRule = {
  id: RULE_ID,
  label: "Hide Cross-Origin Frames (Experimental)",
  description:
    "Remove cross-origin iframes, <object>, and <embed> resources from the page and replace them with a click-to-reveal placeholder, so browser-use agents don't ingest embedded-origin content unless the user opts in.",
  apply,
  teardown,
} satisfies Rule;
