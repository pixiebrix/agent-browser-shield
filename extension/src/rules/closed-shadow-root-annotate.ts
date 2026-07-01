// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Flag pages that render content inside closed shadow roots so the agent's
// accessibility-tree view of the document carries an explicit note that ABS
// has a blind spot here. Closed shadow roots are opt-out of every external
// JS API by spec — `host.shadowRoot` returns `null`, adopted stylesheets
// and MutationObserver do not cross the boundary, and no supported API
// undoes that. Documented as a coverage gap in
// `docs/src/content/docs/rules.md`; this rule lets the agent learn the
// same thing at read-time.
//
// Two detection paths feed the landmark, ORed:
//
//   1. Main-world probe (primary). When the rule is enabled, the
//      background worker registers `shadow-root-probe.js` as a
//      `world: "MAIN"`, `runAt: "document_start"` content script
//      (`lib/page-world-hooks.ts`) that wraps
//      `Element.prototype.attachShadow` in the page world. Any call
//      with `init.mode === "closed"` dispatches an
//      `abs:closed-shadow-attached` CustomEvent on the document; the
//      listener here stamps the landmark on first event. The wrap
//      sees attachments issued by page scripts directly — the
//      isolated-world copy of the same prototype is a different
//      object, so page-script `attachShadow` calls would otherwise
//      never be observable from an isolated-world rule. The probe
//      delivers a definitive signal that supersedes the structural
//      heuristic below (no canvas/WebGL false positives, catches
//      closed shadows on non-custom-element hosts).
//
//   2. Structural heuristic (fallback). Triggered on `apply` and on
//      every subtree mutation while the rule is on. Necessary because
//      the registered main-world probe lands only on navigations made
//      after the rule was enabled — the active tab the user toggled
//      it on for is covered by the rule's `apply`-time
//      `inject-shadow-root-probe` round-trip (mirrors
//      `webdriver-probe-annotate`), but that round-trip happens at
//      `document_idle`, so closed shadows attached during the active
//      tab's initial parse won't fire the probe. The heuristic looks
//      for the structural shape strongly correlated with "closed
//      shadow host":
//
//        a. Tag name contains a hyphen — required for valid custom
//           element names (per the Web Components spec). UA-shadowed
//           built-ins (`<input>`, `<details>`, `<video>`, `<select>`,
//           `<textarea>`) are filtered out for free because they don't
//           have hyphenated names.
//        b. `customElements.get(tagName.toLowerCase())` returns a
//           constructor — the element has been upgraded. Unupgraded
//           custom elements haven't had their constructor run yet, so
//           they can't have called `attachShadow`.
//        c. `element.shadowRoot === null` — there's no open shadow
//           root for ABS to scan into. (Open-shadow elements are
//           handled by the Tier-1/2/3 shadow-piercing plumbing —
//           issue #164.)
//        d. No light-DOM children — `element.children.length === 0`
//           and no non-whitespace direct text. A custom element with
//           no light children that still renders something is almost
//           certainly using shadow DOM for its UI, and combined with
//           (c) that shadow must be closed.
//        e. Visibly rendering — `getBoundingClientRect()` reports a
//           non-zero box. Avoids flagging custom elements that are
//           defined but unused (zero-sized stubs). In jsdom the rect
//           is always zero, so this gate is bypassed when both
//           dimensions are zero — same convention as
//           `newsletter-modal-hide`.
//
// Known false positive on the heuristic path: a custom element that
// renders via canvas/WebGL or `::before` background-image without any
// shadow DOM still trips it. The landmark text reads "may contain
// content ABS cannot see," not "this is definitely a closed shadow
// root." The main-world probe is definitive on the navigations it
// covers and is preferred when both signals are available.
//
// Known false negatives that even the main-world probe doesn't cover:
//   - Declarative shadow DOM with `shadowrootmode="closed"` — the
//     template is consumed during HTML parsing, never goes through
//     `Element.prototype.attachShadow`, so the wrap never sees it. The
//     materialized closed root is also indistinguishable from "no
//     shadow" from outside JS, so the heuristic can't catch it
//     reliably either. The open variant of declarative shadow DOM is
//     covered by the regular open-shadow plumbing — initial-parse
//     roots are walked at content-script startup, and the
//     `setHTMLUnsafe` patches in `shadow-roots.ts` (isolated world)
//     and `shadow-root-probe-source.ts` (page world) register any
//     open shadow materialized post-parse.

