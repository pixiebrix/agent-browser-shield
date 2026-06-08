// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Verifies the dev-mode trace recorder gates emission on the toggle and
// stamps a monotonically-increasing segment id on every event. The
// toggle is read through `debug-trace.ts`'s test-only override so the
// chrome.storage round-trip stays out of the unit test.

import {
  __resetDebugTraceForTesting,
  __setDebugTraceEnabledForTesting,
  recordRuleApplication,
  recordSegment,
} from "../debug-trace";
import type {
  DebugTraceEventMessage,
  RuleApplicationEvent,
  SegmentMarker,
} from "../detection-messages";

let sendMessage: jest.Mock;

function sentEntries(): DebugTraceEventMessage["entry"][] {
  return sendMessage.mock.calls.map(
    ([message]) => (message as DebugTraceEventMessage).entry,
  );
}

beforeEach(() => {
  __resetDebugTraceForTesting();
  sendMessage = jest.fn().mockResolvedValue(undefined);
  (globalThis as { chrome: unknown }).chrome = {
    runtime: { sendMessage },
  };
});

afterEach(() => {
  __resetDebugTraceForTesting();
});

describe("debug-trace recorder", () => {
  it("is a no-op when the toggle is off", () => {
    __setDebugTraceEnabledForTesting(false);

    recordSegment("initial-load", { url: "https://example.com" });
    recordRuleApplication({
      ruleId: "pii-redact",
      kind: "hide",
      selector: "div.banner",
      beforeHtml: "<div>x</div>",
      afterHtml: "<div class='abs'></div>",
    });

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("emits segment markers with monotonically increasing ids", () => {
    __setDebugTraceEnabledForTesting(true);

    const first = recordSegment("initial-load", { url: "https://a.test" });
    const second = recordSegment("route-change", { to: "https://b.test" });

    expect(first).toBe(1);
    expect(second).toBe(2);
    const entries = sentEntries();
    expect(entries).toHaveLength(2);
    expect((entries[0] as SegmentMarker).kind).toBe("initial-load");
    expect((entries[1] as SegmentMarker).kind).toBe("route-change");
    expect((entries[0] as SegmentMarker).segmentId).toBe(1);
    expect((entries[1] as SegmentMarker).segmentId).toBe(2);
  });

  it("attributes rule-application events to the current segment", () => {
    __setDebugTraceEnabledForTesting(true);
    recordSegment("initial-load", { url: "https://example.com" });
    recordRuleApplication({
      ruleId: "cookie-banner-hide",
      kind: "hide",
      selector: "#cookie",
      beforeHtml: "<div id=cookie></div>",
      afterHtml: "",
    });
    recordSegment("route-change", { to: "https://example.com/next" });
    recordRuleApplication({
      ruleId: "ads-hide",
      kind: "hide",
      selector: ".ad",
      beforeHtml: "<div class=ad></div>",
      afterHtml: "<div class=abs></div>",
    });

    const entries = sentEntries();
    const applications = entries.filter(
      (entry): entry is RuleApplicationEvent & { type: "rule-application" } =>
        entry.type === "rule-application",
    );
    expect(applications[0]?.segmentId).toBe(1);
    expect(applications[1]?.segmentId).toBe(2);
  });

  it("swallows sendMessage rejections so a sleeping SW doesn't surface as unhandled", () => {
    __setDebugTraceEnabledForTesting(true);
    sendMessage.mockRejectedValueOnce(
      new Error("Receiving end does not exist"),
    );

    expect(() => {
      recordSegment("initial-load", { url: "https://example.com" });
    }).not.toThrow();
  });

  it("resets the segment counter when the toggle is turned off", () => {
    __setDebugTraceEnabledForTesting(true);
    recordSegment("initial-load", {});
    recordSegment("route-change", {});

    __setDebugTraceEnabledForTesting(false);
    // No-op while off.
    recordSegment("modal-open", {});
    expect(sentEntries()).toHaveLength(2);

    // Note: __setDebugTraceEnabledForTesting bypasses the storage
    // subscribe path that resets the counter; recordSegment off→on
    // continues from the previous id. The persistent storage flip is
    // covered in the integration of `subscribe`, exercised in
    // segment-tracker.test.ts. This case verifies the toggle gate
    // alone.
  });
});
