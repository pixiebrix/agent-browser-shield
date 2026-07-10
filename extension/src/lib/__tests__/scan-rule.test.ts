// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Direct unit tests for the createScanRule lifecycle factory. The ~15 rules
// built on it (scarcity-redact, json-ld-sanitize, hidden-text-strip, …) each
// cover their own scan logic; this file pins the factory's own contract: it
// scans once on apply, re-scans subtrees the shared watcher surfaces, forwards
// skipPlaceholderSubtrees, and stops observing on teardown.

import { PLACEHOLDER_CLASS } from "../placeholder";
import { __resetRouteChangeForTesting } from "../route-change";
import { createScanRule } from "../scan-rule";
import type { RuleId } from "../storage";
import { __resetSubtreeWatcherForTesting } from "../subtree-watcher";

const RULE_ID = "scarcity-redact" as RuleId;

// createSubtreeWatcher's default throttle window.
const THROTTLE_MS = 250;

// A MutationObserver callback fires on a microtask; the throttled drain then
// fires after THROTTLE_MS. Yield the microtask, then advance the fake timer.
async function flushWatcher(): Promise<void> {
  await Promise.resolve();
  jest.advanceTimersByTime(THROTTLE_MS);
}

beforeEach(() => {
  document.body.replaceChildren();
  __resetSubtreeWatcherForTesting();
  __resetRouteChangeForTesting();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  __resetSubtreeWatcherForTesting();
  __resetRouteChangeForTesting();
});

describe("createScanRule rule shape", () => {
  it("builds a rule with the supplied id/label/description and a teardown", () => {
    const rule = createScanRule({
      id: RULE_ID,
      label: "Test Label",
      description: "Test description.",
      scan: jest.fn(),
    });

    expect(rule.id).toBe(RULE_ID);
    expect(rule.label).toBe("Test Label");
    expect(rule.description).toBe("Test description.");
    // The factory always installs a teardown — callers (and tests) can call it
    // without an optional-chaining guard.
    expect(typeof rule.teardown).toBe("function");
  });

  it("defaults topFrameOnly to false and forwards an explicit value", () => {
    const defaulted = createScanRule({
      id: RULE_ID,
      label: "l",
      description: "d",
      scan: jest.fn(),
    });
    expect(defaulted.topFrameOnly).toBe(false);

    const topOnly = createScanRule({
      id: RULE_ID,
      label: "l",
      description: "d",
      scan: jest.fn(),
      topFrameOnly: true,
    });
    expect(topOnly.topFrameOnly).toBe(true);
  });
});

describe("createScanRule lifecycle", () => {
  it("scans the root once synchronously on apply", () => {
    const scan = jest.fn();
    const rule = createScanRule({
      id: RULE_ID,
      label: "l",
      description: "d",
      scan,
    });

    rule.apply(document.body);

    expect(scan).toHaveBeenCalledTimes(1);
    expect(scan).toHaveBeenCalledWith(document.body);

    rule.teardown();
  });

  it("re-scans a subtree injected after apply", async () => {
    const scan = jest.fn();
    const rule = createScanRule({
      id: RULE_ID,
      label: "l",
      description: "d",
      scan,
    });

    rule.apply(document.body);
    scan.mockClear();

    const late = document.createElement("div");
    document.body.append(late);

    await flushWatcher();

    expect(scan).toHaveBeenCalledWith(late);

    rule.teardown();
  });

  it("does not re-scan placeholder subtrees when skipPlaceholderSubtrees is set", async () => {
    const scan = jest.fn();
    const rule = createScanRule({
      id: RULE_ID,
      label: "l",
      description: "d",
      scan,
      skipPlaceholderSubtrees: true,
    });

    rule.apply(document.body);
    scan.mockClear();

    // The rule's own inserted placeholder must not re-trigger its scan.
    const placeholder = document.createElement("div");
    placeholder.classList.add(PLACEHOLDER_CLASS);
    document.body.append(placeholder);

    await flushWatcher();

    expect(scan).not.toHaveBeenCalled();

    rule.teardown();
  });

  it("re-scans placeholder subtrees when skipPlaceholderSubtrees is not set", async () => {
    const scan = jest.fn();
    const rule = createScanRule({
      id: RULE_ID,
      label: "l",
      description: "d",
      scan,
    });

    rule.apply(document.body);
    scan.mockClear();

    const placeholder = document.createElement("div");
    placeholder.classList.add(PLACEHOLDER_CLASS);
    document.body.append(placeholder);

    await flushWatcher();

    expect(scan).toHaveBeenCalledWith(placeholder);

    rule.teardown();
  });

  it("stops observing after teardown", async () => {
    const scan = jest.fn();
    const rule = createScanRule({
      id: RULE_ID,
      label: "l",
      description: "d",
      scan,
    });

    rule.apply(document.body);
    rule.teardown();
    scan.mockClear();

    const late = document.createElement("div");
    document.body.append(late);

    await flushWatcher();

    expect(scan).not.toHaveBeenCalled();
  });
});
