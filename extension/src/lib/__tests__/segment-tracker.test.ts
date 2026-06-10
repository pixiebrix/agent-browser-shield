// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Exercises the segment-tracker against the route-change emitter, modal
// detection via subtree-watcher, and the burst-flush hook. The dev-mode
// trace toggle is forced on for these tests so the recorder emits — the
// trace's gating behavior itself is covered in debug-trace.test.ts.

// The recorder emits via the typed `lib/messenger` wrapper; mock it so
// `installDebugTraceStub` can read the captured entries off a jest mock.
jest.mock("../messenger", () => ({
  reportDebugTraceEvent: jest.fn(),
}));

import type { DebugTraceStub } from "../../__test-mocks__/debug-trace-stub";
import { installDebugTraceStub } from "../../__test-mocks__/debug-trace-stub";
import type { SegmentMarker } from "../detection-messages";
import { __resetRouteChangeForTesting } from "../route-change";
import {
  __resetSegmentTrackerForTesting,
  startSegmentTracker,
} from "../segment-tracker";
import { __resetSubtreeWatcherForTesting } from "../subtree-watcher";

let stub: DebugTraceStub;

function segmentEvents(): SegmentMarker[] {
  return stub
    .sentEntries()
    .filter(
      (entry): entry is SegmentMarker & { type: "segment" } =>
        entry.type === "segment",
    );
}

beforeEach(() => {
  jest.useFakeTimers();
  __resetRouteChangeForTesting();
  __resetSubtreeWatcherForTesting();
  __resetSegmentTrackerForTesting();
  document.body.innerHTML = "";
  history.replaceState(null, "", "/initial");
  stub = installDebugTraceStub();
  stub.setEnabled(true);
});

afterEach(() => {
  __resetSegmentTrackerForTesting();
  __resetSubtreeWatcherForTesting();
  __resetRouteChangeForTesting();
  stub.reset();
  jest.useRealTimers();
});

describe("startSegmentTracker", () => {
  it("emits an initial-load segment on start", async () => {
    startSegmentTracker();
    // initial-load is deferred behind the debug-trace init promise so a
    // page-reload doesn't fire it before the persisted toggle has been
    // loaded — see segment-tracker.ts. Flush the microtask.
    await Promise.resolve();
    const segments = segmentEvents();
    expect(segments).toHaveLength(1);
    expect(segments[0]?.kind).toBe("initial-load");
  });

  it("emits a route-change segment when the URL changes", async () => {
    startSegmentTracker();
    await Promise.resolve();
    history.replaceState(null, "", "/next");
    globalThis.dispatchEvent(new Event("popstate"));

    const segments = segmentEvents();
    expect(segments.map((s) => s.kind)).toEqual([
      "initial-load",
      "route-change",
    ]);
  });

  it("emits a modal-open segment when a [role=dialog][aria-modal=true] node is inserted", async () => {
    startSegmentTracker();
    // Mutation observer dispatches on a microtask; flush before
    // exercising the assertion.
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    document.body.append(dialog);
    await Promise.resolve();
    jest.advanceTimersByTime(300);

    const segments = segmentEvents();
    expect(segments.map((s) => s.kind)).toContain("modal-open");
  });

  it("throttles repeated modal-open detections within the throttle window", async () => {
    startSegmentTracker();
    for (let i = 0; i < 3; i += 1) {
      const dialog = document.createElement("div");
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      document.body.append(dialog);
      await Promise.resolve();
      jest.advanceTimersByTime(300);
    }

    const modalOpens = segmentEvents().filter((s) => s.kind === "modal-open");
    // Throttle leading-edge fires once; trailing is disabled so the rest
    // collapse into the same window.
    expect(modalOpens).toHaveLength(1);
  });

  it("idempotent — second startSegmentTracker call does not emit a second initial-load", async () => {
    startSegmentTracker();
    startSegmentTracker();
    await Promise.resolve();
    const initials = segmentEvents().filter((s) => s.kind === "initial-load");
    expect(initials).toHaveLength(1);
  });
});
