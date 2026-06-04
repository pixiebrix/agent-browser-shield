// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Detect when the page reads `navigator.webdriver` — a classic automation
// telltale that bot-detection and fingerprinting scripts probe to decide
// whether the visitor is a human or an automation framework. If reads are
// observed, the rule prepends a screen-reader-only landmark to the page so
// the agent's accessibility-tree view of the document carries an explicit
// note that the operator is *capable* of distinguishing agent traffic from
// human traffic and may serve different content. See issue #122 for the
// AI-targeted cloaking threat model that motivates the annotation.
//
// The rule is off by default and intentionally conservative: it flags
// observable capability, not measured cloaking. The landmark text never
// uses the unqualified word "cloaking" — a `navigator.webdriver` read by
// itself is also consistent with legitimate anti-fraud fingerprinting on
// banking, payments, and checkout flows.
//
// Mechanics: content scripts run in the isolated world and cannot directly
// observe page-world property accesses. Two delivery paths cover the rule:
//
//   1. Primary: when the user toggles the rule on, the background worker
//      registers `webdriver-probe.js` as a dynamic content script with
//      `world: "MAIN"` and `runAt: "document_start"`
//      (`background-webdriver-probe.ts`). Subsequent navigations get the
//      probe before the page's first script — early-parse reads ARE
//      caught.
//   2. Fallback: this rule's `apply` (at document_idle) injects the same
//      probe via inline `<script>` `textContent`. Covers the tab the user
//      was already viewing when they toggled on, since dynamic
//      registrations only apply to future navigations. Misses early-parse
//      reads on that tab but catches `DOMContentLoaded`/`load` handlers,
//      polled fingerprinters, and interaction-driven checks. Pages with a
//      strict `script-src` CSP block the inline `<script>`; those origins
//      silently fall back to the next navigation, which the dynamic
//      registration handles.
//
// Either path triggers the same `CustomEvent` the isolated content
// script listens for; the listener stamps the landmark on first read.
// The wrapped getter persists for the lifetime of the document — the
// rule's `teardown` only removes the landmark and the isolated-world
// listener so re-enabling on the same page still picks up later reads.

import type { RuleDetectionMessage } from "../lib/detection-messages";
import { RULE_ATTR } from "../lib/dom-markers";
import { log } from "../lib/log";
import { SR_ONLY_INLINE_STYLE } from "../lib/sr-only";
import { installProbe } from "../lib/webdriver-probe-source";
import type { Rule } from "./types";

const RULE_ID = "webdriver-probe-annotate" as const;

const EVENT_NAME = "abs:webdriver-probed";

const LANDMARK_SELECTOR = `section[${RULE_ATTR}="${RULE_ID}"]`;

const LANDMARK_TEXT =
  "This page read navigator.webdriver. The site can distinguish AI-agent traffic from human traffic and may serve different content to agents than to people.";

// Body that runs in the page's main world via the rule's inline-injection
// fallback. The IIFE wrap is structural; the actual de-duplication guard
// lives inside installProbe itself. Built from the shared source in
// `lib/webdriver-probe-source.ts`, which is also the entry point for the
// background-registered standalone bundle, so both delivery paths run the
// same code.
const PROBE_SOURCE = `(${installProbe.toString()}).call(window);`;

let listenerAttached = false;
// Tracks whether the page-world probe has already been injected into this
// document. The probe itself short-circuits on `__abs_webdriver_probe_installed`,
// so this is a same-frame churn guard — without it, every re-enable would
// create → append → execute (as a no-op) → remove a new <script> element.
// We never reset this on teardown: the prototype wrap persists across
// enable/disable cycles, so re-enable doesn't need to re-inject.
let probeInjected = false;

function buildLandmark(): HTMLElement {
  const note = document.createElement("section");
  note.setAttribute("role", "note");
  note.setAttribute("aria-label", "abs bot-fingerprint notice");
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
  // Skip if document.body isn't yet available — the engine guards this at
  // the top level, but the event handler runs asynchronously and could
  // fire on a frame whose body has been torn down.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!document.body) {
    return;
  }
  document.body.prepend(buildLandmark());
  log("webdriver-probe-annotate landmark added", {
    host: globalThis.location.hostname,
  });
  // Notify the background so the popup can show a human-visible entry.
  // The line-88 landmark short-circuit above doubles as a per-document
  // dedupe latch — we only get here once per document, no matter how
  // many times navigator.webdriver gets read.
  const message: RuleDetectionMessage = {
    type: "rule-detection",
    payload: {
      kind: "webdriver-probe",
      host: globalThis.location.hostname,
      url: globalThis.location.href,
    },
  };
  chrome.runtime.sendMessage(message).catch(() => {
    // noop
  });
}

function onProbed(): void {
  ensureLandmark();
}

function injectProbe(): void {
  if (probeInjected) {
    return;
  }
  probeInjected = true;
  const script = document.createElement("script");
  script.textContent = PROBE_SOURCE;
  // documentElement so the script runs whether or not <head> is present
  // (some pages skip <head> in early-mounted templates).
  document.documentElement.append(script);
  // The probe registers a getter on Navigator.prototype; the <script>
  // element itself is no longer needed once executed. Removing it keeps
  // the DOM clean and prevents downstream rules (or page code) from
  // tripping over an unexpected child.
  script.remove();
}

function apply(_root: ParentNode): void {
  if (!listenerAttached) {
    document.addEventListener(EVENT_NAME, onProbed);
    listenerAttached = true;
  }
  injectProbe();
}

function teardown(): void {
  if (listenerAttached) {
    document.removeEventListener(EVENT_NAME, onProbed);
    listenerAttached = false;
  }
  for (const node of document.querySelectorAll(LANDMARK_SELECTOR)) {
    node.remove();
  }
  // The wrapped getter on Navigator.prototype is intentionally NOT
  // restored. Restoring would require dispatching another main-world
  // message and a second round of page-world coordination for a state
  // that's unobservable to the user (the landmark is the user-visible
  // signal; the getter wrap is plumbing). Re-enabling later still
  // benefits from the existing wrap on the same document.
}

export const webdriverProbeAnnotateRule = {
  id: RULE_ID,
  label: "Flag navigator.webdriver Reads",
  description:
    "Inject a main-world probe that detects when the page reads navigator.webdriver. If detected, add a screen-reader-only landmark noting the site can distinguish agent traffic — a precondition for AI-targeted cloaking.",
  // The probe instruments the top-level document's Navigator.prototype.
  // Cross-origin iframes have their own Navigator and can't be reached
  // from this rule; same-origin iframes share the prototype with the top
  // frame, so injecting only at the top still catches reads from those
  // iframes once the top frame's apply runs.
  topFrameOnly: true,
  apply,
  teardown,
} satisfies Rule;

export { EVENT_NAME, PROBE_SOURCE };
