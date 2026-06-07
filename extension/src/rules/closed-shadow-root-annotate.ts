// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Heuristically flag pages that render content inside closed shadow roots so
// the agent's accessibility-tree view of the document carries an explicit
// note that ABS has a blind spot here. Closed shadow roots are opt-out of
// every external JS API by spec — `host.shadowRoot` returns `null`, adopted
// stylesheets and MutationObserver do not cross the boundary, and no
// supported API undoes that. Documented as a coverage gap in
// `docs/src/content/docs/rules.md`; this rule lets the agent learn the same
// thing at read-time.
//
// Detection is heuristic, not definitive. We cannot enumerate closed shadow
// roots directly — the entire point of `mode: "closed"` is that the page
// is indistinguishable from an element with no shadow root at all from
// outside JS. Instead, the rule looks for a structural shape that's
// strongly correlated with "this element has a closed shadow root":
//
//   1. Tag name contains a hyphen — required for valid custom element names
//      (per the Web Components spec). UA-shadowed built-ins (`<input>`,
//      `<details>`, `<video>`, `<select>`, `<textarea>`) are filtered out
//      for free because they don't have hyphenated names.
//   2. `customElements.get(tagName.toLowerCase())` returns a constructor —
//      the element has been upgraded. Unupgraded custom elements haven't
//      had their constructor run yet, so they can't have called
//      `attachShadow`.
//   3. `element.shadowRoot === null` — there's no open shadow root for
//      ABS to scan into. (Open-shadow elements are handled by the
//      Tier-1/2/3 shadow-piercing plumbing — issue #164.)
//   4. No light-DOM children — `element.children.length === 0` and no
//      non-whitespace direct text. A custom element with no light children
//      that still renders something is almost certainly using shadow DOM
//      for its UI, and combined with (3) that shadow must be closed.
//   5. Visibly rendering — `getBoundingClientRect()` reports a non-zero
//      box. Avoids flagging custom elements that are defined but unused
//      (zero-sized stubs). In jsdom the rect is always zero, so this
//      gate is bypassed when both dimensions are zero — same convention
//      as `newsletter-modal-hide`.
//
// Known false positive: a custom element that renders via canvas/WebGL or
// `::before` background-image without any shadow DOM still trips the
// heuristic. We accept this — the landmark text says "may contain
// content ABS cannot see," not "this is definitely a closed shadow root."
//
// Known false negatives:
//   - Declarative shadow DOM with `shadowrootmode="closed"` — the template
//     is consumed during HTML parsing, never goes through
//     `Element.prototype.attachShadow`, and the materialized closed root
//     is indistinguishable from "no shadow" the same as imperative
//     closed shadows. The open variant of declarative shadow DOM is
//     covered by the regular open-shadow plumbing — initial-parse roots
//     are walked at content-script startup, and the `setHTMLUnsafe`
//     patch in `shadow-roots.ts` registers any open shadow materialized
//     post-parse.
//   - Closed shadows on non-custom elements (e.g., a page that attaches a
//     closed shadow to a `<div>`). Rare in practice — closed mode is
//     almost always paired with the custom element pattern — and a
//     hyphen-less filter would balloon false positives across the whole
//     document.
//
// Future work: a main-world probe that wraps `Element.prototype.attachShadow`
// in the page realm and reports calls with `init.mode === "closed"`, the
// same delivery pattern as `webdriver-probe-annotate`. Would catch the
// non-custom-element case (3) above with high specificity. Skipped for
// now to keep the rule a single-file isolated-world change; revisit if
// the heuristic produces too much noise in the wild.

import type { RuleDetectionMessage } from "../lib/detection-messages";
import { RULE_ATTR } from "../lib/dom-markers";
import { log } from "../lib/log";
import { SR_ONLY_INLINE_STYLE } from "../lib/sr-only";
import { createSubtreeWatcher } from "../lib/subtree-watcher";
import type { Rule } from "./types";

const RULE_ID = "closed-shadow-root-annotate" as const;

const LANDMARK_SELECTOR = `section[${RULE_ATTR}="${RULE_ID}"]`;