import { RULE_ATTR } from "../lib/dom-markers";
import { createRuleLogger } from "../lib/log";
import { recordDetection, requestPageWorldInject } from "../lib/messenger";
import { SR_ONLY_INLINE_STYLE } from "../lib/sr-only";
import { createSubtreeWatcher } from "../lib/subtree-watcher";
import { traceMutation } from "../lib/trace-mutation";
import type { Rule } from "./types";

const RULE_ID = "closed-shadow-root-annotate" as const;
const log = createRuleLogger(RULE_ID);

const LANDMARK_SELECTOR = `section[${RULE_ATTR}="${RULE_ID}"]`;

const LANDMARK_TEXT =
  "This page renders content inside one or more closed shadow roots. The contents of those shadow roots are invisible to this extension and may include text, controls, or instructions that are not reflected in the rest of the page's accessible content.";

const PROBE_EVENT = "abs:closed-shadow-attached";

let probeListenerAttached = false;

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
  return isVisiblyRendered(element);
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
  traceMutation(
    {
      ruleId: RULE_ID,
      kind: "flag",
      target: document.body,
    },
    () => {
      document.body.prepend(buildLandmark());
    },
  );
  log.info("closed-shadow-root-annotate landmark added", {
    host: location.hostname,
  });
  // Per-document dedupe: the landmark short-circuit above ensures we only
  // get here once, no matter how many hosts the page mounts. Fire-and-forget —
  // the landmark is the load-bearing signal and survives a missed emit to a
  // sleeping service worker.
  recordDetection({
    kind: "closed-shadow-root",
    host: location.hostname,
    url: location.href,
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

// The main-world probe (lib/shadow-root-probe-source.ts) dispatches this
// event on the document for every page-script `attachShadow(... mode:
// "closed" ...)` call. The probe sends no detail — closed shadow contents
// must stay opaque to every consumer; only the binary "an attachment
// happened" signal crosses worlds. The listener stamps the landmark on
// first event, and ensureLandmark's per-document dedupe short-circuits
// every subsequent event for the page's lifetime.
function onClosedShadowAttached(): void {
  ensureLandmark();
}

function requestProbeInjection(): void {
  // Fire-and-forget; a sleeping service worker just drops it.
  // installShadowRootProbe is idempotent via its FLAG sentinel, so re-requests
  // on the same document are no-ops in the page world.
  requestPageWorldInject("shadow-root-probe");
}

function apply(root: ParentNode): void {
  if (!probeListenerAttached) {
    document.addEventListener(PROBE_EVENT, onClosedShadowAttached);
    probeListenerAttached = true;
  }
  // Ask the background to run the probe on this tab — covers the tab
  // the user was already viewing when they toggled the rule on, since
  // the dynamic main-world registration only takes effect on
  // subsequent navigations.
  requestProbeInjection();
  scan(root);
  watcher.start(root);
}

function teardown(): void {
  watcher.stop();
  if (probeListenerAttached) {
    document.removeEventListener(PROBE_EVENT, onClosedShadowAttached);
    probeListenerAttached = false;
  }
  // The page-world wrap on Element.prototype.attachShadow is left in
  // place intentionally — same posture as webdriver-probe-annotate's
  // Navigator.prototype.webdriver wrap. The landmark is the user-visible
  // signal; the wrap itself is plumbing and re-enabling later still
  // benefits from the existing patch on the same document.
  for (const node of document.querySelectorAll(LANDMARK_SELECTOR)) {
    node.remove();
  }
}

export const closedShadowRootAnnotateRule = {
  id: RULE_ID,
  label: "Flag Closed Shadow Roots",
  description:
    "Detect when a page attaches closed shadow roots via a main-world probe over Element.prototype.attachShadow, with a structural heuristic as a fallback. If detected, add a screen-reader-only landmark noting that the extension cannot see inside those shadow trees.",
  // Closed shadow roots in cross-origin iframes are handled — or not — by
  // the iframe's own document; injecting a per-frame landmark there isn't
  // useful since the agent reads the top frame's a11y tree.
  topFrameOnly: true,
  apply,
  teardown,
} satisfies Rule;

export { PROBE_EVENT };
