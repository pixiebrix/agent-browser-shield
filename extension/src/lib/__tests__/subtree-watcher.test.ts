// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Function-level tests for createSubtreeWatcher. The watcher backs every
// rule that re-scans lazily-injected subtrees (chat widgets, cookie banners,
// newsletter modals, cross-origin frames, selector-hide-rule with
// watchSubtrees, irrelevant-sections-redact). Existing rule tests cover the
// happy path transitively; this file pins down the throttle, the
// skipPlaceholderSubtrees gating, and the start/stop lifecycle.

import { PLACEHOLDER_CLASS } from "../placeholder";
import { __resetRouteChangeForTesting } from "../route-change";
import {
  __resetShadowRootsForTesting,
  installShadowRootHook,
} from "../shadow-roots";
import {
  __resetSubtreeWatcherForTesting,
  createSubtreeWatcher,
} from "../subtree-watcher";

const THROTTLE_MS = 250;

async function flushMutations(): Promise<void> {
  await Promise.resolve();
}

beforeEach(() => {
  document.body.innerHTML = "";
  jest.useFakeTimers();
  __resetRouteChangeForTesting();
  __resetSubtreeWatcherForTesting();
  __resetShadowRootsForTesting();
  // The attachShadow patch itself is idempotent and persists across tests,
  // but installing it inside beforeEach lets tests that exercise shadow
  // behavior run regardless of whether content.ts has been imported.
  installShadowRootHook();
  history.replaceState(null, "", "/initial");
});

afterEach(() => {
  jest.useRealTimers();
  // Some tests flip document.hidden; restore so they don't leak state.
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
  __resetRouteChangeForTesting();
  __resetSubtreeWatcherForTesting();
  __resetShadowRootsForTesting();
});

