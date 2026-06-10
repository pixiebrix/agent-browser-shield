// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// The typed message router for the background worker. Every method here is the
// receiving half of a `lib/messenger.ts` call; the sender's payload is decoded
// through its `message-schemas.ts` validator before it touches any state.
// `meta.trace[0]` is the immediate sender (`chrome.runtime.MessageSender`) —
// the content script's tabId / frameId / url are read from there, never from
// the payload. State-touching methods delegate to the `TabTracker`; the rest
// are self-contained reads. `registerMethods` merges across call sites (see
// `effective-enforcement.ts`), so this block can live apart from the entry.

import { toExportedRecord } from "../debug-trace-export";
import {
  appendEvent as appendDebugTraceEvent,
  getEventsForTab as getDebugTraceForTab,
} from "../debug-trace-store";
import type {
  DebugTraceEntry,
  GetTabRuleCountsResponse,
} from "../detection-messages";
import { log } from "../log";
import {
  debugTraceEntrySchema,
  detectionPayloadSchema,
  injectTypeSchema,
  ruleCountsSchema,
  tabIdSchema,
  validatedNotification,
} from "../message-schemas";
import type { MessengerMeta } from "../messenger";
import { registerMethods } from "../messenger";
import { dispatchPageWorldInject } from "../page-world-hooks";
import { isPauseActive, tabPauseMap } from "../tab-pause";
import type { TabTracker } from "./tab-tracker";

export function registerBackgroundMethods(tracker: TabTracker): void {
  registerMethods({
    // Record a rule's a11y-tree detection so the popup can surface it.
    recordDetection: validatedNotification(
      detectionPayloadSchema,
      (payload, meta) => {
        const tabId = meta.trace[0]?.tab?.id;
        if (typeof tabId === "number") {
          tracker.recordDetection(tabId, payload);
        }
      },
    ),

    // Per-frame rule footprint. `ruleCountsSchema` has already dropped unknown
    // rule ids and non-positive counts, so a misbehaving content script can't
    // poison the badge or popup.
    reportRuleCounts: validatedNotification(
      ruleCountsSchema,
      (counts, meta) => {
        const tabId = meta.trace[0]?.tab?.id;
        const frameId = meta.trace[0]?.frameId;
        if (typeof tabId === "number" && typeof frameId === "number") {
          tracker.recordFrameRuleCounts(tabId, frameId, counts);
        }
      },
    ),

    // Dev-mode trace event → IndexedDB. Fire-and-forget: the IDB write is async
    // but the handler shouldn't block on disk; pruning happens inside
    // `appendEvent`.
    reportDebugTraceEvent: validatedNotification(
      debugTraceEntrySchema,
      (entry, meta) => {
        const tabId = meta.trace[0]?.tab?.id;
        const frameId = meta.trace[0]?.frameId;
        if (typeof tabId !== "number" || typeof frameId !== "number") {
          return;
        }
        // `entry` is a validated debug-trace entry; the cast only bridges
        // `exactOptionalPropertyTypes` (zod infers `key?: T | undefined` for
        // the optional fields where the interface declares `key?: T`).
        void appendDebugTraceEvent(
          tabId,
          frameId,
          entry as DebugTraceEntry,
        ).catch((error: unknown) => {
          log.error("debug-trace IDB write failed", { error });
        });
      },
    ),

    // Run a page-world install fn on the tab the user was already viewing when
    // they toggled a rule on — dynamic registrations only take effect on the
    // next navigation. The table and the per-install `__abs_*_installed`
    // page-world guards live in `lib/page-world-hooks.ts`.
    requestPageWorldInject: validatedNotification(
      injectTypeSchema,
      (injectType, meta) => {
        const sender = meta.trace[0];
        if (sender) {
          dispatchPageWorldInject(injectType, sender);
        }
      },
    ),

    // Subframe content scripts ask this once at startup so they can evaluate
    // the per-site denylist (ADR-0018) against the tab's top-frame URL instead
    // of their own iframe URL. `sender.tab.url` requires host permission — we
    // have <all_urls>, so this is just a property read. A frame whose tab URL
    // the background can't resolve gets `null` and falls back to "URL unknown →
    // fail open."
    getTabUrl(this: MessengerMeta) {
      return this.trace[0]?.tab?.url ?? null;
    },

    // Content scripts ask this once at rule-engine init to seed the tab-scoped
    // recovery pause (ADR-0019). Read the session store directly rather than
    // the in-memory cache so a request that lands before startup hydration
    // still resolves accurately. The background applies the `expiresAt` check
    // so the content side only ever sees a boolean.
    async getTabPause(this: MessengerMeta) {
      const tabId = this.trace[0]?.tab?.id;
      if (typeof tabId !== "number") {
        return false;
      }
      try {
        const value = await tabPauseMap.get(String(tabId));
        return isPauseActive(value ?? null, Date.now());
      } catch {
        return false;
      }
    },

    // Combined per-rule + detection snapshot the popup renders on open.
    getTabRuleCounts(
      this: MessengerMeta,
      tabId: number,
    ): GetTabRuleCountsResponse {
      const parsed = tabIdSchema.safeParse(tabId);
      return parsed.success
        ? tracker.buildRuleCountsResponse(parsed.data)
        : { entries: [], detections: [] };
    },

    // Page-world `__abs_dumpTrace` bridge → IDB read. Flattened to the public
    // wire shape: `addedAt` is internal IDB bookkeeping and the tabId/frameId
    // live on the entry, matching `extension/data/debug-trace.schema.json`.
    async getTabDebugTrace(this: MessengerMeta) {
      const tabId = this.trace[0]?.tab?.id;
      if (typeof tabId !== "number") {
        return { entries: [] };
      }
      try {
        const stored = await getDebugTraceForTab(tabId);
        return { entries: stored.map((record) => toExportedRecord(record)) };
      } catch (error: unknown) {
        log.error("get-tab-debug-trace IDB read failed", { error });
        return { entries: [] };
      }
    },

    // Popup / page badge → open the options page.
    async openOptions() {
      await new Promise<void>((resolve) => {
        chrome.runtime.openOptionsPage(() => {
          resolve();
        });
      });
      return { ok: true } as const;
    },
  });
}
