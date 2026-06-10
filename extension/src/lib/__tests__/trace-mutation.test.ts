// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Covers the shared `traceMutation` wrapper that ~24 rules now route their
// DOM mutations through. Verifies: gate-off short-circuit (no serialization
// or emission), before/after `outerHTML` reflects the mutation, the
// `captureFrom` override is honored for sibling-add patterns, and the
// auto-derived selector falls back to the element's tag#id.class shape.

// The recorder emits via the typed `lib/messenger` wrapper; mock it so the
// real `webext-messenger` never loads in jsdom and `installDebugTraceStub` can
// read the captured entries.
jest.mock("../messenger", () => ({
  reportDebugTraceEvent: jest.fn(),
}));

import type { DebugTraceStub } from "../../__test-mocks__/debug-trace-stub";
import { installDebugTraceStub } from "../../__test-mocks__/debug-trace-stub";
import type { RuleApplicationEvent } from "../detection-messages";
import { traceMutation } from "../trace-mutation";

let stub: DebugTraceStub;

function ruleApplicationEvents(): RuleApplicationEvent[] {
  return stub
    .sentEntries()
    .filter(
      (entry): entry is { type: "rule-application" } & RuleApplicationEvent =>
        entry.type === "rule-application",
    );
}

beforeEach(() => {
  stub = installDebugTraceStub();
  document.body.innerHTML = "";
});

afterEach(() => {
  stub.reset();
});

describe("traceMutation", () => {
  it("runs the mutator and emits nothing when the toggle is off", () => {
    stub.setEnabled(false);
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
    expect(stub.events).not.toHaveBeenCalled();
  });

  it("captures outerHTML before and after when the toggle is on", () => {
    stub.setEnabled(true);
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
    stub.setEnabled(true);
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
    stub.setEnabled(true);
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
