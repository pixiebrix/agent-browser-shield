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
//      (`lib/page-world-hooks.ts`). Subsequent navigations get the
//      probe before the page's first script — early-parse reads ARE
//      caught.
//   2. Fallback: this rule's `apply` (at document_idle) asks the background
//      worker to inject the probe via `chrome.scripting.executeScript`
//      with `world: "MAIN"`. Covers the tab the user was already viewing
//      when they toggled on, since dynamic registrations only apply to
//      future navigations. Also covers the SW-restart race where the
//      primary registration may not yet be live. The fallback misses
//      early-parse reads on that tab but catches `DOMContentLoaded`/
//      `load` handlers, polled fingerprinters, and interaction-driven
//      checks. `executeScript` with `world: "MAIN"` is exempt from page
//      CSP the same way the registered content script is, so strict
//      `script-src` origins no longer block the fallback.
//
// Either path triggers the same `CustomEvent` the isolated content
// script listens for; the listener stamps the landmark on first read.
// The wrapped getter persists for the lifetime of the document — the
// rule's `teardown` only removes the landmark and the isolated-world
// listener so re-enabling on the same page still picks up later reads.

import { RULE_ATTR } from "../lib/dom-markers";
import { createRuleLogger } from "../lib/log";
import { recordDetection, requestPageWorldInject } from "../lib/messenger";
import { SR_ONLY_INLINE_STYLE } from "../lib/sr-only";
import { traceMutation } from "../lib/trace-mutation";
import type { Rule } from "./types";

const RULE_ID = "webdriver-probe-annotate" as const;
const log = createRuleLogger(RULE_ID);

const EVENT_NAME = "abs:webdriver-probed";

const LANDMARK_SELECTOR = `section[${RULE_ATTR}="${RULE_ID}"]`;

const LANDMARK_TEXT =
  "This page read navigator.webdriver. The site can distinguish AI-agent traffic from human traffic and may serve different content to agents than to people.";

let listenerAttached = false;

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
  log.info("webdriver-probe-annotate landmark added", {
    host: location.hostname,
  });
  // Notify the background so the popup can show a human-visible entry.
  // The line-88 landmark short-circuit above doubles as a per-document
  // dedupe latch — we only get here once per document, no matter how
  // many times navigator.webdriver gets read.
  recordDetection({
    kind: "webdriver-probe",
    host: location.hostname,
    url: location.href,
  });
}

function onProbed(): void {
  ensureLandmark();
}

function requestProbeInjection(): void {
  // Fire-and-forget; a sleeping service worker just drops it. The probe itself
  // short-circuits on `__abs_webdriver_probe_installed`, so re-requests on the
  // same document are no-ops in the page world.
  requestPageWorldInject("webdriver-probe");
}

function apply(_root: ParentNode): void {
  if (!listenerAttached) {
    document.addEventListener(EVENT_NAME, onProbed);
    listenerAttached = true;
  }
  requestProbeInjection();
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

export { EVENT_NAME };
