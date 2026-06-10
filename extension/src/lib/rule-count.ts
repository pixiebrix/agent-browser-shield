// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Per-frame, per-rule tally of the rule engine's footprint on this document,
// reported to the background so it can render a toolbar badge total and
// drive the popup's per-rule activity list.
//
// Three count sources:
//
// 1. JS-path placeholders + chips — every node a rule introduces is
//    stamped with `RULE_ATTR=<rule id>`.
// 2. In-place hides — every page element a rule hides via the
//    selector-hide pipeline carries `HIDDEN_ATTR=<rule id>`.
// 3. CSS-first hides — rules that hide via an injected stylesheet (e.g.,
//    `chat-widget-hide`) stamp no marker attribute on the element (the
//    stylesheet does the hiding). They call `registerCssFirstSelectors`
//    with their rule id + selector union; the reporter QSAs each
//    registered union and attributes the count to that rule.
//
// Mirrors the lifecycle of the previous single-number `placeholder-count`
// reporter: throttled mutation observer on `document.body`, deep-equality
// dedup on resend, and a final empty report on `pagehide` so the background
// can decrement this frame's contribution before the next document's
// content script registers itself.

import throttle from "lodash/throttle";
import { isDebugTraceEnabled, recordRuleApplication } from "./debug-trace";
import { HIDDEN_ATTR, RULE_ATTR } from "./dom-markers";
import { reportRuleCounts } from "./messenger";

const COUNT_SELECTOR = `[${RULE_ATTR}], [${HIDDEN_ATTR}]`;
const REPORT_THROTTLE_MS = 250;

// Each entry maps a rule id to one of its registered CSS-first selector
// unions. A rule may register more than once (separate union strings),
// so we key by (ruleId, union) rather than by ruleId alone — see
// `registerCssFirstSelectors`. Each union carries its own WeakSet of
// elements the debug-trace recorder has already emitted an event for,
// so the per-recount sweep doesn't re-emit the same match every 250 ms.
interface CssFirstUnion {
  union: string;
  traced: WeakSet<Element>;
}
const cssFirstRegistrations = new Map<string, Map<string, CssFirstUnion>>();
let recountTrigger: (() => void) | null = null;

// Register a CSS-first selector union with the counter so matches of
// `union` are attributed to `ruleId` in the per-rule count. Returns an
// unregister fn. Safe to call before `startRuleCountReporter` runs (the
// union is recorded and picked up by the first count).
export function registerCssFirstSelectors(
  ruleId: string,
  union: string,
): () => void {
  if (union.length === 0) {
    return () => {
      // empty union ⇒ nothing was registered ⇒ nothing to unregister
    };
  }
  let unions = cssFirstRegistrations.get(ruleId);
  if (!unions) {
    unions = new Map<string, CssFirstUnion>();
    cssFirstRegistrations.set(ruleId, unions);
  }
  if (!unions.has(union)) {
    unions.set(union, { union, traced: new WeakSet<Element>() });
  }
  recountTrigger?.();
  return () => {
    const registered = cssFirstRegistrations.get(ruleId);
    if (!registered) {
      return;
    }
    registered.delete(union);
    if (registered.size === 0) {
      cssFirstRegistrations.delete(ruleId);
    }
    recountTrigger?.();
  };
}

function currentCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  // The two attributes are mutually exclusive in practice — placeholders /
  // chips carry RULE_ATTR, in-place hidden originals carry HIDDEN_ATTR —
  // so a single querySelectorAll without dedup is accurate. Reading
  // RULE_ATTR first means an element that carries both (defensive, would
  // signal a rule wiring bug elsewhere) is attributed to RULE_ATTR.
  for (const element of document.body.querySelectorAll(COUNT_SELECTOR)) {
    const id =
      element.getAttribute(RULE_ATTR) ?? element.getAttribute(HIDDEN_ATTR);
    if (!id) {
      continue;
    }
    counts[id] = (counts[id] ?? 0) + 1;
  }
  // CSS-first hides have no marker attribute, so we run one QSA per
  // registered union and credit the rule that registered it.
  //
  // While we have the match list in hand, also emit a debug-trace
  // `rule-application` event per newly-matched element when the trace
  // toggle is on. CSS-first rules don't mutate the DOM (the stylesheet
  // hides matches declaratively), so the `beforeHtml` / `afterHtml`
  // snapshots are identical — `cssOnly: true` flags the event as
  // "matched, not mutated" so the viewer doesn't try to highlight a
  // non-existent diff. The whole point of these events is to surface
  // false-positive matches (e.g., chat-widget-hide accidentally
  // matching a non-chat element); the matched element's outerHTML is
  // exactly what a reviewer needs to make that call.
  const traceCssMatches = isDebugTraceEnabled();
  for (const [ruleId, unions] of cssFirstRegistrations) {
    for (const reg of unions.values()) {
      const matches = document.body.querySelectorAll(reg.union);
      if (matches.length > 0) {
        counts[ruleId] = (counts[ruleId] ?? 0) + matches.length;
      }
      if (!traceCssMatches) {
        continue;
      }
      for (const element of matches) {
        if (reg.traced.has(element)) {
          continue;
        }
        reg.traced.add(element);
        const html = element.outerHTML;
        recordRuleApplication({
          ruleId,
          kind: "hide",
          selector: reg.union,
          beforeHtml: html,
          afterHtml: html,
          cssOnly: true,
        });
      }
    }
  }
  return counts;
}

function shallowEqual(
  a: Record<string, number>,
  b: Record<string, number>,
): boolean {
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) {
    return false;
  }
  for (const key of keysA) {
    if (a[key] !== b[key]) {
      return false;
    }
  }
  return true;
}

function send(counts: Record<string, number>): void {
  // Fire-and-forget; a sleeping service worker (or a receiver not yet ready)
  // just drops it — no "Receiving end does not exist" rejection to swallow.
  reportRuleCounts(counts);
}

export function startRuleCountReporter(): () => void {
  let lastReported: Record<string, number> = {};
  let hasReported = false;
  const reportIfChanged = () => {
    const counts = currentCounts();
    if (hasReported && shallowEqual(counts, lastReported)) {
      return;
    }
    lastReported = counts;
    hasReported = true;
    send(counts);
  };

  const throttled = throttle(reportIfChanged, REPORT_THROTTLE_MS, {
    leading: true,
    trailing: true,
  });

  // Allow `registerCssFirstSelectors` callers to trigger a recount when a
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
    attributeFilter: [HIDDEN_ATTR, RULE_ATTR],
  });

  const onPageHide = () => {
    throttled.cancel();
    send({});
  };

  // Flush a final empty report on unload so the background can decrement
  // this frame's contribution before the new document's content script
  // registers itself.
  window.addEventListener("pagehide", onPageHide);

  // Returned so tests can deterministically stop the observer between
  // cases. Production callers fire-and-forget — the observer lives for
  // the document's lifetime and tears down naturally on navigation.
  return () => {
    throttled.cancel();
    observer.disconnect();
    window.removeEventListener("pagehide", onPageHide);
    if (recountTrigger === throttled) {
      recountTrigger = null;
    }
  };
}