const LANDMARK_TEXT =
  "This page renders content inside one or more closed shadow roots. The contents of those shadow roots are invisible to this extension and may include text, controls, or instructions that are not reflected in the rest of the page's accessible content.";

function hasLightContent(element: Element): boolean {
  if (element.children.length > 0) {
    return true;
  }
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
      return true;
    }
  }
  return false;
}

function isVisiblyRendered(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  // jsdom returns 0×0 for every rect — bypass the gate there so tests
  // don't have to mock layout. Same convention used in
  // `newsletter-modal-hide`.
  if (rect.width === 0 && rect.height === 0) {
    return true;
  }
  return rect.width > 0 && rect.height > 0;
}

function looksLikeClosedShadowHost(element: Element): boolean {
  const tagName = element.tagName;
  if (!tagName.includes("-")) {
    return false;
  }
  if (!customElements.get(tagName.toLowerCase())) {
    return false;
  }
  if (element.shadowRoot !== null) {
    return false;
  }
  if (hasLightContent(element)) {
    return false;
  }
  if (!isVisiblyRendered(element)) {
    return false;
  }
  return true;
}

function findClosedShadowHosts(root: ParentNode): Element[] {
  const hosts: Element[] = [];
  // No CSS selector matches "tag name contains a hyphen", so we iterate
  // every descendant and let `looksLikeClosedShadowHost`'s hyphen check
  // short-circuit the non-custom cases on the first conjunct.
  const candidates = root.querySelectorAll("*");
  for (const candidate of candidates) {
    if (looksLikeClosedShadowHost(candidate)) {
      hosts.push(candidate);
    }
  }
  return hosts;
}

function buildLandmark(): HTMLElement {
  const note = document.createElement("section");
  note.setAttribute("role", "note");
  note.setAttribute("aria-label", "abs closed shadow root notice");
  note.setAttribute(RULE_ATTR, RULE_ID);
  note.className = "sr-only";
  Object.assign(note.style, SR_ONLY_INLINE_STYLE);
  note.textContent = LANDMARK_TEXT;
  return note;
}

function ensureLandmark(): void {
  if (document.querySelector(LANDMARK_SELECTOR)) {
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!document.body) {
    return;
  }
  document.body.prepend(buildLandmark());
  log("closed-shadow-root-annotate landmark added", {
    host: globalThis.location.hostname,
  });
  // Per-document dedupe: the landmark short-circuit above ensures we only
  // get here once, no matter how many hosts the page mounts.
  const message: RuleDetectionMessage = {
    type: "rule-detection",
    payload: {
      kind: "closed-shadow-root",
      host: globalThis.location.hostname,
      url: globalThis.location.href,
    },
  };
  chrome.runtime.sendMessage(message).catch(() => {
    // noop — service worker may be asleep; the landmark is the load-bearing
    // signal and survives a missed detection emit.
  });
}

function scan(root: ParentNode): void {
  // The landmark is per-document and idempotent; once it's stamped, every
  // subsequent mutation can skip the descendant walk and rect query.
  if (document.querySelector(LANDMARK_SELECTOR)) {
    return;
  }
  if (findClosedShadowHosts(root).length > 0) {
    ensureLandmark();
  }
}

const watcher = createSubtreeWatcher({
  onSubtrees: (roots) => {
    for (const root of roots) {
      scan(root);
    }
  },
});

function apply(root: ParentNode): void {
  scan(root);
  watcher.start(root);
}

function teardown(): void {
  watcher.stop();
  for (const node of document.querySelectorAll(LANDMARK_SELECTOR)) {
    node.remove();
  }
}

export const closedShadowRootAnnotateRule = {
  id: RULE_ID,
  label: "Flag Closed Shadow Roots",
  description:
    "Heuristically detect when a page renders content inside closed shadow roots (custom elements that visibly render with no light-DOM children). If detected, add a screen-reader-only landmark noting that the extension cannot see inside those shadow trees.",
  // Closed shadow roots in cross-origin iframes are handled — or not — by
  // the iframe's own document; injecting a per-frame landmark there isn't
  // useful since the agent reads the top frame's a11y tree.
  topFrameOnly: true,
  apply,
  teardown,
} satisfies Rule;