describe("createSubtreeWatcher", () => {
  it("invokes onSubtrees with newly-added subtree roots", async () => {
    const onSubtrees = jest.fn();
    const watcher = createSubtreeWatcher({ onSubtrees });
    watcher.start(document.body);

    const div = document.createElement("div");
    div.id = "lazy";
    document.body.append(div);

    await flushMutations();
    jest.advanceTimersByTime(THROTTLE_MS);

    expect(onSubtrees).toHaveBeenCalledTimes(1);
    const [roots] = onSubtrees.mock.calls[0] as [Element[]];
    expect(roots).toContain(div);
    watcher.stop();
  });

  it("coalesces a burst of additions into a single onSubtrees call", async () => {
    const onSubtrees = jest.fn();
    const watcher = createSubtreeWatcher({ onSubtrees });
    watcher.start(document.body);

    for (let i = 0; i < 5; i++) {
      const div = document.createElement("div");
      div.dataset.index = String(i);
      document.body.append(div);
    }

    await flushMutations();
    jest.advanceTimersByTime(THROTTLE_MS);

    // Trailing-only throttle: the burst collapses into a single drain at
    // the end of the window.
    expect(onSubtrees).toHaveBeenCalledTimes(1);
    const [roots] = onSubtrees.mock.calls[0] as [Element[]];
    expect(roots).toHaveLength(5);
    watcher.stop();
  });

  it("does not fire on the leading edge — single call after one window", async () => {
    const onSubtrees = jest.fn();
    const watcher = createSubtreeWatcher({ onSubtrees });
    watcher.start(document.body);

    document.body.append(document.createElement("div"));
    await flushMutations();
    // Pre-window: nothing has fired yet.
    expect(onSubtrees).not.toHaveBeenCalled();

    // After the window closes: one drain.
    jest.advanceTimersByTime(THROTTLE_MS);
    expect(onSubtrees).toHaveBeenCalledTimes(1);
    watcher.stop();
  });

  it("skips text nodes — only element additions become subtree roots", async () => {
    const onSubtrees = jest.fn();
    const watcher = createSubtreeWatcher({ onSubtrees });
    watcher.start(document.body);

    document.body.append(document.createTextNode("plain text"));

    await flushMutations();
    jest.advanceTimersByTime(THROTTLE_MS);

    expect(onSubtrees).not.toHaveBeenCalled();
    watcher.stop();
  });

  it("filters disconnected subtrees out of the drain payload", async () => {
    const onSubtrees = jest.fn();
    const watcher = createSubtreeWatcher({ onSubtrees });
    watcher.start(document.body);

    const div = document.createElement("div");
    document.body.append(div);
    // Detach before the throttle fires — drain should drop it.
    div.remove();

    await flushMutations();
    jest.advanceTimersByTime(THROTTLE_MS);

    expect(onSubtrees).not.toHaveBeenCalled();
    watcher.stop();
  });

  describe("skipPlaceholderSubtrees", () => {
    it("drops added elements that are themselves placeholders", async () => {
      const onSubtrees = jest.fn();
      const watcher = createSubtreeWatcher({
        onSubtrees,
        skipPlaceholderSubtrees: true,
      });
      watcher.start(document.body);

      const placeholder = document.createElement("div");
      placeholder.classList.add(PLACEHOLDER_CLASS);
      document.body.append(placeholder);

      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);

      expect(onSubtrees).not.toHaveBeenCalled();
      watcher.stop();
    });

    it("drops added elements that live inside an existing placeholder", async () => {
      const onSubtrees = jest.fn();
      const watcher = createSubtreeWatcher({
        onSubtrees,
        skipPlaceholderSubtrees: true,
      });

      // Seed the DOM with a placeholder before start() so subsequent additions
      // inside it are filtered.
      const placeholder = document.createElement("div");
      placeholder.classList.add(PLACEHOLDER_CLASS);
      document.body.append(placeholder);
      watcher.start(document.body);

      const innerChild = document.createElement("section");
      placeholder.append(innerChild);

      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);

      expect(onSubtrees).not.toHaveBeenCalled();
      watcher.stop();
    });

    it("still surfaces non-placeholder additions when the option is on", async () => {
      const onSubtrees = jest.fn();
      const watcher = createSubtreeWatcher({
        onSubtrees,
        skipPlaceholderSubtrees: true,
      });
      watcher.start(document.body);

      const regular = document.createElement("div");
      regular.id = "regular";
      document.body.append(regular);

      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);

      expect(onSubtrees).toHaveBeenCalledTimes(1);
      watcher.stop();
    });

    it("includes placeholders when skipPlaceholderSubtrees is false (default)", async () => {
      const onSubtrees = jest.fn();
      const watcher = createSubtreeWatcher({ onSubtrees });
      watcher.start(document.body);

      const placeholder = document.createElement("div");
      placeholder.classList.add(PLACEHOLDER_CLASS);
      document.body.append(placeholder);

      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);

      expect(onSubtrees).toHaveBeenCalledTimes(1);
      watcher.stop();
    });
  });

  describe("lifecycle", () => {
    it("does not call onSubtrees before start()", async () => {
      const onSubtrees = jest.fn();
      createSubtreeWatcher({ onSubtrees });

      document.body.append(document.createElement("div"));
      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);

      expect(onSubtrees).not.toHaveBeenCalled();
    });

    it("does not call onSubtrees after stop()", async () => {
      const onSubtrees = jest.fn();
      const watcher = createSubtreeWatcher({ onSubtrees });
      watcher.start(document.body);
      watcher.stop();

      document.body.append(document.createElement("div"));
      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);

      expect(onSubtrees).not.toHaveBeenCalled();
    });

    it("is idempotent: a second start() while running is a no-op", async () => {
      const onSubtrees = jest.fn();
      const watcher = createSubtreeWatcher({ onSubtrees });
      watcher.start(document.body);
      // Second start without stop in between — should NOT install a second
      // observer (which would double-deliver every addition).
      watcher.start(document.body);

      const div = document.createElement("div");
      document.body.append(div);

      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);

      expect(onSubtrees).toHaveBeenCalledTimes(1);
      watcher.stop();
    });

    it("can be restarted after stop()", async () => {
      const onSubtrees = jest.fn();
      const watcher = createSubtreeWatcher({ onSubtrees });

      watcher.start(document.body);
      watcher.stop();
      watcher.start(document.body);

      const div = document.createElement("div");
      document.body.append(div);
      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);

      expect(onSubtrees).toHaveBeenCalledTimes(1);
      watcher.stop();
    });
  });

  describe("Document root handling", () => {
    it("observes document.body when passed the Document node", async () => {
      const onSubtrees = jest.fn();
      const watcher = createSubtreeWatcher({ onSubtrees });
      watcher.start(document);

      const div = document.createElement("div");
      document.body.append(div);
      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);

      expect(onSubtrees).toHaveBeenCalledTimes(1);
      watcher.stop();
    });
  });

  describe("custom throttle", () => {
    it("respects an explicit throttleMs (trailing-only)", async () => {
      const onSubtrees = jest.fn();
      const watcher = createSubtreeWatcher({
        onSubtrees,
        throttleMs: 1000,
      });
      watcher.start(document.body);

      document.body.append(document.createElement("div"));
      await flushMutations();

      // Within the window — no drain yet.
      jest.advanceTimersByTime(500);
      expect(onSubtrees).not.toHaveBeenCalled();

      // Cross the window — trailing call fires once.
      jest.advanceTimersByTime(600);
      await flushMutations();
      expect(onSubtrees).toHaveBeenCalledTimes(1);
      watcher.stop();
    });
  });

  describe("ignored tags", () => {
    it("drops <style> and <br> additions at enqueue", async () => {
      const onSubtrees = jest.fn();
      const watcher = createSubtreeWatcher({ onSubtrees });
      watcher.start(document.body);

      document.body.append(document.createElement("style"));
      document.body.append(document.createElement("br"));

      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);

      expect(onSubtrees).not.toHaveBeenCalled();
      watcher.stop();
    });

    it("still surfaces <script> additions (json-ld rules need them)", async () => {
      const onSubtrees = jest.fn();
      const watcher = createSubtreeWatcher({ onSubtrees });
      watcher.start(document.body);

      document.body.append(document.createElement("script"));

      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);

      expect(onSubtrees).toHaveBeenCalledTimes(1);
      watcher.stop();
    });

    it("still surfaces real-content additions alongside ignored ones", async () => {
      const onSubtrees = jest.fn();
      const watcher = createSubtreeWatcher({ onSubtrees });
      watcher.start(document.body);

      document.body.append(document.createElement("style"));
      const real = document.createElement("article");
      document.body.append(real);

      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);

      expect(onSubtrees).toHaveBeenCalledTimes(1);
      const [roots] = onSubtrees.mock.calls[0] as [Element[]];
      expect(roots).toEqual([real]);
      watcher.stop();
    });
  });

  describe("burst-size flush", () => {
    it("drains immediately once pending crosses the threshold", async () => {
      const onSubtrees = jest.fn();
      const watcher = createSubtreeWatcher({ onSubtrees });
      watcher.start(document.body);

      // 600 > BURST_FLUSH_THRESHOLD (512). Append synchronously so the
      // MutationObserver gets them all in one callback.
      const fragment = document.createDocumentFragment();
      for (let i = 0; i < 600; i++) {
        fragment.append(document.createElement("div"));
      }
      document.body.append(fragment);

      await flushMutations();
      // No timer advancement — the burst threshold should have flushed.
      expect(onSubtrees).toHaveBeenCalledTimes(1);
      const [roots] = onSubtrees.mock.calls[0] as [Element[]];
      expect(roots).toHaveLength(600);
      watcher.stop();
    });

    it("does not flush before the threshold (waits for the throttle)", async () => {
      const onSubtrees = jest.fn();
      const watcher = createSubtreeWatcher({ onSubtrees });
      watcher.start(document.body);

      // 100 < threshold — should wait out the throttle window.
      const fragment = document.createDocumentFragment();
      for (let i = 0; i < 100; i++) {
        fragment.append(document.createElement("div"));
      }
      document.body.append(fragment);

      await flushMutations();
      expect(onSubtrees).not.toHaveBeenCalled();

      jest.advanceTimersByTime(THROTTLE_MS);
      expect(onSubtrees).toHaveBeenCalledTimes(1);
      watcher.stop();
    });
  });

  describe("visibilitychange pause", () => {
    function setHidden(hidden: boolean): void {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: hidden,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    }

    it("stops delivering callbacks while document.hidden is true", async () => {
      const onSubtrees = jest.fn();
      const watcher = createSubtreeWatcher({ onSubtrees });
      watcher.start(document.body);

      setHidden(true);

      document.body.append(document.createElement("div"));
      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);

      expect(onSubtrees).not.toHaveBeenCalled();
      watcher.stop();
    });

    it("flushes the pending set when going hidden", async () => {
      const onSubtrees = jest.fn();
      const watcher = createSubtreeWatcher({ onSubtrees });
      watcher.start(document.body);

      // Enqueue while visible — no drain yet.
      document.body.append(document.createElement("div"));
      await flushMutations();
      expect(onSubtrees).not.toHaveBeenCalled();

      // Going hidden drains immediately so we don't sit on stale state.
      setHidden(true);
      expect(onSubtrees).toHaveBeenCalledTimes(1);
      watcher.stop();
    });

    it("resumes observing when the tab becomes visible again", async () => {
      const onSubtrees = jest.fn();
      const watcher = createSubtreeWatcher({ onSubtrees });
      watcher.start(document.body);

      setHidden(true);
      document.body.append(document.createElement("div"));
      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);
      expect(onSubtrees).not.toHaveBeenCalled();

      setHidden(false);

      document.body.append(document.createElement("div"));
      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);
      expect(onSubtrees).toHaveBeenCalledTimes(1);
      watcher.stop();
    });
  });

  describe("detached-subtree fast-path", () => {
    it("drops elements detached before the MO callback fires", async () => {
      const onSubtrees = jest.fn();
      const watcher = createSubtreeWatcher({ onSubtrees });
      watcher.start(document.body);

      // React-style reconciliation: add then remove inside one synchronous
      // block. The MutationObserver callback fires later in a microtask and
      // sees the addition record, but the element is already detached.
      const transient = document.createElement("div");
      document.body.append(transient);
      transient.remove();

      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);

      expect(onSubtrees).not.toHaveBeenCalled();
      watcher.stop();
    });

    it("still surfaces connected siblings of detached additions", async () => {
      const onSubtrees = jest.fn();
      const watcher = createSubtreeWatcher({ onSubtrees });
      watcher.start(document.body);

      const transient = document.createElement("div");
      document.body.append(transient);
      transient.remove();

      const stay = document.createElement("section");
      document.body.append(stay);

      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);

      expect(onSubtrees).toHaveBeenCalledTimes(1);
      const [roots] = onSubtrees.mock.calls[0] as [Element[]];
      expect(roots).toEqual([stay]);
      watcher.stop();
    });
  });

  describe("route-change re-sweep", () => {
    function fireRouteChange(toUrl: string): void {
      history.replaceState(null, "", toUrl);
      globalThis.dispatchEvent(new Event("popstate"));
    }

    it("sweeps document.body on the next animation frame after a route change", async () => {
      const onSubtrees = jest.fn();
      const watcher = createSubtreeWatcher({ onSubtrees });
      watcher.start(document.body);

      // Seed some content so document.body has something to scan.
      document.body.append(document.createElement("article"));
      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);
      // One drain from the seeded addition.
      expect(onSubtrees).toHaveBeenCalledTimes(1);
      onSubtrees.mockClear();

      fireRouteChange("/route-b");

      // Sweep is deferred to rAF — nothing fires synchronously.
      expect(onSubtrees).not.toHaveBeenCalled();
      jest.advanceTimersToNextFrame();

      expect(onSubtrees).toHaveBeenCalledTimes(1);
      const [roots] = onSubtrees.mock.calls[0] as [Element[]];
      expect(roots).toEqual([document.body]);
      watcher.stop();
    });

    it("cancels pending throttled drains so the rAF sweep is the only call", async () => {
      const onSubtrees = jest.fn();
      const watcher = createSubtreeWatcher({ onSubtrees });
      watcher.start(document.body);

      // Add a node but don't advance past the throttle window — pending is
      // non-empty when the route change comes in.
      document.body.append(document.createElement("div"));
      await flushMutations();
      expect(onSubtrees).not.toHaveBeenCalled();

      fireRouteChange("/route-b");
      jest.advanceTimersToNextFrame();
      // Single call: the rAF sweep with document.body. The throttle window's
      // drain of the in-flight addition must have been cancelled.
      expect(onSubtrees).toHaveBeenCalledTimes(1);
      const [roots] = onSubtrees.mock.calls[0] as [Element[]];
      expect(roots).toEqual([document.body]);

      // Even after the throttle window would have fired, no second call.
      jest.advanceTimersByTime(THROTTLE_MS);
      expect(onSubtrees).toHaveBeenCalledTimes(1);
      watcher.stop();
    });

    it("does not sweep when the watcher is stopped before the rAF fires", () => {
      const onSubtrees = jest.fn();
      const watcher = createSubtreeWatcher({ onSubtrees });
      watcher.start(document.body);

      fireRouteChange("/route-b");
      watcher.stop();
      jest.advanceTimersToNextFrame();

      expect(onSubtrees).not.toHaveBeenCalled();
    });

    it("does not sweep while the tab is hidden", () => {
      const onSubtrees = jest.fn();
      const watcher = createSubtreeWatcher({ onSubtrees });
      watcher.start(document.body);

      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: true,
      });
      fireRouteChange("/route-b");
      jest.advanceTimersToNextFrame();

      expect(onSubtrees).not.toHaveBeenCalled();
      watcher.stop();
    });

    it("coalesces consecutive route changes into a single rAF sweep", () => {
      const onSubtrees = jest.fn();
      const watcher = createSubtreeWatcher({ onSubtrees });
      watcher.start(document.body);

      fireRouteChange("/route-b");
      fireRouteChange("/route-c");
      fireRouteChange("/route-d");

      jest.advanceTimersToNextFrame();
      expect(onSubtrees).toHaveBeenCalledTimes(1);
      watcher.stop();
    });
  });

  describe("cross-state interactions", () => {
    function setHidden(hidden: boolean): void {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: hidden,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    }

    function fireRouteChange(toUrl: string): void {
      history.replaceState(null, "", toUrl);
      globalThis.dispatchEvent(new Event("popstate"));
    }

    it("cancels the scheduled rAF sweep when the tab hides between route change and frame", () => {
      const onSubtrees = jest.fn();
      const watcher = createSubtreeWatcher({ onSubtrees });
      watcher.start(document.body);

      fireRouteChange("/route-b");
      // Tab goes hidden BEFORE the rAF fires — the scheduled sweep checks
      // document.hidden inside the rAF and bails.
      setHidden(true);

      jest.advanceTimersToNextFrame();

      expect(onSubtrees).not.toHaveBeenCalled();
      watcher.stop();
    });

    it("burst flush followed by route change: each fires once", async () => {
      const onSubtrees = jest.fn();
      const watcher = createSubtreeWatcher({ onSubtrees });
      watcher.start(document.body);

      // Burst above threshold drains immediately.
      const fragment = document.createDocumentFragment();
      for (let i = 0; i < 600; i++) {
        fragment.append(document.createElement("div"));
      }
      document.body.append(fragment);
      await flushMutations();
      expect(onSubtrees).toHaveBeenCalledTimes(1);

      // Then a route change schedules its own rAF sweep.
      fireRouteChange("/route-b");
      jest.advanceTimersToNextFrame();
      expect(onSubtrees).toHaveBeenCalledTimes(2);

      const [secondCallRoots] = onSubtrees.mock.calls[1] as [Element[]];
      expect(secondCallRoots).toEqual([document.body]);
      watcher.stop();
    });

    it("mutations during the rAF wait drain on the next throttle window", async () => {
      const onSubtrees = jest.fn();
      const watcher = createSubtreeWatcher({ onSubtrees });
      watcher.start(document.body);

      fireRouteChange("/route-b");
      // A mutation arrives between the route-change signal and the rAF.
      document.body.append(document.createElement("article"));
      await flushMutations();

      jest.advanceTimersToNextFrame();
      // Route sweep ran with document.body.
      expect(onSubtrees).toHaveBeenCalledTimes(1);
      const [firstCallRoots] = onSubtrees.mock.calls[0] as [Element[]];
      expect(firstCallRoots).toEqual([document.body]);

      // The mid-wait mutation still drains on its own throttle window
      // — not swallowed by the route-change cancellation, since it
      // arrived AFTER the cancel.
      jest.advanceTimersByTime(THROTTLE_MS);
      expect(onSubtrees).toHaveBeenCalledTimes(2);
      watcher.stop();
    });

    it("visibility flushes pending and a route change while hidden does not sweep", async () => {
      const onSubtrees = jest.fn();
      const watcher = createSubtreeWatcher({ onSubtrees });
      watcher.start(document.body);

      document.body.append(document.createElement("div"));
      await flushMutations();
      // Hide → pending drains via flush.
      setHidden(true);
      expect(onSubtrees).toHaveBeenCalledTimes(1);

      // Route change while hidden — listener still fires (we subscribe in
      // start, not start-when-visible), but the rAF guards on hidden.
      fireRouteChange("/route-b");
      jest.advanceTimersToNextFrame();
      expect(onSubtrees).toHaveBeenCalledTimes(1);
      watcher.stop();
    });

    it("route change after a normal drain still triggers the rAF sweep", async () => {
      const onSubtrees = jest.fn();
      const watcher = createSubtreeWatcher({ onSubtrees });
      watcher.start(document.body);

      document.body.append(document.createElement("div"));
      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);
      expect(onSubtrees).toHaveBeenCalledTimes(1);

      // Pending is empty when the route change comes in — the rAF still
      // schedules and sweeps from document.body.
      fireRouteChange("/route-b");
      jest.advanceTimersToNextFrame();
      expect(onSubtrees).toHaveBeenCalledTimes(2);
      const [secondCallRoots] = onSubtrees.mock.calls[1] as [Element[]];
      expect(secondCallRoots).toEqual([document.body]);
      watcher.stop();
    });
  });

  describe("shared mutation router", () => {
    // The router collapses N watchers on the same root into one
    // MutationObserver. These tests pin down that the fan-out preserves
    // per-subscriber options and that router lifecycle tracks the last
    // subscriber.

    function setHidden(hidden: boolean): void {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: hidden,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    }

    it("fans out a single mutation to every watcher on the same root", async () => {
      const a = jest.fn();
      const b = jest.fn();
      const watcherA = createSubtreeWatcher({ onSubtrees: a });
      const watcherB = createSubtreeWatcher({ onSubtrees: b });
      watcherA.start(document.body);
      watcherB.start(document.body);

      const div = document.createElement("div");
      document.body.append(div);

      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);

      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenCalledTimes(1);
      const [aRoots] = a.mock.calls[0] as [Element[]];
      const [bRoots] = b.mock.calls[0] as [Element[]];
      expect(aRoots).toEqual([div]);
      expect(bRoots).toEqual([div]);

      watcherA.stop();
      watcherB.stop();
    });

    it("instantiates one MutationObserver for two watchers on the same root", () => {
      const constructorSpy = jest.fn();
      const RealMutationObserver = globalThis.MutationObserver;
      class CountingObserver extends RealMutationObserver {
        constructor(callback: MutationCallback) {
          super(callback);
          constructorSpy();
        }
      }
      globalThis.MutationObserver = CountingObserver;

      try {
        const watcherA = createSubtreeWatcher({ onSubtrees: jest.fn() });
        const watcherB = createSubtreeWatcher({ onSubtrees: jest.fn() });
        watcherA.start(document.body);
        watcherB.start(document.body);

        expect(constructorSpy).toHaveBeenCalledTimes(1);

        watcherA.stop();
        watcherB.stop();
      } finally {
        globalThis.MutationObserver = RealMutationObserver;
      }
    });

    it("keeps per-subscriber skipPlaceholderSubtrees independent", async () => {
      const skipping = jest.fn();
      const seeing = jest.fn();
      const watcherSkip = createSubtreeWatcher({
        onSubtrees: skipping,
        skipPlaceholderSubtrees: true,
      });
      const watcherSee = createSubtreeWatcher({ onSubtrees: seeing });
      watcherSkip.start(document.body);
      watcherSee.start(document.body);

      const placeholder = document.createElement("div");
      placeholder.classList.add(PLACEHOLDER_CLASS);
      document.body.append(placeholder);

      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);

      // Skipping subscriber drops the placeholder; the other still gets it.
      expect(skipping).not.toHaveBeenCalled();
      expect(seeing).toHaveBeenCalledTimes(1);

      watcherSkip.stop();
      watcherSee.stop();
    });

    it("respects independent throttleMs per subscriber", async () => {
      const fast = jest.fn();
      const slow = jest.fn();
      const watcherFast = createSubtreeWatcher({
        onSubtrees: fast,
        throttleMs: 100,
      });
      const watcherSlow = createSubtreeWatcher({
        onSubtrees: slow,
        throttleMs: 1000,
      });
      watcherFast.start(document.body);
      watcherSlow.start(document.body);

      document.body.append(document.createElement("div"));
      await flushMutations();

      jest.advanceTimersByTime(150);
      // Fast window closed; slow one still open.
      expect(fast).toHaveBeenCalledTimes(1);
      expect(slow).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1000);
      expect(slow).toHaveBeenCalledTimes(1);

      watcherFast.stop();
      watcherSlow.stop();
    });

    it("keeps observing after one of two watchers on a root stops", async () => {
      const a = jest.fn();
      const b = jest.fn();
      const watcherA = createSubtreeWatcher({ onSubtrees: a });
      const watcherB = createSubtreeWatcher({ onSubtrees: b });
      watcherA.start(document.body);
      watcherB.start(document.body);

      watcherA.stop();

      const div = document.createElement("div");
      document.body.append(div);
      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);

      expect(a).not.toHaveBeenCalled();
      expect(b).toHaveBeenCalledTimes(1);
      watcherB.stop();
    });

    it("stops observing once the last watcher on a root stops", async () => {
      const a = jest.fn();
      const b = jest.fn();
      const watcherA = createSubtreeWatcher({ onSubtrees: a });
      const watcherB = createSubtreeWatcher({ onSubtrees: b });
      watcherA.start(document.body);
      watcherB.start(document.body);
      watcherA.stop();
      watcherB.stop();

      document.body.append(document.createElement("div"));
      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);

      expect(a).not.toHaveBeenCalled();
      expect(b).not.toHaveBeenCalled();
    });

    it("treats Document and document.body as the same router target", async () => {
      // Both call sites should share one observer because resolveTarget
      // collapses Document → its body.
      const constructorSpy = jest.fn();
      const RealMutationObserver = globalThis.MutationObserver;
      class CountingObserver extends RealMutationObserver {
        constructor(callback: MutationCallback) {
          super(callback);
          constructorSpy();
        }
      }
      globalThis.MutationObserver = CountingObserver;

      try {
        const a = jest.fn();
        const b = jest.fn();
        const watcherA = createSubtreeWatcher({ onSubtrees: a });
        const watcherB = createSubtreeWatcher({ onSubtrees: b });
        watcherA.start(document);
        watcherB.start(document.body);

        expect(constructorSpy).toHaveBeenCalledTimes(1);

        document.body.append(document.createElement("div"));
        await flushMutations();
        jest.advanceTimersByTime(THROTTLE_MS);
        expect(a).toHaveBeenCalledTimes(1);
        expect(b).toHaveBeenCalledTimes(1);

        watcherA.stop();
        watcherB.stop();
      } finally {
        globalThis.MutationObserver = RealMutationObserver;
      }
    });

    it("uses separate routers for distinct roots (body vs. head)", async () => {
      const bodyCallback = jest.fn();
      const headCallback = jest.fn();
      const bodyWatcher = createSubtreeWatcher({ onSubtrees: bodyCallback });
      const headWatcher = createSubtreeWatcher({ onSubtrees: headCallback });
      bodyWatcher.start(document.body);
      headWatcher.start(document.head);

      const meta = document.createElement("meta");
      document.head.append(meta);

      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);

      expect(headCallback).toHaveBeenCalledTimes(1);
      expect(bodyCallback).not.toHaveBeenCalled();

      bodyWatcher.stop();
      headWatcher.stop();
    });

    it("fans out a route-change sweep to every subscriber on the same root", () => {
      const a = jest.fn();
      const b = jest.fn();
      const watcherA = createSubtreeWatcher({ onSubtrees: a });
      const watcherB = createSubtreeWatcher({ onSubtrees: b });
      watcherA.start(document.body);
      watcherB.start(document.body);

      history.replaceState(null, "", "/route-b");
      globalThis.dispatchEvent(new Event("popstate"));
      jest.advanceTimersToNextFrame();

      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenCalledTimes(1);
      const [aRoots] = a.mock.calls[0] as [Element[]];
      const [bRoots] = b.mock.calls[0] as [Element[]];
      expect(aRoots).toEqual([document.body]);
      expect(bRoots).toEqual([document.body]);

      watcherA.stop();
      watcherB.stop();
    });

    it("flushes every subscriber's pending on visibilitychange to hidden", async () => {
      const a = jest.fn();
      const b = jest.fn();
      const watcherA = createSubtreeWatcher({ onSubtrees: a });
      const watcherB = createSubtreeWatcher({ onSubtrees: b });
      watcherA.start(document.body);
      watcherB.start(document.body);

      document.body.append(document.createElement("div"));
      await flushMutations();
      expect(a).not.toHaveBeenCalled();
      expect(b).not.toHaveBeenCalled();

      setHidden(true);
      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenCalledTimes(1);

      watcherA.stop();
      watcherB.stop();
    });
  });

  describe("observeAttributes", () => {
    // Opt-in: only subscribers with observeAttributes:true hear about
    // id/class mutations on already-inserted nodes. Other subscribers
    // on the same router are unaffected.

    it("delivers an attribute mutation as a subtree root", async () => {
      const onSubtrees = jest.fn();
      const watcher = createSubtreeWatcher({
        onSubtrees,
        observeAttributes: true,
      });
      watcher.start(document.body);

      const div = document.createElement("div");
      document.body.append(div);
      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);
      // Initial drain from the addition itself.
      expect(onSubtrees).toHaveBeenCalledTimes(1);
      onSubtrees.mockClear();

      // Mutate an observed attribute — should fire onSubtrees a second
      // time with the same div as the root.
      div.id = "now-i-have-an-id";
      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);

      expect(onSubtrees).toHaveBeenCalledTimes(1);
      const [roots] = onSubtrees.mock.calls[0] as [Element[]];
      expect(roots).toEqual([div]);
      watcher.stop();
    });

    it("delivers a class mutation as a subtree root", async () => {
      const onSubtrees = jest.fn();
      const watcher = createSubtreeWatcher({
        onSubtrees,
        observeAttributes: true,
      });
      watcher.start(document.body);

      const div = document.createElement("div");
      document.body.append(div);
      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);
      onSubtrees.mockClear();

      div.classList.add("late-class");
      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);

      expect(onSubtrees).toHaveBeenCalledTimes(1);
      const [roots] = onSubtrees.mock.calls[0] as [Element[]];
      expect(roots).toEqual([div]);
      watcher.stop();
    });

    it("ignores attribute mutations for subscribers that did not opt in", async () => {
      // Two subscribers on document.body: one opted in, one not. A
      // post-insert attribute mutation fires only the opted-in one.
      const optedIn = jest.fn();
      const optedOut = jest.fn();
      const watcherIn = createSubtreeWatcher({
        onSubtrees: optedIn,
        observeAttributes: true,
      });
      const watcherOut = createSubtreeWatcher({ onSubtrees: optedOut });
      watcherIn.start(document.body);
      watcherOut.start(document.body);

      const div = document.createElement("div");
      document.body.append(div);
      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);
      optedIn.mockClear();
      optedOut.mockClear();

      div.id = "post-insert-id";
      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);

      expect(optedIn).toHaveBeenCalledTimes(1);
      expect(optedOut).not.toHaveBeenCalled();

      watcherIn.stop();
      watcherOut.stop();
    });

    it("upgrades the shared MO when an attribute subscriber joins after a non-attribute one", async () => {
      // Order matters: the first subscriber doesn't want attributes, so
      // the router starts with childList+subtree only. When a second
      // subscriber with observeAttributes joins, the MO must be
      // re-configured so attribute mutations actually fire.
      const optedOut = jest.fn();
      const optedIn = jest.fn();
      const watcherOut = createSubtreeWatcher({ onSubtrees: optedOut });
      const watcherIn = createSubtreeWatcher({
        onSubtrees: optedIn,
        observeAttributes: true,
      });

      watcherOut.start(document.body);
      watcherIn.start(document.body);

      const div = document.createElement("div");
      document.body.append(div);
      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);
      optedIn.mockClear();
      optedOut.mockClear();

      div.classList.add("late-class");
      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);

      expect(optedIn).toHaveBeenCalledTimes(1);
      expect(optedOut).not.toHaveBeenCalled();

      watcherIn.stop();
      watcherOut.stop();
    });

    it("downgrades the shared MO when the last attribute subscriber stops", async () => {
      // The opted-in watcher leaves; the remaining (non-opted) watcher
      // should no longer be re-routed attribute mutations.
      const optedIn = jest.fn();
      const optedOut = jest.fn();
      const watcherIn = createSubtreeWatcher({
        onSubtrees: optedIn,
        observeAttributes: true,
      });
      const watcherOut = createSubtreeWatcher({ onSubtrees: optedOut });

      watcherIn.start(document.body);
      watcherOut.start(document.body);

      const div = document.createElement("div");
      document.body.append(div);
      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);

      // Verify the in watcher is actually getting attribute mutations
      // while it's still subscribed.
      optedIn.mockClear();
      div.id = "first";
      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);
      expect(optedIn).toHaveBeenCalledTimes(1);

      // Drop the opted-in watcher. The remaining opted-out watcher
      // should not see subsequent attribute mutations even though it's
      // still active on the same router.
      watcherIn.stop();
      optedOut.mockClear();

      div.id = "second";
      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);
      expect(optedOut).not.toHaveBeenCalled();

      watcherOut.stop();
    });

    it("drops attribute mutations on placeholder elements when skipPlaceholderSubtrees is on", async () => {
      // Same gate as childList: a class change on a placeholder element
      // doesn't surface to subscribers that asked to skip placeholders.
      const onSubtrees = jest.fn();
      const watcher = createSubtreeWatcher({
        onSubtrees,
        observeAttributes: true,
        skipPlaceholderSubtrees: true,
      });

      const placeholder = document.createElement("div");
      placeholder.classList.add(PLACEHOLDER_CLASS);
      document.body.append(placeholder);
      watcher.start(document.body);

      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);
      onSubtrees.mockClear();

      // Add an unrelated id to the placeholder. The attribute mutation
      // fires, but the placeholder gate filters it out.
      placeholder.id = "x";
      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);

      expect(onSubtrees).not.toHaveBeenCalled();
      watcher.stop();
    });

    it("filters detached targets out of attribute-mutation drains", async () => {
      // If the element is detached by the time the MO callback fires,
      // the enqueue should drop it — same isConnected gate as childList.
      const onSubtrees = jest.fn();
      const watcher = createSubtreeWatcher({
        onSubtrees,
        observeAttributes: true,
      });
      watcher.start(document.body);

      const div = document.createElement("div");
      document.body.append(div);
      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);
      onSubtrees.mockClear();

      // Mutate attribute, then detach before the MO microtask runs.
      div.id = "transient";
      div.remove();
      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);

      expect(onSubtrees).not.toHaveBeenCalled();
      watcher.stop();
    });

    it("does not fire on attribute mutations when no subscriber opted in", async () => {
      // Sanity check: pre-existing rules that don't opt in keep seeing
      // exactly the childList shape they did before — even when an
      // attribute mutates on the observed root.
      const onSubtrees = jest.fn();
      const watcher = createSubtreeWatcher({ onSubtrees });
      watcher.start(document.body);

      const div = document.createElement("div");
      document.body.append(div);
      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);
      onSubtrees.mockClear();

      div.id = "should-not-fire";
      div.classList.add("also-should-not-fire");
      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);

      expect(onSubtrees).not.toHaveBeenCalled();
      watcher.stop();
    });
  });

  describe("shadow DOM", () => {
    it("dispatches existing open-shadow children when the watcher starts", async () => {
      // Page script attaches a shadow root and populates it before our
      // content script (and therefore the watcher) starts — the
      // discovery walk at startRouter time should pick the contents up.
      const host = document.createElement("div");
      host.id = "host";
      const shadow = host.attachShadow({ mode: "open" });
      const inner = document.createElement("section");
      inner.id = "in-shadow";
      shadow.append(inner);
      document.body.append(host);

      const onSubtrees = jest.fn();
      const watcher = createSubtreeWatcher({ onSubtrees });
      watcher.start(document.body);

      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);

      expect(onSubtrees).toHaveBeenCalledTimes(1);
      const [roots] = onSubtrees.mock.calls[0] as [Element[]];
      expect(roots).toContain(inner);
      watcher.stop();
    });

    it("does not look into closed shadow roots", async () => {
      // Closed shadow roots are opt-out by design — the host's
      // .shadowRoot property is null to external code, and we
      // deliberately don't register them in the tracker.
      const host = document.createElement("div");
      const shadow = host.attachShadow({ mode: "closed" });
      const inner = document.createElement("section");
      inner.id = "in-closed-shadow";
      shadow.append(inner);
      document.body.append(host);

      const onSubtrees = jest.fn();
      const watcher = createSubtreeWatcher({ onSubtrees });
      watcher.start(document.body);

      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);

      // host itself wasn't observed as an addition (watcher started
      // after the host was already in the body), and the closed shadow
      // is invisible — no subtree should surface.
      expect(onSubtrees).not.toHaveBeenCalled();
      watcher.stop();
    });

    it("observes mutations inside open shadow roots after start", async () => {
      const host = document.createElement("div");
      const shadow = host.attachShadow({ mode: "open" });
      document.body.append(host);

      const onSubtrees = jest.fn();
      const watcher = createSubtreeWatcher({ onSubtrees });
      watcher.start(document.body);

      // Flush the empty-shadow bootstrap so the mutation below is the
      // only thing the next drain will surface.
      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);
      onSubtrees.mockClear();

      const inner = document.createElement("article");
      shadow.append(inner);

      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);

      expect(onSubtrees).toHaveBeenCalledTimes(1);
      const [roots] = onSubtrees.mock.calls[0] as [Element[]];
      expect(roots).toContain(inner);
      watcher.stop();
    });

    it("observes shadow roots attached AFTER the watcher started", async () => {
      // Custom elements often call attachShadow inside connectedCallback,
      // which fires after the host is in the DOM. The patched
      // attachShadow notifies the router so the new root is observed.
      const host = document.createElement("div");
      document.body.append(host);

      const onSubtrees = jest.fn();
      const watcher = createSubtreeWatcher({ onSubtrees });
      watcher.start(document.body);

      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);
      onSubtrees.mockClear();

      const shadow = host.attachShadow({ mode: "open" });
      const inner = document.createElement("section");
      shadow.append(inner);

      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);

      expect(onSubtrees).toHaveBeenCalledTimes(1);
      const [roots] = onSubtrees.mock.calls[0] as [Element[]];
      expect(roots).toContain(inner);
      watcher.stop();
    });

    it("dispatches a pre-populated shadow on a freshly inserted host", async () => {
      // Web components built in a constructor or upgrade callback ship
      // their shadow tree at insertion time. Discovery during the host's
      // light-tree dispatch catches the shadow contents in the same
      // drain — without it, those would be silently missed.
      const onSubtrees = jest.fn();
      const watcher = createSubtreeWatcher({ onSubtrees });
      watcher.start(document.body);

      const host = document.createElement("div");
      const shadow = host.attachShadow({ mode: "open" });
      const inner = document.createElement("section");
      inner.id = "lazy-shadow";
      shadow.append(inner);

      // attachShadow + populate happened before the host was connected;
      // dispatch should surface both the host (light) and the shadow
      // child when the host is appended.
      document.body.append(host);

      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);

      expect(onSubtrees).toHaveBeenCalledTimes(1);
      const [roots] = onSubtrees.mock.calls[0] as [Element[]];
      expect(roots).toContain(host);
      expect(roots).toContain(inner);
      watcher.stop();
    });

    it("recurses through nested shadow roots", async () => {
      const outerHost = document.createElement("div");
      const outerShadow = outerHost.attachShadow({ mode: "open" });
      const innerHost = document.createElement("section");
      const innerShadow = innerHost.attachShadow({ mode: "open" });
      const leaf = document.createElement("article");
      leaf.id = "deep";
      innerShadow.append(leaf);
      outerShadow.append(innerHost);
      document.body.append(outerHost);

      const onSubtrees = jest.fn();
      const watcher = createSubtreeWatcher({ onSubtrees });
      watcher.start(document.body);

      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);

      const allRoots = (onSubtrees.mock.calls as Array<[Element[]]>).flatMap(
        (call) => call[0],
      );
      expect(allRoots).toContain(innerHost);
      expect(allRoots).toContain(leaf);
      watcher.stop();
    });

    it("seeds a late-joining subscriber from existing shadow content", async () => {
      const host = document.createElement("div");
      const shadow = host.attachShadow({ mode: "open" });
      const inner = document.createElement("section");
      shadow.append(inner);
      document.body.append(host);

      const firstOnSubtrees = jest.fn();
      const first = createSubtreeWatcher({ onSubtrees: firstOnSubtrees });
      first.start(document.body);
      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);

      // Second subscriber joins after the router has already adopted the
      // shadow root. It should still receive the existing children.
      const secondOnSubtrees = jest.fn();
      const second = createSubtreeWatcher({ onSubtrees: secondOnSubtrees });
      second.start(document.body);

      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);

      expect(secondOnSubtrees).toHaveBeenCalledTimes(1);
      const [roots] = secondOnSubtrees.mock.calls[0] as [Element[]];
      expect(roots).toContain(inner);
      first.stop();
      second.stop();
    });

    it("respects skipPlaceholderSubtrees inside shadow roots", async () => {
      // A rule that injected a placeholder into a shadow tree shouldn't
      // re-trigger itself on the next sweep.
      const host = document.createElement("div");
      const shadow = host.attachShadow({ mode: "open" });
      const placeholder = document.createElement("div");
      placeholder.classList.add(PLACEHOLDER_CLASS);
      shadow.append(placeholder);
      document.body.append(host);

      const onSubtrees = jest.fn();
      const watcher = createSubtreeWatcher({
        onSubtrees,
        skipPlaceholderSubtrees: true,
      });
      watcher.start(document.body);

      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);

      expect(onSubtrees).not.toHaveBeenCalled();
      watcher.stop();
    });

    it("does not adopt shadows attached to nodes outside the router target", async () => {
      // A router targeting document.head shouldn't end up observing a
      // shadow whose host lives in document.body. Two routers run side
      // by side so we can confirm only the body-rooted one fires.
      const bodyOnSubtrees = jest.fn();
      const headOnSubtrees = jest.fn();
      const bodyWatcher = createSubtreeWatcher({ onSubtrees: bodyOnSubtrees });
      const headWatcher = createSubtreeWatcher({ onSubtrees: headOnSubtrees });
      bodyWatcher.start(document.body);
      headWatcher.start(document.head);

      const host = document.createElement("div");
      const shadow = host.attachShadow({ mode: "open" });
      const inner = document.createElement("section");
      shadow.append(inner);
      document.body.append(host);

      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);

      const bodyRoots = (
        bodyOnSubtrees.mock.calls as Array<[Element[]]>
      ).flatMap((call) => call[0]);
      expect(bodyRoots).toContain(inner);
      expect(headOnSubtrees).not.toHaveBeenCalled();

      bodyWatcher.stop();
      headWatcher.stop();
    });

    it("stops observing shadow roots after the watcher stops", async () => {
      const host = document.createElement("div");
      const shadow = host.attachShadow({ mode: "open" });
      document.body.append(host);

      const onSubtrees = jest.fn();
      const watcher = createSubtreeWatcher({ onSubtrees });
      watcher.start(document.body);
      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);

      watcher.stop();
      onSubtrees.mockClear();

      shadow.append(document.createElement("article"));
      await flushMutations();
      jest.advanceTimersByTime(THROTTLE_MS);

      expect(onSubtrees).not.toHaveBeenCalled();
    });
  });
});
