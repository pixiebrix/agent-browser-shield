// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// IndexedDB persistence for the dev-mode rule-application trace. Lives at
// the extension origin (chrome-extension://<id>) so the background service
// worker, popup, and options page can all read/write the same store. The
// content script can't reach it directly — it runs in the page origin and
// would land in the page's IDB instead — so trace events ride a
// `chrome.runtime.sendMessage` over to the background, which persists them
// here. IDB survives MV3 service-worker sleep, so the popup can read the
// full trace even after the SW has restarted.
//
// Schema is append-only with one record per event. The `by-tab` index lets
// the popup pull a single tab's trace without scanning the full store;
// pruning keeps each tab capped at MAX_EVENTS_PER_TAB to bound disk growth
// on long-lived tabs that trigger heavy rule activity.

import type { DBSchema, IDBPDatabase } from "idb";
import { openDB } from "idb";
import type { DebugTraceEntry } from "./detection-messages";

const DB_NAME = "agent-browser-shield-debug-trace";
const DB_VERSION = 1;
const STORE_NAME = "events";
const BY_TAB_INDEX = "by-tab";

// Per-tab event cap. IDB can hold much more, but a chatty SPA with the
// toggle left on overnight would otherwise grow unbounded. The prune runs
// on every append once the count crosses; we drop the oldest events first.
// Roughly bounds per-tab disk to ~10 MB at 5 KB/event average.
export const MAX_EVENTS_PER_TAB = 2000;

// The active cap is held in a `let` so tests can drop it to a small
// number (e.g. 3) and exercise the prune path without inserting 2000+
// events. Production code never touches this — production always reads
// the constant via `appendEvent`.
let activeMaxPerTab = MAX_EVENTS_PER_TAB;

interface StoredEvent {
  tabId: number;
  frameId: number;
  addedAt: number;
  entry: DebugTraceEntry;
}

interface DebugTraceDB extends DBSchema {
  [STORE_NAME]: {
    key: number;
    value: StoredEvent;
    indexes: {
      [BY_TAB_INDEX]: number;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<DebugTraceDB>> | null = null;

function getDb(): Promise<IDBPDatabase<DebugTraceDB>> {
  dbPromise ??= openDB<DebugTraceDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const store = db.createObjectStore(STORE_NAME, {
        autoIncrement: true,
      });
      store.createIndex(BY_TAB_INDEX, "tabId");
    },
  });
  return dbPromise;
}

export async function appendEvent(
  tabId: number,
  frameId: number,
  entry: DebugTraceEntry,
): Promise<void> {
  const db = await getDb();
  const stored: StoredEvent = {
    tabId,
    frameId,
    addedAt: Date.now(),
    entry,
  };
  await db.add(STORE_NAME, stored);
  await pruneTab(tabId);
}

// Get every stored event for a tab in insertion order. The autoincrement
// keys preserve insertion order so the index walk is naturally chronological.
export async function getEventsForTab(tabId: number): Promise<StoredEvent[]> {
  const db = await getDb();
  return db.getAllFromIndex(STORE_NAME, BY_TAB_INDEX, tabId);
}

export interface TabTraceStats {
  // Count of `rule-application` entries only — segment markers are
  // bookkeeping and don't represent "events" the user thinks about.
  eventCount: number;
  // Approximate disk footprint of every stored entry (segment markers
  // included) — what `Export` would emit. JSON.stringify length is
  // close enough for an order-of-magnitude readout.
  byteSize: number;
}

// Single-pass cursor walk so polling doesn't transfer full entries — the
// popup polls this every second while open and a busy SPA can accumulate
// thousands of multi-KB `outerHTML` snippets.
export async function getTabStats(tabId: number): Promise<TabTraceStats> {
  const db = await getDb();
  const tx = db.transaction(STORE_NAME, "readonly");
  const index = tx.store.index(BY_TAB_INDEX);
  let cursor = await index.openCursor(IDBKeyRange.only(tabId));
  let eventCount = 0;
  let byteSize = 0;
  while (cursor) {
    const stored = cursor.value;
    byteSize += JSON.stringify(stored.entry).length;
    if (stored.entry.type === "rule-application") {
      eventCount += 1;
    }
    cursor = await cursor.continue();
  }
  await tx.done;
  return { eventCount, byteSize };
}

export async function clearTab(tabId: number): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const index = tx.store.index(BY_TAB_INDEX);
  let cursor = await index.openCursor(IDBKeyRange.only(tabId));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

// Test-only: wipe every tab between cases. Production callers should use
// clearTab — there's no UI affordance for clearing all tabs at once.
export async function __clearAllForTesting(): Promise<void> {
  const db = await getDb();
  await db.clear(STORE_NAME);
}

// Drop oldest events for `tabId` until the per-tab count is at or under
// `activeMaxPerTab`. Walks the by-tab index from the oldest end
// (autoincrement keys grow monotonically, so the cursor in "next"
// direction starts at the oldest record for this tab).
async function pruneTab(tabId: number): Promise<void> {
  const db = await getDb();
  const countTx = db.transaction(STORE_NAME, "readonly");
  const count = await countTx.store
    .index(BY_TAB_INDEX)
    .count(IDBKeyRange.only(tabId));
  await countTx.done;
  if (count <= activeMaxPerTab) {
    return;
  }
  const toDelete = count - activeMaxPerTab;
  const tx = db.transaction(STORE_NAME, "readwrite");
  const index = tx.store.index(BY_TAB_INDEX);
  let cursor = await index.openCursor(IDBKeyRange.only(tabId));
  let deleted = 0;
  while (cursor && deleted < toDelete) {
    await cursor.delete();
    deleted += 1;
    cursor = await cursor.continue();
  }
  await tx.done;
}

// Test-only: drop the cached connection so the next call re-opens the DB.
// Tests that exercise the upgrade path or use `fake-indexeddb` between
// cases call this in `afterEach`.
export function __resetDebugTraceStoreForTesting(): void {
  dbPromise = null;
  activeMaxPerTab = MAX_EVENTS_PER_TAB;
}

// Test-only: drop the per-tab cap to a small number so prune-path tests
// don't have to insert thousands of records to cross the threshold.
export function __setMaxEventsPerTabForTesting(value: number): void {
  activeMaxPerTab = value;
}
