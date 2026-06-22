// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// The page→worker trust boundary. These schemas decode every content-script
// payload before it touches the popup-facing maps or IndexedDB, so the tests
// pin both the happy path and the "attacker-shaped payload is rejected/dropped"
// path for each message.

import { RULE_IDS } from "../../rules/rule-metadata";
import {
  debugTraceEntrySchema,
  detectionPayloadSchema,
  injectTypeSchema,
  ruleCountsSchema,
  tabIdSchema,
  validatedNotification,
} from "../message-schemas";
import type { MessengerMeta } from "../messenger";

const [KNOWN_RULE_ID] = RULE_IDS;
if (KNOWN_RULE_ID === undefined) {
  throw new Error("expected at least one rule id in the catalog");
}

describe("detectionPayloadSchema", () => {
  it("accepts a roach-motel payload", () => {
    const payload = {
      kind: "roach-motel",
      host: "example.com",
      url: "https://example.com/x",
      difficulty: "hard",
      cancellationUrl: null,
      source: "curated",
    };
    expect(detectionPayloadSchema.parse(payload)).toEqual(payload);
  });

  it("accepts webdriver-probe and closed-shadow-root payloads", () => {
    for (const kind of ["webdriver-probe", "closed-shadow-root"] as const) {
      const payload = { kind, host: "h", url: "u" };
      expect(detectionPayloadSchema.parse(payload)).toEqual(payload);
    }
  });

  it("rejects an unknown kind", () => {
    expect(
      detectionPayloadSchema.safeParse({ kind: "totally-made-up", host: "h" })
        .success,
    ).toBe(false);
  });

  it("rejects a roach-motel payload with an out-of-range difficulty", () => {
    expect(
      detectionPayloadSchema.safeParse({
        kind: "roach-motel",
        host: "h",
        url: "u",
        difficulty: "trivial",
        cancellationUrl: null,
        source: "curated",
      }).success,
    ).toBe(false);
  });

  it("rejects a payload missing required fields", () => {
    expect(
      detectionPayloadSchema.safeParse({ kind: "webdriver-probe", host: "h" })
        .success,
    ).toBe(false);
  });
});

describe("ruleCountsSchema", () => {
  it("keeps known rule ids with positive counts and floors them", () => {
    const result = ruleCountsSchema.parse({ [KNOWN_RULE_ID]: 3.9 });
    expect(result).toEqual({ [KNOWN_RULE_ID]: 3 });
  });

  it("drops unknown rule ids, non-positive, and non-finite counts", () => {
    const result = ruleCountsSchema.parse({
      [KNOWN_RULE_ID]: 2,
      "not-a-real-rule": 5,
      [`${KNOWN_RULE_ID}-zero`]: 0,
      bogusInfinity: Infinity,
    });
    expect(result).toEqual({ [KNOWN_RULE_ID]: 2 });
  });

  it("rejects a non-object payload", () => {
    expect(ruleCountsSchema.safeParse(42).success).toBe(false);
  });
});

describe("debugTraceEntrySchema", () => {
  it("accepts a segment entry", () => {
    const entry = {
      type: "segment",
      segmentId: 1,
      kind: "initial-load",
      timestamp: 10,
      meta: { url: "https://x", pending: 2 },
    };
    expect(debugTraceEntrySchema.parse(entry)).toEqual(entry);
  });

  it("accepts a rule-application entry with optional fields", () => {
    const entry = {
      type: "rule-application",
      segmentId: 1,
      ruleId: "pii-redact",
      kind: "mask",
      timestamp: 10,
      selector: "p#x",
      beforeHtml: "<p>a</p>",
      afterHtml: "<p></p>",
      beforeText: "a",
      cssOnly: false,
    };
    expect(debugTraceEntrySchema.parse(entry)).toEqual(entry);
  });

  it("rejects an unknown entry type", () => {
    expect(
      debugTraceEntrySchema.safeParse({ type: "wat", timestamp: 1 }).success,
    ).toBe(false);
  });

  it("rejects a rule-application entry with an unknown kind", () => {
    expect(
      debugTraceEntrySchema.safeParse({
        type: "rule-application",
        segmentId: 1,
        ruleId: "r",
        kind: "explode",
        timestamp: 1,
        selector: "s",
        beforeHtml: "",
        afterHtml: "",
      }).success,
    ).toBe(false);
  });
});

describe("injectTypeSchema", () => {
  it("accepts the known inject kinds", () => {
    for (const kind of [
      "webdriver-probe",
      "checkout-checkbox-defense",
      "shadow-root-probe",
    ]) {
      expect(injectTypeSchema.parse(kind)).toBe(kind);
    }
  });

  it("rejects an unknown inject kind", () => {
    expect(injectTypeSchema.safeParse("inject-everything").success).toBe(false);
  });
});

describe("tabIdSchema", () => {
  it("accepts a non-negative integer", () => {
    expect(tabIdSchema.parse(7)).toBe(7);
  });

  it("rejects negatives and non-integers", () => {
    expect(tabIdSchema.safeParse(-1).success).toBe(false);
    expect(tabIdSchema.safeParse(1.5).success).toBe(false);
    expect(tabIdSchema.safeParse("7").success).toBe(false);
  });
});

describe("validatedNotification", () => {
  const meta = {
    trace: [{ tab: { id: 3 }, frameId: 0 }],
  } as unknown as MessengerMeta;

  it("calls the handler with parsed data and the sender meta on valid input", () => {
    const handler = jest.fn();
    const guarded = validatedNotification(injectTypeSchema, handler);

    guarded.call(meta, "webdriver-probe");

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith("webdriver-probe", meta);
  });

  it("drops the message (no handler call) on invalid input", () => {
    const handler = jest.fn();
    const guarded = validatedNotification(injectTypeSchema, handler);

    guarded.call(meta, "not-a-real-inject");

    expect(handler).not.toHaveBeenCalled();
  });

  it("hands the handler the transformed value for schemas with a transform", () => {
    const handler = jest.fn();
    const guarded = validatedNotification(ruleCountsSchema, handler);

    guarded.call(meta, { [KNOWN_RULE_ID]: 2.7, junk: -4 });

    expect(handler).toHaveBeenCalledWith({ [KNOWN_RULE_ID]: 2 }, meta);
  });
});
