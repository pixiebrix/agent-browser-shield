// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Tests for the token index that drives subtree dispatch. Two layers:
//   - parseSelector / registerRule / findTriggeredRules: pure data, no
//     DOM mutations needed.
//   - Shared-watcher dispatch: register two rules, mutate the DOM, advance
//     the throttle, assert each rule's dispatchScan only fires when its
//     tokens (or complex-fallback bucket) match.

import {
  __getIndexSnapshotForTesting,
  __resetSelectorTokenIndexForTesting,
  findTriggeredRules,
  parseSelector,
  registerRule,
} from "../selector-token-index";
import type { RuleId } from "../storage";
import { __resetSubtreeWatcherForTesting } from "../subtree-watcher";

const THROTTLE_MS = 250;
const RULE_A = "footer-redact" as RuleId;
const RULE_B = "comments-redact" as RuleId;
const RULE_C = "reviews-redact" as RuleId;

async function flushMutations(): Promise<void> {
  await Promise.resolve();
}

beforeEach(() => {
  document.body.replaceChildren();
  jest.useFakeTimers();
  __resetSelectorTokenIndexForTesting();
  __resetSubtreeWatcherForTesting();
});

afterEach(() => {
  jest.useRealTimers();
  __resetSelectorTokenIndexForTesting();
  __resetSubtreeWatcherForTesting();
});

describe("parseSelector", () => {
  it("returns kind=id for a bare #identifier", () => {
    expect(parseSelector("#hubspot")).toEqual({
      kind: "id",
      token: "hubspot",
    });
  });

  it("returns kind=class for a bare .identifier", () => {
    expect(parseSelector(".cookie-banner")).toEqual({
      kind: "class",
      token: "cookie-banner",
    });
  });

  it("trims surrounding whitespace before matching", () => {
    expect(parseSelector("  #foo  ")).toEqual({ kind: "id", token: "foo" });
  });

  it("accepts identifiers containing hyphens, underscores, digits", () => {
    expect(parseSelector("#a-b_c-9")).toEqual({
      kind: "id",
      token: "a-b_c-9",
    });
    expect(parseSelector(".one_two-3")).toEqual({
      kind: "class",
      token: "one_two-3",
    });
  });

  it("treats tag selectors as complex (no token bucket)", () => {
    expect(parseSelector("footer")).toEqual({ kind: "complex", token: "" });
    expect(parseSelector("div")).toEqual({ kind: "complex", token: "" });
  });

  it("treats compounds, combinators, attributes, pseudos as complex", () => {
    expect(parseSelector("div#foo")).toEqual({ kind: "complex", token: "" });
    expect(parseSelector(".a.b")).toEqual({ kind: "complex", token: "" });
    expect(parseSelector("#foo .child")).toEqual({
      kind: "complex",
      token: "",
    });
    expect(parseSelector('[role="dialog"]')).toEqual({
      kind: "complex",
      token: "",
    });
    expect(parseSelector('[id^="sp_message_"]')).toEqual({
      kind: "complex",
      token: "",
    });
    expect(parseSelector("a:hover")).toEqual({ kind: "complex", token: "" });
  });

  it("treats wildcard / empty selectors as complex", () => {
    expect(parseSelector("*")).toEqual({ kind: "complex", token: "" });
    expect(parseSelector("")).toEqual({ kind: "complex", token: "" });
  });
});

