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
