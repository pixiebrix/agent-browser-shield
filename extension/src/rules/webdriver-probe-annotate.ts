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
// observe page-world property accesses. The rule's `apply` injects a tiny
// `<script>` element whose `textContent` runs in the page's main world,
// wraps `Navigator.prototype.webdriver`'s getter, and dispatches a DOM
// `CustomEvent` on the document each time a read occurs. The isolated
// content script listens for that event and stamps the landmark on first
// detection. Pages with a strict `script-src` CSP block the inline
// `<script>`; on those origins the rule silently degrades to a no-op.
//
// Because the engine fires `apply` at document_idle, reads issued during
// the page's initial parse (very early fingerprinters) are not caught.
// Reads from `DOMContentLoaded`/`load` handlers, polled checks, and
// interaction-driven fingerprinters are caught. The wrapped getter
// persists for the lifetime of the page; the rule's `teardown` only
// removes the landmark and the isolated-world listener so re-enabling
// while still on the same page still picks up later reads.

import { RULE_ATTR, WEBDRIVER_PROBE_SCRIPT_ATTR } from "../lib/dom-markers";
import { log } from "../lib/log";
import { SR_ONLY_INLINE_STYLE } from "../lib/sr-only";
import type { Rule } from "./types";

const RULE_ID = "webdriver-probe-annotate" as const;

const EVENT_NAME = "abs:webdriver-probed";

const LANDMARK_SELECTOR = `section[${RULE_ATTR}="${RULE_ID}"]`;
const PROBE_SCRIPT_SELECTOR = `script[${WEBDRIVER_PROBE_SCRIPT_ATTR}]`;

const LANDMARK_TEXT =
  "This page read navigator.webdriver. The site can distinguish AI-agent traffic from human traffic and may serve different content to agents than to people.";

// Page-world implementation. Authored as a real function so TypeScript
// type-checks the body; serialized via `Function.prototype.toString` so
// the rule can ship it as inline `<script>` text. The function must not
// reference any module-scope identifiers — the only thing that crosses
// into the page world is the function body's source. The event name is
// hard-coded as a literal here and re-declared as a module constant for
// the isolated-world listener; the catalog test below asserts the two
// agree.
function installProbe(this: Window): void {
  const FLAG = "__abs_webdriver_probe_installed";
  const probeWindow = this as Window & Record<string, unknown>;
  if (probeWindow[FLAG]) {
    return;
  }
  probeWindow[FLAG] = true;
  const proto = Navigator.prototype;
  interface WebdriverDescriptor {
    enumerable?: boolean;
    get?: (this: Navigator) => boolean | undefined;
    set?: (this: Navigator, value: unknown) => void;
  }
  const original = Object.getOwnPropertyDescriptor(proto, "webdriver") as
    | WebdriverDescriptor
    | undefined;
  function wrappedGet(this: Navigator): boolean | undefined {
    try {
      document.dispatchEvent(new CustomEvent("abs:webdriver-probed"));
    } catch {
      // Some pages frame-bust by replacing CustomEvent; swallow and
      // continue so the page's read still returns the original value.
    }
    return original?.get?.call(this);
  }
  try {
    const descriptor: PropertyDescriptor = {
      configurable: true,
      enumerable: original?.enumerable ?? true,
      get: wrappedGet,
    };
    if (original?.set) {
      descriptor.set = original.set;
    }
    Object.defineProperty(proto, "webdriver", descriptor);
  } catch {
    // Non-configurable property — give up silently. The rule is
    // best-effort; a future Chrome that locks down Navigator.prototype
    // would simply disable detection on those pages.
  }
}

// Body that runs in the page's main world. The IIFE wrap is structural;
// the actual de-duplication guard lives inside installProbe itself.
const PROBE_SOURCE = `(${installProbe.toString()}).call(window);`;

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
  document.body.prepend(buildLandmark());
  log("webdriver-probe-annotate landmark added", {
    host: globalThis.location.hostname,
  });
}

function onProbed(): void {
  ensureLandmark();
}

function injectProbe(): void {
  if (document.querySelector(PROBE_SCRIPT_SELECTOR)) {
    return;
  }
  const script = document.createElement("script");
  script.setAttribute(WEBDRIVER_PROBE_SCRIPT_ATTR, "");
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

export { EVENT_NAME, installProbe, PROBE_SOURCE };
