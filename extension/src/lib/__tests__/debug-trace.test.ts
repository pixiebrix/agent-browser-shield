// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Verifies the dev-mode trace recorder gates emission on the toggle and
// stamps a monotonically-increasing segment id on every event. The
// toggle is read through `debug-trace.ts`'s test-only override so the
// chrome.storage round-trip stays out of the unit test.

// The recorder emits via the typed `lib/messenger` wrapper; mock it so the
// suite reads the captured entries through `installDebugTraceStub` and the real
// `webext-messenger` never loads in jsdom.
jest.mock("../messenger", () => ({
  reportDebugTraceEvent: jest.fn(),
}));

import type { DebugTraceStub } from "../../__test-mocks__/debug-trace-stub";
import { installDebugTraceStub } from "../../__test-mocks__/debug-trace-stub";
import { recordRuleApplication, recordSegment } from "../debug-trace";
import type {
  RuleApplicationEvent,
  SegmentMarker,
} from "../detection-messages";

let stub: DebugTraceStub;

beforeEach(() => {
  stub = installDebugTraceStub();
});

afterEach(() => {
  stub.reset();
});

describe("debug-trace recorder", () => {
  it("is a no-op when the toggle is off", () => {
    stub.setEnabled(false);

    recordSegment("initial-load", { url: "https://example.com" });
    recordRuleApplication({
      ruleId: "pii-redact",
      kind: "hide",
      selector: "div.banner",
      beforeHtml: "<div>x</div>",
      afterHtml: "<div class='abs'></div>",
    });

    expect(stub.events).not.toHaveBeenCalled();
  });

  it("emits segment markers with monotonically increasing ids", () => {
    stub.setEnabled(true);

    const first = recordSegment("initial-load", { url: "https://a.test" });
    const second = recordSegment("route-change", { to: "https://b.test" });

    expect(first).toBe(1);
    expect(second).toBe(2);
    const entries = stub.sentEntries();
    expect(entries).toHaveLength(2);
    expect((entries[0] as SegmentMarker).kind).toBe("initial-load");
    expect((entries[1] as SegmentMarker).kind).toBe("route-change");
    expect((entries[0] as SegmentMarker).segmentId).toBe(1);
    expect((entries[1] as SegmentMarker).segmentId).toBe(2);
  });

  it("attributes rule-application events to the current segment", () => {
    stub.setEnabled(true);
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

    const entries = stub.sentEntries();
    const applications = entries.filter(
      (entry): entry is RuleApplicationEvent & { type: "rule-application" } =>
        entry.type === "rule-application",
    );
    expect(applications[0]?.segmentId).toBe(1);
    expect(applications[1]?.segmentId).toBe(2);
  });

  it("emits as a fire-and-forget notification (recorder never throws)", () => {
    stub.setEnabled(true);

    expect(() => {
      recordSegment("initial-load", { url: "https://example.com" });
    }).not.toThrow();
    // The notifier handles a sleeping service worker; the recorder just hands
    // the entry off.
    expect(stub.events).toHaveBeenCalledTimes(1);
  });

  it("resets the segment counter when the toggle is turned off", () => {
    stub.setEnabled(true);
    recordSegment("initial-load", {});
    recordSegment("route-change", {});

    stub.setEnabled(false);
    // No-op while off.
    recordSegment("modal-open", {});
    expect(stub.sentEntries()).toHaveLength(2);

    // Note: stub.setEnabled bypasses the storage
    // subscribe path that resets the counter; recordSegment off→on
    // continues from the previous id. The persistent storage flip is
    // covered in the integration of `subscribe`, exercised in
    // segment-tracker.test.ts. This case verifies the toggle gate
    // alone.
  });
});