describe("registerRule index population", () => {
  it("buckets id and class selectors separately", () => {
    registerRule({
      ruleId: RULE_A,
      selectors: ["#nav-footer", ".site-footer", "#site-footer"],
      dispatchScan: jest.fn(),
    });

    const snap = __getIndexSnapshotForTesting();
    expect(snap.idIndex.get("nav-footer")).toEqual(new Set([RULE_A]));
    expect(snap.idIndex.get("site-footer")).toEqual(new Set([RULE_A]));
    expect(snap.classIndex.get("site-footer")).toEqual(new Set([RULE_A]));
    // No complex selectors among these — the rule should NOT land in
    // complexFallback, otherwise we'd over-trigger it on every batch.
    expect(snap.complexFallback.has(RULE_A)).toBe(false);
  });

  it("puts rules with any complex selector in the fallback bucket", () => {
    registerRule({
      ruleId: RULE_A,
      // Mixed: ".foo" is indexable, but "[role=dialog]" is not — we have
      // to fall back so the complex selector can still run.
      selectors: [".foo", '[role="dialog"]'],
      dispatchScan: jest.fn(),
    });

    const snap = __getIndexSnapshotForTesting();
    expect(snap.complexFallback.has(RULE_A)).toBe(true);
    expect(snap.classIndex.get("foo")).toEqual(new Set([RULE_A]));
  });

  it("puts a rule with no selectors at all in the fallback bucket", () => {
    // Defensive: a rule that registers an empty list (e.g., URL-gated
    // siteRules only, no alwaysOnSelectors) must still hear about every
    // batch so URL gating can pick up dispatched calls later.
    registerRule({
      ruleId: RULE_A,
      selectors: [],
      dispatchScan: jest.fn(),
    });

    expect(__getIndexSnapshotForTesting().complexFallback.has(RULE_A)).toBe(
      true,
    );
  });

  it("merges multiple rules under the same token", () => {
    registerRule({
      ruleId: RULE_A,
      selectors: [".overlay"],
      dispatchScan: jest.fn(),
    });
    registerRule({
      ruleId: RULE_B,
      selectors: [".overlay"],
      dispatchScan: jest.fn(),
    });

    expect(__getIndexSnapshotForTesting().classIndex.get("overlay")).toEqual(
      new Set([RULE_A, RULE_B]),
    );
  });

  it("unregister removes the rule from every bucket and the registry", () => {
    const cleanup = registerRule({
      ruleId: RULE_A,
      selectors: ["#nav-footer", ".site-footer", '[role="dialog"]'],
      dispatchScan: jest.fn(),
    });

    cleanup();
    const snap = __getIndexSnapshotForTesting();
    expect(snap.idIndex.size).toBe(0);
    expect(snap.classIndex.size).toBe(0);
    expect(snap.complexFallback.size).toBe(0);
  });

  it("unregister leaves the other rule sharing the same token intact", () => {
    const cleanupA = registerRule({
      ruleId: RULE_A,
      selectors: [".overlay"],
      dispatchScan: jest.fn(),
    });
    registerRule({
      ruleId: RULE_B,
      selectors: [".overlay"],
      dispatchScan: jest.fn(),
    });
    cleanupA();

    expect(__getIndexSnapshotForTesting().classIndex.get("overlay")).toEqual(
      new Set([RULE_B]),
    );
  });

  it("re-registering the same ruleId drops the older entry", () => {
    registerRule({
      ruleId: RULE_A,
      selectors: ["#one"],
      dispatchScan: jest.fn(),
    });
    registerRule({
      ruleId: RULE_A,
      selectors: ["#two"],
      dispatchScan: jest.fn(),
    });

    const snap = __getIndexSnapshotForTesting();
    expect(snap.idIndex.get("one")).toBeUndefined();
    expect(snap.idIndex.get("two")).toEqual(new Set([RULE_A]));
  });
});

describe("findTriggeredRules", () => {
  it("returns only the complex-fallback rules for a token-less element", () => {
    registerRule({
      ruleId: RULE_A,
      selectors: [".overlay"],
      dispatchScan: jest.fn(),
    });
    registerRule({
      ruleId: RULE_B,
      selectors: ['[role="dialog"]'],
      dispatchScan: jest.fn(),
    });

    const root = document.createElement("div");
    document.body.append(root);

    expect(findTriggeredRules(root)).toEqual(new Set([RULE_B]));
  });

  it("triggers a rule via the element's own id", () => {
    registerRule({
      ruleId: RULE_A,
      selectors: ["#hubspot"],
      dispatchScan: jest.fn(),
    });

    const root = document.createElement("div");
    root.id = "hubspot";
    document.body.append(root);

    expect(findTriggeredRules(root).has(RULE_A)).toBe(true);
  });

  it("triggers a rule via the element's own class", () => {
    registerRule({
      ruleId: RULE_A,
      selectors: [".overlay"],
      dispatchScan: jest.fn(),
    });

    const root = document.createElement("div");
    root.className = "overlay banner";
    document.body.append(root);

    expect(findTriggeredRules(root).has(RULE_A)).toBe(true);
  });

  it("triggers a rule via a descendant's token", () => {
    registerRule({
      ruleId: RULE_A,
      selectors: [".comment"],
      dispatchScan: jest.fn(),
    });

    const root = document.createElement("section");
    const child = document.createElement("article");
    child.className = "comment";
    root.append(child);
    document.body.append(root);

    expect(findTriggeredRules(root).has(RULE_A)).toBe(true);
  });

  it("does not trigger a non-matching rule even with descendants present", () => {
    registerRule({
      ruleId: RULE_A,
      selectors: [".not-here"],
      dispatchScan: jest.fn(),
    });
    registerRule({
      ruleId: RULE_B,
      selectors: ["#also-not-here"],
      dispatchScan: jest.fn(),
    });

    const root = document.createElement("div");
    root.className = "unrelated";
    const child = document.createElement("span");
    child.id = "other";
    root.append(child);
    document.body.append(root);

    expect(findTriggeredRules(root).size).toBe(0);
  });

  it("collects multiple class tokens on the same element", () => {
    registerRule({
      ruleId: RULE_A,
      selectors: [".a"],
      dispatchScan: jest.fn(),
    });
    registerRule({
      ruleId: RULE_B,
      selectors: [".b"],
      dispatchScan: jest.fn(),
    });

    const root = document.createElement("div");
    root.className = "a b";
    document.body.append(root);

    expect(findTriggeredRules(root)).toEqual(new Set([RULE_A, RULE_B]));
  });

  it("complex-fallback rules trigger even when no descendant has any token", () => {
    registerRule({
      ruleId: RULE_A,
      selectors: ['[role="contentinfo"]'],
      dispatchScan: jest.fn(),
    });

    const root = document.createElement("div");
    document.body.append(root);

    expect(findTriggeredRules(root)).toEqual(new Set([RULE_A]));
  });
});

