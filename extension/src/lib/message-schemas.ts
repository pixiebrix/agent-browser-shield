// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Runtime validation for every message the background worker receives from a
// content script. This is the trust boundary: a content script reports data it
// derived from a hostile page (detection host/url, rule footprints, debug
// traces), so the worker decodes each payload through a `zod` schema before it
// touches the popup-facing maps or IndexedDB. A malformed or attacker-shaped
// payload is dropped, not recorded.
//
// Imported ONLY by `background.ts`. `zod` deliberately stays out of the shared
// `messenger.ts` contract so it never lands in the content-script or popup
// bundles — the senders pass typed payloads; the worker is the only context
// that validates.

import type { IsEqual } from "type-fest";
import { z } from "zod";
import type { RuleId } from "../rules/rule-metadata";
import { RULE_IDS } from "../rules/rule-metadata";
import type { DetectionPayload } from "./detection-messages";
import { log } from "./log";
import type { MessengerMeta, PageWorldInjectType } from "./messenger";

const KNOWN_RULE_IDS = new Set<string>(RULE_IDS);

// Compile-time drift guard: `IsEqual` is true only when the schema's inferred
// type and the hand-written wire type are structurally identical, so the build
// fails the moment they stop agreeing.
type AssertTrue<T extends true> = T;

// ── rule-detection payload (discriminated union mirrors DetectionPayload) ──
const detectionPayloadSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("roach-motel"),
    host: z.string(),
    url: z.string(),
    difficulty: z.enum(["hard", "very-hard", "impossible"]),
    cancellationUrl: z.string().nullable(),
    source: z.enum(["curated", "justdeleteme"]),
  }),
  z.object({
    kind: z.literal("webdriver-probe"),
    host: z.string(),
    url: z.string(),
  }),
  z.object({
    kind: z.literal("closed-shadow-root"),
    host: z.string(),
    url: z.string(),
  }),
]);
// Fails to compile if `DetectionPayload` and the schema diverge (a new kind, a
// renamed field, a widened enum).
type _DetectionParity = AssertTrue<
  IsEqual<z.infer<typeof detectionPayloadSchema>, DetectionPayload>
>;

// ── per-frame rule counts ──
// Preserves the old hand-rolled sanitization exactly: drop unknown rule ids and
// non-positive / non-finite counts, floor the rest, so a misbehaving content
// script can't poison the badge or popup. Expressed as a lenient outer decode
// (any object) plus a transform, so one bad key drops only that entry rather
// than the whole report.
export type RuleCountMap = Partial<Record<RuleId, number>>;
const ruleCountsSchema = z
  .record(z.string(), z.unknown())
  .transform((raw): RuleCountMap => {
    const sanitized: RuleCountMap = {};
    for (const [key, value] of Object.entries(raw)) {
      if (
        KNOWN_RULE_IDS.has(key) &&
        typeof value === "number" &&
        Number.isFinite(value) &&
        value > 0
      ) {
        sanitized[key as RuleId] = Math.floor(value);
      }
    }
    return sanitized;
  });

// ── debug-trace event ──
// Dev-only (gated behind the debug-trace toggle), but still content→worker, so
// it gets the same structural decode before an IndexedDB write.
const debugTraceEntrySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("segment"),
    segmentId: z.number(),
    kind: z.enum([
      "initial-load",
      "route-change",
      "modal-open",
      "mutation-burst",
    ]),
    timestamp: z.number(),
    meta: z.record(z.string(), z.union([z.string(), z.number()])),
  }),
  z.object({
    type: z.literal("rule-application"),
    segmentId: z.number(),
    ruleId: z.string(),
    kind: z.enum(["hide", "mask", "strip", "sanitize", "flag", "embed"]),
    timestamp: z.number(),
    selector: z.string(),
    beforeHtml: z.string(),
    afterHtml: z.string(),
    beforeText: z.string().optional(),
    cssOnly: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("navigation"),
    url: z.string().nullable(),
    timestamp: z.number(),
  }),
]);

// ── page-world inject request ──
const injectTypeSchema: z.ZodType<PageWorldInjectType> = z.enum([
  "webdriver-probe",
  "checkout-checkbox-defense",
  "shadow-root-probe",
]);

// ── popup-supplied tab id ──
// The popup is an extension page (trusted), but the round-trip still carries a
// value, so we decode it; an invalid id resolves to "no such tab" upstream.
const tabIdSchema = z.number().int().nonnegative();

// Wrap a notification handler in a decode step. On a schema mismatch the
// payload is logged and dropped (the old branches silently ignored malformed
// messages); on success the parsed/sanitized value and the sender metadata are
// handed to the inner handler.
function validatedNotification<Schema extends z.ZodType>(
  schema: Schema,
  handler: (payload: z.infer<Schema>, meta: MessengerMeta) => void,
): (this: MessengerMeta, raw: z.input<Schema>) => void {
  return function (raw) {
    const result = schema.safeParse(raw);
    if (!result.success) {
      log.warn("dropped invalid message payload", {
        issues: result.error.issues,
      });
      return;
    }
    handler(result.data, this);
  };
}

export {
  debugTraceEntrySchema,
  detectionPayloadSchema,
  injectTypeSchema,
  ruleCountsSchema,
  tabIdSchema,
  validatedNotification,
};
