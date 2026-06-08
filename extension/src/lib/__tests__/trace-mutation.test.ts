// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Covers the shared `traceMutation` wrapper that ~24 rules now route their
// DOM mutations through. Verifies: gate-off short-circuit (no serialization
// or sendMessage), before/after `outerHTML` reflects the mutation, the
// `captureFrom` override is honored for sibling-add patterns, and the
// auto-derived selector falls back to the element's tag#id.class shape.

import {
  __resetDebugTraceForTesting,
  __setDebugTraceEnabledForTesting,
} from "../debug-trace";
import type {
  DebugTraceEventMessage,
  RuleApplicationEvent,
} from "../detection-messages";
import { traceMutation } from "../trace-mutation";

let sendMessage: jest.Mock;

function ruleApplicationEvents(): RuleApplicationEvent[] {
  return sendMessage.mock.calls
    .map(([message]) => (message as DebugTraceEventMessage).entry)
    .filter(
      (entry): entry is { type: "rule-application" } & RuleApplicationEvent =>
        entry.type === "rule-application",
    );
}

beforeEach(() => {
  __resetDebugTraceForTesting();
  sendMessage = jest.fn().mockResolvedValue(undefined);
  (globalThis as { chrome: unknown }).chrome = {
    runtime: { sendMessage },
  };
  document.body.innerHTML = "";
});

afterEach(() => {
  __resetDebugTraceForTesting();
});

describe("traceMutation", () => {
  it("runs the mutator and emits nothing when the toggle is off", () => {
    __setDebugTraceEnabledForTesting(false);
    const target = document.createElement("p");
    target.textContent = "before";
    document.body.append(target);

    const result = traceMutation(
      { ruleId: "noscript-strip", kind: "strip", target },
      () => {
        target.textContent = "";
        return "done";
      },
    );

    expect(result).toBe("done");
    expect(target.textContent).toBe("");
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("captures outerHTML before and after when the toggle is on", () => {
    __setDebugTraceEnabledForTesting(true);
    const target = document.createElement("p");
    target.id = "msg";
    target.textContent = "before";
    document.body.append(target);

    traceMutation({ ruleId: "noscript-strip", kind: "strip", target }, () => {
      target.textContent = "";
    });

    const [event] = ruleApplicationEvents();
    expect(event?.ruleId).toBe("noscript-strip");
    expect(event?.kind).toBe("strip");
    expect(event?.selector).toBe("p#msg");
    expect(event?.beforeHtml).toBe('<p id="msg">before</p>');
    expect(event?.afterHtml).toBe('<p id="msg"></p>');
  });

  it("captures from the parent when captureFrom is set, so sibling chips appear in after", () => {
    __setDebugTraceEnabledForTesting(true);
    const parent = document.createElement("div");
    parent.id = "row";
    const link = document.createElement("a");
    link.href = "https://example.test";
    link.textContent = "click";
    parent.append(link);
    document.body.append(parent);

    traceMutation(
      {
        ruleId: "link-spoof-annotate",
        kind: "flag",
        target: link,
        captureFrom: parent,
      },
      () => {
        const chip = document.createElement("span");
        chip.textContent = "[abs: spoofed]";
        link.after(chip);
      },
    );

    const [event] = ruleApplicationEvents();
    expect(event?.beforeHtml).toContain('<a href="https://example.test">');
    expect(event?.beforeHtml).not.toContain("[abs: spoofed]");
    expect(event?.afterHtml).toContain("[abs: spoofed]");
  });

  it("honors an explicit selector override", () => {
    __setDebugTraceEnabledForTesting(true);
    const target = document.createElement("div");
    document.body.append(target);

    traceMutation(
      {
        ruleId: "ads-hide",
        kind: "hide",
        target,
        selector: ".cookie-banner, #consent",
      },
      () => {
        target.style.display = "none";
      },
    );

    expect(ruleApplicationEvents()[0]?.selector).toBe(
      ".cookie-banner, #consent",
    );
  });
});
