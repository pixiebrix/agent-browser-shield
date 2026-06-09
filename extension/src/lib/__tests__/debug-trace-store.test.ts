// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Exercises the IDB-backed trace store against fake-indexeddb. jsdom
// doesn't ship IndexedDB, so the setup below swaps in the fake at the
// top so `idb`'s `openDB` lands on the in-memory store.

import "fake-indexeddb/auto";

import {
  __clearAllForTesting,
  __resetDebugTraceStoreForTesting,
  __setMaxEventsPerTabForTesting,
  appendEvent,
  clearTab,
  getEventsForTab,
  getTabStats,
} from "../debug-trace-store";
import type { DebugTraceEntry } from "../detection-messages";

function segmentEntry(segmentId: number): DebugTraceEntry {
  return {
    type: "segment",
    segmentId,
    kind: "initial-load",
    timestamp: Date.now(),
    meta: {},
  };
}

function appEntry(segmentId: number): DebugTraceEntry {
  return {
    type: "rule-application",
    segmentId,
    ruleId: "pii-redact",
    kind: "hide",
    timestamp: Date.now(),
    selector: "div.x",
    beforeHtml: "<div>x</div>",
    afterHtml: "<div class='abs'></div>",
  };
}

function navEntry(url: string | null): DebugTraceEntry {
  return {
    type: "navigation",
    url,
    timestamp: Date.now(),
  };
}

beforeEach(async () => {
  await __clearAllForTesting();
  __resetDebugTraceStoreForTesting();
});

describe("debug-trace store", () => {
  it("appends events and returns them per tab in insertion order", async () => {
    await appendEvent(1, 0, segmentEntry(1));
    await appendEvent(1, 0, appEntry(1));
    await appendEvent(2, 0, segmentEntry(1));

    const tab1 = await getEventsForTab(1);
    const tab2 = await getEventsForTab(2);
    expect(tab1).toHaveLength(2);
    expect(tab1[0]?.entry.type).toBe("segment");
    expect(tab1[1]?.entry.type).toBe("rule-application");
    expect(tab2).toHaveLength(1);
  });

  it("clearTab deletes only the targeted tab's events", async () => {
    await appendEvent(1, 0, segmentEntry(1));
    await appendEvent(2, 0, segmentEntry(1));

    await clearTab(1);

    expect(await getEventsForTab(1)).toHaveLength(0);
    expect(await getEventsForTab(2)).toHaveLength(1);
  });

  it("prunes oldest events when the per-tab cap is exceeded", async () => {
    // Lower the cap to 3 so we don't need to insert thousands of
    // records to verify the prune path.
    __setMaxEventsPerTabForTesting(3);
    for (let i = 0; i < 6; i += 1) {
      await appendEvent(7, 0, appEntry(1));
    }
    const remaining = await getEventsForTab(7);
    expect(remaining).toHaveLength(3);
  });

  it("getTabStats counts only rule-application entries and sums byte size", async () => {
    await appendEvent(1, 0, segmentEntry(1));
    await appendEvent(1, 0, appEntry(1));
    await appendEvent(1, 0, appEntry(1));
    await appendEvent(2, 0, appEntry(1));

    const tab1 = await getTabStats(1);
    const tab2 = await getTabStats(2);
    const empty = await getTabStats(99);

    // Segment marker doesn't count, two rule-application entries do.
    expect(tab1.eventCount).toBe(2);
    expect(tab2.eventCount).toBe(1);
    expect(empty.eventCount).toBe(0);

    // Byte size includes the segment marker — it's the on-disk footprint
    // a developer would weigh against exporting the trace.
    expect(tab1.byteSize).toBeGreaterThan(tab2.byteSize);
    expect(empty.byteSize).toBe(0);
  });

  it("navigation entries persist and contribute to byteSize but not eventCount", async () => {
    await appendEvent(1, 0, navEntry("https://example.com/a"));
    await appendEvent(1, 0, appEntry(1));
    await appendEvent(1, 0, navEntry("https://example.com/b"));

    const stored = await getEventsForTab(1);
    expect(stored.map((record) => record.entry.type)).toEqual([
      "navigation",
      "rule-application",
      "navigation",
    ]);

    const stats = await getTabStats(1);
    // Only the rule-application contributes to eventCount; navigation
    // markers are bookkeeping like segment markers.
    expect(stats.eventCount).toBe(1);
    // All three entries contribute to the on-disk footprint readout.
    expect(stats.byteSize).toBeGreaterThan(JSON.stringify(appEntry(1)).length);
  });
});
