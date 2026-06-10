// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Shared payload + response shapes for the cross-context messages defined in
// `lib/messenger.ts`. Rules that hide their findings in the a11y tree (sr-only
// landmarks) report a detection at the same moment they stamp the landmark; the
// background keeps a per-tab record so the popup can render a human-visible
// "Detected on this page" list. The message *names* and dispatch live in
// `messenger.ts`; this file is just the data carried by those calls.
//
// Imported by the rule modules (content world), the background service worker,
// and the popup — keep this file dependency-free so it stays trivially
// bundleable into each of those three entry points.

import type { RuleId } from "../rules/rule-metadata";
import type { RoachMotelDifficulty } from "../rules/site-data.generated";

export type DetectionKind =
  | "roach-motel"
  | "webdriver-probe"
  | "closed-shadow-root";

export interface RoachMotelDetectionPayload {
  kind: "roach-motel";
  host: string;
  url: string;
  difficulty: RoachMotelDifficulty;
  cancellationUrl: string | null;
  source: "curated" | "justdeleteme";
}

export interface WebdriverProbeDetectionPayload {
  kind: "webdriver-probe";
  host: string;
  url: string;
}

export interface ClosedShadowRootDetectionPayload {
  kind: "closed-shadow-root";
  host: string;
  url: string;
}

export type DetectionPayload =
  | RoachMotelDetectionPayload
  | WebdriverProbeDetectionPayload
  | ClosedShadowRootDetectionPayload;

export interface RuleCountEntry {
  ruleId: RuleId;
  count: number;
}

// Combined snapshot for the popup, returned by the `getTabRuleCounts` method.
// Folds frame-summed redaction/annotation counts (`entries`, sorted by count
// desc) with the one-shot detection payloads (`detections`) so the popup makes
// a single round-trip to render both the per-rule list and the rich "Heads up"
// cards.
export interface GetTabRuleCountsResponse {
  entries: RuleCountEntry[];
  detections: DetectionPayload[];
}

// Dev-mode structured trace of every rule-driven mutation. Captured only
// when the user enables the "Debug trace" toggle in the popup; gated at
// emission by `debug-trace.ts` so a disabled toggle drops the work
// entirely. Each event is attributed to the segment that was active when
// the mutation happened so consumers can group events by initial-load /
// route-change / modal-open / mutation-burst.
export type SegmentKind =
  | "initial-load"
  | "route-change"
  | "modal-open"
  | "mutation-burst";

export interface SegmentMarker {
  // Monotonically increasing within a single content script. Combined with
  // tabId + frameId in the background to form a stable key.
  segmentId: number;
  kind: SegmentKind;
  // Local timestamp (Date.now) at emit time. Used to render a timeline in
  // the popup without round-tripping back to the content script.
  timestamp: number;
  // Per-kind context. URLs for route-change / initial-load, selectors for
  // modal-open, pending count for mutation-burst.
  meta: Record<string, string | number>;
}

// Mutation shape, in the vocabulary the user-facing docs and rule
// labels already use. Multiple rule labels can map to the same kind —
// e.g., "Hide Reviews" and "Remove Cookie Banners" both produce a `hide`
// trace event because the underlying mutation shape is the same.
export type RuleApplicationKind =
  // Replace with a placeholder OR set display:none on the original.
  // Doc verbs: Hide, Remove.
  | "hide"
  // Inline text replacement (substring → labelled chip). Doc verbs:
  // Mask, Redact.
  | "mask"
  // Blank textContent or remove children/attributes outright.
  // Doc verb: Strip.
  | "strip"
  // In-place edit of attributes or text. Doc verbs: Sanitize, Scrub,
  // Clear, Neutralize.
  | "sanitize"
  // Append a chip/badge near the element. Doc verbs: Flag, Annotate.
  | "flag"
  // Inject helper content (e.g. URL recipes). Doc verb: Embed.
  | "embed";

export interface RuleApplicationEvent {
  segmentId: number;
  // Typed as a plain string rather than `RuleId` because the catalog-derived
  // `RuleId` widens to `string` in practice (the Rule type's self-referential
  // id field forces widening), and the trace consumer falls back gracefully
  // to the raw id when the label lookup misses.
  ruleId: string;
  kind: RuleApplicationKind;
  timestamp: number;
  // Selector that matched the original element when one is known
  // (selector-hide-rule has the union string). Otherwise a structural
  // fingerprint like "div.cookie-banner" from `describeNode`.
  selector: string;
  // outerHTML of the original element captured immediately before the
  // mutation. May be empty for inline placeholders, which store the raw
  // text snippet in `beforeText` instead.
  beforeHtml: string;
  // outerHTML of the replacement placeholder, or empty for in-place hides
  // (the original node stays in the DOM, just `display:none`).
  afterHtml: string;
  // Original text replaced by an inline placeholder. Only populated for
  // `mask` events (inline text replacement).
  beforeText?: string;
  // True when the rule hides the element via an injected stylesheet
  // instead of an element-level write. `beforeHtml` and `afterHtml`
  // are identical for these events — there is no DOM mutation to
  // diff — so the viewer can render them as "matched, not mutated"
  // instead of trying to highlight a non-existent change. Set by the
  // CSS-first detector in `rule-count.ts`; absent on every other
  // event.
  cssOnly?: boolean;
}

// Top-level navigation marker emitted by the background service worker on
// every `chrome.tabs.onUpdated` loading transition. Lets the trace span
// multiple page loads in the same tab — useful when a single user flow
// crosses documents and the developer wants to see all of it in one
// export. Timestamped in the background, so a single tab's events stay
// chronologically ordered alongside content-script-emitted entries even
// without a shared clock.
export interface NavigationEvent {
  // Tab URL at the moment the loading transition fired. May be the
  // previous URL on a same-page reload, or the new URL on a cross-page
  // navigation — Chrome updates `tab.url` lazily relative to `status`.
  // Null when the tab has no URL yet (initial new-tab navigation).
  url: string | null;
  timestamp: number;
}

export type DebugTraceEntry =
  | ({ type: "segment" } & SegmentMarker)
  | ({ type: "rule-application" } & RuleApplicationEvent)
  | ({ type: "navigation" } & NavigationEvent);

// Stored shape returned by `getEventsForTab`. Mirrors the `StoredEvent`
// interface in `debug-trace-store.ts`; kept structurally parallel here
// (instead of importing) so this messages module stays free of the IDB
// dependency the rule modules don't need to pull in.
export interface DebugTraceStoredEntry {
  tabId: number;
  frameId: number;
  addedAt: number;
  entry: DebugTraceEntry;
}

// Flat on-wire shape returned to the page world by the `getTabDebugTrace`
// method. Defined in `lib/debug-trace-export.ts` so this messages module stays
// free of the wire-shape helper.
export interface GetTabDebugTraceResponse {
  entries: Array<DebugTraceEntry & { tabId: number; frameId: number }>;
}
