// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Verifies the per-frame rule-count reporter groups DOM nodes by the rule
// attribute they carry, dedups identical reports, and emits an empty
// payload on pagehide. Throttling is covered with jest fake timers — the
// 250 ms window is exercised by advancing the timer between mutations.

import type { DebugTraceStub } from "../../__test-mocks__/debug-trace-stub";
import { installDebugTraceStub } from "../../__test-mocks__/debug-trace-stub";
import type {
  RuleApplicationEvent,
  RuleCountMessage,
} from "../detection-messages";
import { HIDDEN_ATTR, RULE_ATTR } from "../dom-markers";
import {
  registerCssFirstSelectors,
  startRuleCountReporter,
} from "../rule-count";

let stub: DebugTraceStub;

function sentMessages(): RuleCountMessage[] {
  return stub.sendMessage.mock.calls
    .map(([message]) => message as { type: string })
    .filter(
      (message): message is RuleCountMessage => message.type === "rule-count",
    );
}

function sentCssOnlyTraces(): RuleApplicationEvent[] {
  return stub
    .sentEntries()
    .filter(
      (entry): entry is { type: "rule-application" } & RuleApplicationEvent =>
        entry.type === "rule-application" && entry.cssOnly === true,
    );
}

function makePlaceholder(ruleId: string): HTMLElement {
  const node = document.createElement("div");
  node.setAttribute(RULE_ATTR, ruleId);
  return node;
}

function makeHidden(ruleId: string): HTMLElement {
  const node = document.createElement("div");
  node.setAttribute(HIDDEN_ATTR, ruleId);
  return node;
}

let stop: (() => void) | null = null;

beforeEach(() => {
  jest.useFakeTimers();
  document.body.innerHTML = "";
  stub = installDebugTraceStub();
});

afterEach(() => {
  stop?.();
  stop = null;
  jest.useRealTimers();
  stub.reset();
});

describe("startRuleCountReporter", () => {
  it("groups counts by RULE_ATTR and HIDDEN_ATTR values", () => {
    document.body.append(
      makePlaceholder("pii-redact"),
      makePlaceholder("pii-redact"),
      makePlaceholder("cookie-banner-hide"),
      makeHidden("ads-hide"),
    );

    stop = startRuleCountReporter();

    const sent = sentMessages();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual({
      type: "rule-count",
      counts: {
        "pii-redact": 2,
        "cookie-banner-hide": 1,
        "ads-hide": 1,
      },
    });
  });

  it("sends an empty payload when the document has no markers", () => {
    stop = startRuleCountReporter();

    const sent = sentMessages();
    expect(sent).toEqual([{ type: "rule-count", counts: {} }]);
  });

  it("dedups identical re-counts so quiet pages send one message", async () => {
    document.body.append(makePlaceholder("pii-redact"));
    stop = startRuleCountReporter();

    document.body.append(document.createElement("section"));
    // MutationObserver dispatches on a microtask — flush before advancing
    // the throttle window so the throttle's trailing call sees the
    // up-to-date DOM. Without this flush, advancing timers fires the
    // trailing callback before the observer has triggered.
    await Promise.resolve();
    jest.advanceTimersByTime(300);

    const sent = sentMessages();
    expect(sent).toHaveLength(1);
  });

  it("re-reports when counts change between throttle windows", async () => {
    document.body.append(makePlaceholder("pii-redact"));
    stop = startRuleCountReporter();

    document.body.append(makePlaceholder("pii-redact"));
    await Promise.resolve();
    jest.advanceTimersByTime(300);

    const sent = sentMessages();
    expect(sent).toHaveLength(2);
    expect(sent.at(-1)?.counts).toEqual({ "pii-redact": 2 });
  });

  it("emits cssOnly trace events for CSS-first matches when the trace toggle is on", () => {
    stub.setEnabled(true);
    const widget = document.createElement("div");
    widget.id = "intercom-frame";
    document.body.append(widget);

    const unregister = registerCssFirstSelectors(
      "chat-widget-hide",
      "#intercom-frame",
    );
    stop = startRuleCountReporter();

    const traces = sentCssOnlyTraces();
    expect(traces).toHaveLength(1);
    expect(traces[0]?.ruleId).toBe("chat-widget-hide");
    expect(traces[0]?.kind).toBe("hide");
    expect(traces[0]?.selector).toBe("#intercom-frame");
    expect(traces[0]?.beforeHtml).toBe(traces[0]?.afterHtml);
    expect(traces[0]?.beforeHtml).toContain('id="intercom-frame"');
    unregister();
  });

  it("dedupes cssOnly trace events for the same element across recounts", async () => {
    stub.setEnabled(true);
    const widget = document.createElement("div");
    widget.id = "intercom-frame";
    document.body.append(widget);

    const unregister = registerCssFirstSelectors(
      "chat-widget-hide",
      "#intercom-frame",
    );
    stop = startRuleCountReporter();

    // Force a second sweep by mutating the DOM and flushing the throttle.
    document.body.append(document.createElement("section"));
    await Promise.resolve();
    jest.advanceTimersByTime(300);

    expect(sentCssOnlyTraces()).toHaveLength(1);
    unregister();
  });

  it("emits no cssOnly trace events when the trace toggle is off", () => {
    stub.setEnabled(false);
    const widget = document.createElement("div");
    widget.id = "intercom-frame";
    document.body.append(widget);

    const unregister = registerCssFirstSelectors(
      "chat-widget-hide",
      "#intercom-frame",
    );
    stop = startRuleCountReporter();

    expect(sentCssOnlyTraces()).toHaveLength(0);
    unregister();
  });

  it("flushes an empty payload on pagehide so the background decrements the frame", () => {
    document.body.append(makePlaceholder("pii-redact"));
    stop = startRuleCountReporter();

    globalThis.dispatchEvent(new Event("pagehide"));

    const sent = sentMessages();
    expect(sent.at(-1)).toEqual({ type: "rule-count", counts: {} });
  });
});
