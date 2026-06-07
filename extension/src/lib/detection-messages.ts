// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Shared payload + message types for surfacing rule detections to the
// popup. Rules that hide their findings in the a11y tree (sr-only
// landmarks) emit a `rule-detection` message at the same moment they
// stamp the landmark; the background keeps a per-tab record so the popup
// can render a human-visible "Detected on this page" list. Imported by
// the rule modules (content world), the background service worker, and
// the popup — keep this file dependency-free so it stays trivially
// bundleable into each of those three entry points.

import type { RuleId } from "../rules/rule-defaults.generated";
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

export interface RuleDetectionMessage {
  type: "rule-detection";
  payload: DetectionPayload;
}

export interface GetTabDetectionsRequest {
  type: "get-tab-detections";
  tabId: number;
}

export interface GetTabDetectionsResponse {
  detections: DetectionPayload[];
}

// Per-frame, per-rule footprint reported by the content script. The shape is
// a partial record so a frame with no activity sends an empty object — the
// background uses that as the cue to drop the frame's entry, mirroring the
// `count <= 0` cleanup the previous single-number reporter used. Keys are
// `RuleId` values; bad keys are filtered by the background.
export interface RuleCountMessage {
  type: "rule-count";
  counts: Partial<Record<RuleId, number>>;
}

export interface GetTabRuleCountsRequest {
  type: "get-tab-rule-counts";
  tabId: number;
}

export interface RuleCountEntry {
  ruleId: RuleId;
  count: number;
}

// Combined snapshot for the popup. Folds frame-summed redaction/annotation
// counts (`entries`, sorted by count desc) with the existing one-shot
// detection payloads (`detections`) so the popup makes a single round-trip
// to render both the per-rule list and the rich "Heads up" cards.
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

export type RuleApplicationKind =
  | "block-placeholder"
  | "inline-placeholder"
  | "hide-in-place";

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
  // `inline-placeholder` events.
  beforeText?: string;
}

export type DebugTraceEntry =
  | ({ type: "segment" } & SegmentMarker)
  | ({ type: "rule-application" } & RuleApplicationEvent);

export interface DebugTraceEventMessage {
  type: "debug-trace-event";
  entry: DebugTraceEntry;
}