describe("dispatch via the shared subtree watcher", () => {
  // End-to-end: register two rules, append elements that should only
  // trigger one of them, advance the throttle, and assert each rule's
  // dispatchScan fired (or didn't) with the right root.

  it("invokes a rule's dispatchScan with the added subtree root", async () => {
    const scanA = jest.fn();
    registerRule({
      ruleId: RULE_A,
      selectors: ["#hubspot"],
      dispatchScan: scanA,
    });

    const widget = document.createElement("div");
    widget.id = "hubspot";
    document.body.append(widget);

    await flushMutations();
    jest.advanceTimersByTime(THROTTLE_MS);

    expect(scanA).toHaveBeenCalledTimes(1);
    expect(scanA).toHaveBeenCalledWith(widget);
  });

  it("skips a rule whose tokens do not appear in the added subtree", async () => {
    const scanA = jest.fn();
    const scanB = jest.fn();
    registerRule({
      ruleId: RULE_A,
      selectors: ["#hubspot"],
      dispatchScan: scanA,
    });
    registerRule({
      ruleId: RULE_B,
      selectors: ["#onetrust"],
      dispatchScan: scanB,
    });

    const widget = document.createElement("div");
    widget.id = "hubspot";
    document.body.append(widget);

    await flushMutations();
    jest.advanceTimersByTime(THROTTLE_MS);

    expect(scanA).toHaveBeenCalledTimes(1);
    expect(scanB).not.toHaveBeenCalled();
  });

  it("always dispatches to complex-fallback rules on every batch", async () => {
    const fallbackScan = jest.fn();
    const tokenScan = jest.fn();
    registerRule({
      ruleId: RULE_A,
      selectors: ['[role="dialog"]'],
      dispatchScan: fallbackScan,
    });
    registerRule({
      ruleId: RULE_B,
      selectors: ["#hubspot"],
      dispatchScan: tokenScan,
    });

    // Add a node whose id doesn't match RULE_B; RULE_A's complex selector
    // can only be checked at scan time, so it must always fire.
    const unrelated = document.createElement("div");
    document.body.append(unrelated);

    await flushMutations();
    jest.advanceTimersByTime(THROTTLE_MS);

    expect(fallbackScan).toHaveBeenCalledTimes(1);
    expect(tokenScan).not.toHaveBeenCalled();
  });

  it("dispatches to multiple triggered rules with the same root", async () => {
    const scanA = jest.fn();
    const scanB = jest.fn();
    const scanC = jest.fn();
    registerRule({
      ruleId: RULE_A,
      selectors: [".overlay"],
      dispatchScan: scanA,
    });
    registerRule({
      ruleId: RULE_B,
      selectors: [".overlay"],
      dispatchScan: scanB,
    });
    registerRule({
      ruleId: RULE_C,
      selectors: ["#other"],
      dispatchScan: scanC,
    });

    const div = document.createElement("div");
    div.className = "overlay";
    document.body.append(div);

    await flushMutations();
    jest.advanceTimersByTime(THROTTLE_MS);

    expect(scanA).toHaveBeenCalledWith(div);
    expect(scanB).toHaveBeenCalledWith(div);
    expect(scanC).not.toHaveBeenCalled();
  });

  it("triggers via a descendant token: scan still gets the added root", async () => {
    const scanA = jest.fn();
    registerRule({
      ruleId: RULE_A,
      selectors: [".comment"],
      dispatchScan: scanA,
    });

    const wrapper = document.createElement("section");
    const comment = document.createElement("article");
    comment.className = "comment";
    wrapper.append(comment);
    document.body.append(wrapper);

    await flushMutations();
    jest.advanceTimersByTime(THROTTLE_MS);

    // The rule's scan receives the *outer* added root — its own QSA
    // will descend to find the .comment match.
    expect(scanA).toHaveBeenCalledWith(wrapper);
  });

  it("stops dispatching after unregister, even mid-burst", async () => {
    const scanA = jest.fn();
    const cleanup = registerRule({
      ruleId: RULE_A,
      selectors: [".overlay"],
      dispatchScan: scanA,
    });

    cleanup();

    const div = document.createElement("div");
    div.className = "overlay";
    document.body.append(div);

    await flushMutations();
    jest.advanceTimersByTime(THROTTLE_MS);

    expect(scanA).not.toHaveBeenCalled();
  });

  it("body-rooted sweep triggers every registered rule (route-change path)", () => {
    const scanA = jest.fn();
    const scanB = jest.fn();
    registerRule({
      ruleId: RULE_A,
      selectors: ["#nope-a"],
      dispatchScan: scanA,
    });
    registerRule({
      ruleId: RULE_B,
      selectors: ["#nope-b"],
      dispatchScan: scanB,
    });

    // Simulate the shared router's route-change sweep: subscriber
    // receives [document.body] regardless of pending mutations.
    history.replaceState(null, "", "/route-b");
    globalThis.dispatchEvent(new Event("popstate"));
    jest.advanceTimersToNextFrame();

    expect(scanA).toHaveBeenCalledWith(document.body);
    expect(scanB).toHaveBeenCalledWith(document.body);
  });
});
