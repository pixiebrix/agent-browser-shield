// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Exercises the IDB-backed trace store against fake-indexeddb. jsdom
// doesn't ship IndexedDB, so the setup below swaps in the fake at the
// top so `idb`'s `openDB` lands on the in-memory store.

import "fake-indexeddb/auto";

import {
  __resetDebugTraceStoreForTesting,
  __setMaxEventsPerTabForTesting,
  appendEvent,
  clearAll,
  clearTab,
  getEventsForTab,
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
    kind: "block-placeholder",
    timestamp: Date.now(),
    selector: "div.x",
    beforeHtml: "<div>x</div>",
    afterHtml: "<div class='abs'></div>",
  };
}

beforeEach(async () => {
  await clearAll();
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

  it("clearAll wipes every tab", async () => {
    await appendEvent(1, 0, segmentEntry(1));
    await appendEvent(2, 0, segmentEntry(1));
    await clearAll();
    expect(await getEventsForTab(1)).toHaveLength(0);
    expect(await getEventsForTab(2)).toHaveLength(0);
  });
});
