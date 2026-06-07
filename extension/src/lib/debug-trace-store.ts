// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// IndexedDB persistence for the dev-mode rule-application trace. Lives at
// the extension origin (chrome-extension://<id>) so the background service
// worker, popup, and options page can all read/write the same store. The
// content script can't reach it directly — it runs in the page origin and
// would land in the page's IDB instead — so trace events ride a
// `chrome.runtime.sendMessage` over to the background, which persists them
// here.
//
// Why IDB over an in-memory ring buffer:
//   - MV3 service workers go to sleep between events. The popup must read
//     the full trace even after the SW restarts, which an in-memory buffer
//     would lose.
//   - outerHTML snapshots are heavy (1–5 KB each); persisting them outside
//     the SW heap means a busy page can accumulate hundreds of entries
//     without growing the SW's resident memory.
//
// Schema is intentionally append-only with one record per event. The
// `by-tab` index lets the popup pull a single tab's trace without
// scanning the full store; pruning keeps each tab capped at
// MAX_EVENTS_PER_TAB to bound disk growth on long-lived tabs that
// trigger heavy rule activity.

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
  await pruneTab(tabId, activeMaxPerTab);
}

// Get every stored event for a tab in insertion order. The autoincrement
// keys preserve insertion order so the index walk is naturally chronological.
export async function getEventsForTab(tabId: number): Promise<StoredEvent[]> {
  const db = await getDb();
  return db.getAllFromIndex(STORE_NAME, BY_TAB_INDEX, tabId);
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

export async function clearAll(): Promise<void> {
  const db = await getDb();
  await db.clear(STORE_NAME);
}

// Drop oldest events for `tabId` until the per-tab count is at or under
// `maxCount`. Walks the by-tab index from the oldest end (autoincrement
// keys grow monotonically, so the cursor in "next" direction starts at
// the oldest record for this tab).
async function pruneTab(tabId: number, maxCount: number): Promise<void> {
  const db = await getDb();
  const countTx = db.transaction(STORE_NAME, "readonly");
  const count = await countTx.store
    .index(BY_TAB_INDEX)
    .count(IDBKeyRange.only(tabId));
  await countTx.done;
  if (count <= maxCount) {
    return;
  }
  const toDelete = count - maxCount;
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
