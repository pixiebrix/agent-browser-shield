// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Function-level tests for createSubtreeWatcher. The watcher backs every
// rule that re-scans lazily-injected subtrees (chat widgets, cookie banners,
// newsletter modals, cross-origin frames, selector-hide-rule with
// watchSubtrees, irrelevant-sections-redact). Existing rule tests cover the
// happy path transitively; this file pins down the throttle, the
// skipPlaceholderSubtrees gating, and the start/stop lifecycle.

import { PLACEHOLDER_CLASS } from "../placeholder";
import { createSubtreeWatcher } from "../subtree-watcher";

const THROTTLE_MS = 250;

async function flushMutations(): Promise<void> {
  await Promise.resolve();
}

beforeEach(() => {
  document.body.innerHTML = "";
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  // Some tests flip document.hidden; restore so they don't leak state.
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
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
});
