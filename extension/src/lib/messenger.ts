// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Typed message router built on `webext-messenger`. Replaces the hand-rolled
// `chrome.runtime.onMessage` switch the background worker used to dispatch a
// dozen `{ type: "..." }` envelopes: every cross-context call is now a named,
// statically-typed method. A renamed or mistyped message is a compile error,
// not a silent runtime no-op.
//
// This module is the SHARED contract — imported by content scripts, the popup,
// and the background worker. It deliberately carries NO `zod` dependency so it
// stays cheap to bundle into the content script (which loads in every frame of
// every page). Runtime payload validation lives in the background-only
// `message-schemas.ts` and is applied where each handler is registered — the
// trust boundary is the page→worker hop, and the worker is where we validate.
//
// Direction conventions encoded below:
//   - content/popup → background: senders target `backgroundTarget`.
//   - background → content:        `notifyTabPause` targets the tab's frames.

import type { MessengerMeta, Target } from "webext-messenger";
import { backgroundTarget, getMethod, getNotifier } from "webext-messenger";
import type {
  DebugTraceEntry,
  DetectionPayload,
  GetTabDebugTraceResponse,
  GetTabRuleCountsResponse,
} from "./detection-messages";

export type { MessengerMeta } from "webext-messenger";
// Re-exported so the background and content registration sites pull the
// messenger surface from one place rather than reaching into the library.
export { backgroundTarget, registerMethods } from "webext-messenger";

// The page-world `inject-*` fallbacks a content rule can request when it is
// toggled on mid-session (see `lib/page-world-hooks.ts`). Kept as bare kinds;
// the background validates the incoming value against this exact set before
// dispatching to an installer.
export type PageWorldInjectType =
  | "webdriver-probe"
  | "checkout-checkbox-defense"
  | "shadow-root-probe";

// Raw per-frame rule footprint exactly as the content reporter sends it. The
// background sanitizes it against `KNOWN_RULE_IDS` (and floors / drops
// non-positive counts) before recording — see `ruleCountsSchema`.
export type RawRuleCounts = Record<string, number>;

// The method contract. Signatures keep an explicit `this: MessengerMeta` so a
// handler that reads its sender (`this.trace[0]`) assigns cleanly here; the
// library strips `this` and promisifies the return for callers.
declare global {
  interface MessengerMethods {
    // ── content → background (notifications; page-derived, validated in bg) ──
    recordDetection: (this: MessengerMeta, payload: DetectionPayload) => void;
    reportRuleCounts: (this: MessengerMeta, counts: RawRuleCounts) => void;
    reportDebugTraceEvent: (
      this: MessengerMeta,
      entry: DebugTraceEntry,
    ) => void;
    requestPageWorldInject: (
      this: MessengerMeta,
      injectType: PageWorldInjectType,
    ) => void;
    // ── content/popup → background (request/response) ──
    // Return types mirror each handler: async handlers (storage / IDB reads)
    // resolve a Promise; the library promisifies the rest for callers anyway.
    getTabUrl: (this: MessengerMeta) => string | null;
    getTabPause: (this: MessengerMeta) => Promise<boolean>;
    getTabRuleCounts: (
      this: MessengerMeta,
      tabId: number,
    ) => GetTabRuleCountsResponse;
    getTabDebugTrace: (
      this: MessengerMeta,
    ) => Promise<GetTabDebugTraceResponse>;
    openOptions: (this: MessengerMeta) => Promise<{ ok: true }>;
    // ── background → content (notification, broadcast to every frame) ──
    setTabPause: (this: MessengerMeta, paused: boolean) => void;
  }
}

// ── content/popup → background senders ──
// Notifiers are fire-and-forget: no response is awaited, no retries, errors are
// swallowed — matching the old `sendMessage(...).catch(() => {})` posture.
export const recordDetection = getNotifier("recordDetection", backgroundTarget);
export const reportRuleCounts = getNotifier(
  "reportRuleCounts",
  backgroundTarget,
);
export const reportDebugTraceEvent = getNotifier(
  "reportDebugTraceEvent",
  backgroundTarget,
);
export const requestPageWorldInject = getNotifier(
  "requestPageWorldInject",
  backgroundTarget,
);
// Methods round-trip: the library retries a not-yet-awake worker for a few
// seconds, then rejects — callers already fall back to an empty state on throw.
export const getTabUrl = getMethod("getTabUrl", backgroundTarget);
export const getTabPause = getMethod("getTabPause", backgroundTarget);
export const getTabRuleCounts = getMethod("getTabRuleCounts", backgroundTarget);
export const getTabDebugTrace = getMethod("getTabDebugTrace", backgroundTarget);
export const openOptions = getMethod("openOptions", backgroundTarget);

// ── background → content sender ──
// The background pushes a tab's recovery-pause liveness to every frame on a
// popup edit (ADR-0019). `frameId: "allFrames"` broadcasts via
// `tabs.sendMessage`; content scripts always handle messenger messages routed
// to them, so each frame's `setTabPause` handler fires without a frame-id
// round-trip.
const notifyTabPauseInternal = getNotifier("setTabPause");
export function notifyTabPause(tabId: number, paused: boolean): void {
  notifyTabPauseInternal(
    { tabId, frameId: "allFrames" } satisfies Target,
    paused,
  );
}
