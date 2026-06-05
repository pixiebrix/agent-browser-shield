// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Direct unit tests for the selector-hide-rule factory. Today the factory
// is only covered transitively through the 6 rules built on top of it
// (chat-widget, cookie-banner, comments-redact, footer-redact,
// newsletter-modal-hide, reviews-redact); this file pins down the factory's
// own contracts (constructor validation, URL-gated selector composition,
// placeholder-skip, candidateFilter, removeEntirely vs placeholder).

import { URLPattern } from "urlpattern-polyfill";
import { HIDDEN_ATTR } from "../dom-markers";
import { PLACEHOLDER_CLASS } from "../placeholder";
import { createSelectorHideRule } from "../selector-hide-rule";
import type { RuleId } from "../storage";

const RULE_ID = "footer-redact" as RuleId;
const HIDE_LABEL = "[hidden — click to reveal]";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("createSelectorHideRule constructor", () => {
  it("throws when hideLabel is omitted and removeEntirely is false", () => {
    expect(() =>
      createSelectorHideRule({
        id: RULE_ID,
        label: "test",
        description: "test",
        alwaysOnSelectors: ["footer"],
        // hideLabel intentionally omitted, removeEntirely defaults to false
      }),
    ).toThrow(/hideLabel is required/);
  });

  it("does not throw when removeEntirely is true and hideLabel is omitted", () => {
    expect(() =>
      createSelectorHideRule({
        id: RULE_ID,
        label: "test",
        description: "test",
        alwaysOnSelectors: ["footer"],
        removeEntirely: true,
      }),
    ).not.toThrow();
  });

  it("does not throw when hideLabel is set even without removeEntirely", () => {
    expect(() =>
      createSelectorHideRule({
        id: RULE_ID,
        label: "test",
        description: "test",
        alwaysOnSelectors: ["footer"],
        hideLabel: HIDE_LABEL,
      }),
    ).not.toThrow();
  });
});

describe("selectorsFor URL composition", () => {
  it("returns only alwaysOnSelectors when no siteRules are configured", () => {
    const { selectorsFor } = createSelectorHideRule({
      id: RULE_ID,
      label: "test",
      description: "test",
      alwaysOnSelectors: ["footer", '[role="contentinfo"]'],
      hideLabel: HIDE_LABEL,
    });

    expect(selectorsFor("https://example.com/")).toEqual([
      "footer",
      '[role="contentinfo"]',
    ]);
  });

  it("adds site-rule selectors when a pattern matches the URL", () => {
    const { selectorsFor } = createSelectorHideRule({
      id: RULE_ID,
      label: "test",
      description: "test",
      alwaysOnSelectors: ["footer"],
      siteRules: [
        {
          patterns: [new URLPattern({ hostname: "{*.}?amazon.{*}" })],
          selectors: ["#navFooter"],
        },
      ],
      hideLabel: HIDE_LABEL,
    });

    expect(selectorsFor("https://www.amazon.com/dp/X")).toEqual([
      "footer",
      "#navFooter",
    ]);
  });

  it("omits site-rule selectors whose patterns don't match", () => {
    const { selectorsFor } = createSelectorHideRule({
      id: RULE_ID,
      label: "test",
      description: "test",
      alwaysOnSelectors: ["footer"],
      siteRules: [
        {
          patterns: [new URLPattern({ hostname: "{*.}?amazon.{*}" })],
          selectors: ["#navFooter"],
        },
      ],
      hideLabel: HIDE_LABEL,
    });

    expect(selectorsFor("https://example.com/")).toEqual(["footer"]);
  });

  it("merges selectors from every matching site rule", () => {
    const { selectorsFor } = createSelectorHideRule({
      id: RULE_ID,
      label: "test",
      description: "test",
      alwaysOnSelectors: ["footer"],
      siteRules: [
        {
          patterns: [new URLPattern({ hostname: "{*.}?amazon.{*}" })],
          selectors: ["#navFooter"],
        },
        {
          patterns: [new URLPattern({ pathname: "/dp/*" })],
          selectors: [".product-footer"],
        },
      ],
      hideLabel: HIDE_LABEL,
    });

    expect(selectorsFor("https://www.amazon.com/dp/X")).toEqual([
      "footer",
      "#navFooter",
      ".product-footer",
    ]);
  });
});

describe("scan behavior", () => {
  it("short-circuits when the effective selector list is empty", () => {
    // No alwaysOnSelectors and no matching siteRules → empty list → no scan.
    // Build a DOM with a footer; it should remain.
    const { rule } = createSelectorHideRule({
      id: RULE_ID,
      label: "test",
      description: "test",
      alwaysOnSelectors: [],
      hideLabel: HIDE_LABEL,
    });
    document.body.innerHTML = `<footer id="f">copyright</footer>`;

    rule.apply(document.body);

    expect(document.querySelector("#f")).not.toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });

  it("applies candidateFilter to narrow querySelectorAll results", () => {
    // Filter only keeps elements with an `id` starting with "keep-".
    const { rule } = createSelectorHideRule({
      id: RULE_ID,
      label: "test",
      description: "test",
      alwaysOnSelectors: [".target"],
      candidateFilter: (element) => element.id.startsWith("keep-"),
      hideLabel: HIDE_LABEL,
    });
    document.body.innerHTML = `
      <div class="target" id="keep-1">a</div>
      <div class="target" id="drop-1">b</div>
      <div class="target" id="keep-2">c</div>
    `;

    rule.apply(document.body);

    // The two "keep-*" elements get replaced; "drop-1" stays.
    expect(document.querySelector("#drop-1")).not.toBeNull();
    expect(document.querySelector("#keep-1")).toBeNull();
    expect(document.querySelector("#keep-2")).toBeNull();
    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(2);
  });

  it("skips an element that is itself a placeholder", () => {
    // A selector that would match the placeholder element itself — the rule
    // must not re-process its own output.
    const { rule } = createSelectorHideRule({
      id: RULE_ID,
      label: "test",
      description: "test",
      alwaysOnSelectors: ["div"],
      candidateFilter: (element) =>
        element.classList.contains(PLACEHOLDER_CLASS),
      hideLabel: HIDE_LABEL,
    });
    document.body.innerHTML = `<div class="${PLACEHOLDER_CLASS}">already a placeholder</div>`;

    rule.apply(document.body);

    // No second placeholder created, no replacement.
    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(1);
  });

  it("skips an element that lives inside an existing placeholder", () => {
    const { rule } = createSelectorHideRule({
      id: RULE_ID,
      label: "test",
      description: "test",
      alwaysOnSelectors: ["footer"],
      hideLabel: HIDE_LABEL,
    });
    document.body.innerHTML = `
      <div class="${PLACEHOLDER_CLASS}">
        <footer id="inner">should stay</footer>
      </div>
    `;

    rule.apply(document.body);

    // Inner <footer> stays untouched, no new placeholder created.
    expect(document.querySelector("#inner")).not.toBeNull();
    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(1);
  });

  it("skips an element previously revealed for this rule (REVEALED_ATTR)", () => {
    const { rule } = createSelectorHideRule({
      id: RULE_ID,
      label: "test",
      description: "test",
      alwaysOnSelectors: ["footer"],
      hideLabel: HIDE_LABEL,
    });
    document.body.innerHTML = `<footer id="f" data-abs-revealed="${RULE_ID}">revealed</footer>`;

    rule.apply(document.body);

    expect(document.querySelector("#f")).not.toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });

  it("does not skip an element revealed for a different rule", () => {
    const { rule } = createSelectorHideRule({
      id: RULE_ID,
      label: "test",
      description: "test",
      alwaysOnSelectors: ["footer"],
      hideLabel: HIDE_LABEL,
    });
    document.body.innerHTML = `<footer id="f" data-abs-revealed="some-other-rule">x</footer>`;

    rule.apply(document.body);

    expect(document.querySelector("#f")).toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).not.toBeNull();
  });
});

describe("removeEntirely behavior", () => {
  it("hides matches in place with display:none + HIDDEN_ATTR", () => {
    const { rule } = createSelectorHideRule({
      id: RULE_ID,
      label: "test",
      description: "test",
      alwaysOnSelectors: ["#widget"],
      removeEntirely: true,
    });
    document.body.innerHTML = `<div id="widget">chat widget</div>`;

    rule.apply(document.body);

    const widget = document.querySelector<HTMLElement>("#widget");
    expect(widget).not.toBeNull();
    expect(widget?.style.display).toBe("none");
    expect(widget?.getAttribute(HIDDEN_ATTR)).toBe(RULE_ID);
    // No placeholder for removeEntirely — placeholders are dead space for
    // floating overlays.
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });

  it("skips an element already marked HIDDEN_ATTR for this rule", () => {
    const { rule } = createSelectorHideRule({
      id: RULE_ID,
      label: "test",
      description: "test",
      alwaysOnSelectors: ["#widget"],
      removeEntirely: true,
    });
    document.body.innerHTML = `<div id="widget" data-abs-hidden="${RULE_ID}" style="display: block">already hidden</div>`;

    rule.apply(document.body);

    // Existing style is preserved — the rule short-circuits via HIDDEN_ATTR.
    expect(document.querySelector<HTMLElement>("#widget")?.style.display).toBe(
      "block",
    );
  });
});

describe("outermost-match dedupe", () => {
  it("replaces only the outermost match when nested candidates both qualify", () => {
    const { rule } = createSelectorHideRule({
      id: RULE_ID,
      label: "test",
      description: "test",
      alwaysOnSelectors: ["footer"],
      hideLabel: HIDE_LABEL,
    });
    document.body.innerHTML = `
      <footer id="outer">
        <footer id="inner">nested</footer>
      </footer>
    `;

    rule.apply(document.body);

    // Inner is subsumed by outer's replacement; only one placeholder lands.
    expect(document.querySelector("#outer")).toBeNull();
    expect(document.querySelector("#inner")).toBeNull();
    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(1);
  });
});

describe("rule shape", () => {
  it("attaches teardown when watchSubtrees is true", () => {
    const { rule } = createSelectorHideRule({
      id: RULE_ID,
      label: "test",
      description: "test",
      alwaysOnSelectors: ["footer"],
      hideLabel: HIDE_LABEL,
      watchSubtrees: true,
    });

    expect(rule.teardown).toBeDefined();
  });

  it("omits teardown when watchSubtrees is false", () => {
    const { rule } = createSelectorHideRule({
      id: RULE_ID,
      label: "test",
      description: "test",
      alwaysOnSelectors: ["footer"],
      hideLabel: HIDE_LABEL,
    });

    expect(rule.teardown).toBeUndefined();
  });

  it("propagates topFrameOnly to the rule descriptor", () => {
    const { rule } = createSelectorHideRule({
      id: RULE_ID,
      label: "test",
      description: "test",
      alwaysOnSelectors: ["footer"],
      hideLabel: HIDE_LABEL,
      topFrameOnly: true,
    });

    expect(rule.topFrameOnly).toBe(true);
  });
});

describe("placeholder vs removeEntirely uses the right code path", () => {
  it("uses replaceWithBlockPlaceholder when removeEntirely is false", () => {
    const { rule } = createSelectorHideRule({
      id: RULE_ID,
      label: "test",
      description: "test",
      alwaysOnSelectors: ["#target"],
      hideLabel: HIDE_LABEL,
    });
    document.body.innerHTML = `<div id="target">x</div>`;

    rule.apply(document.body);

    expect(document.querySelector("#target")).toBeNull();
    const placeholder = document.querySelector(`.${PLACEHOLDER_CLASS}`);
    expect(placeholder).not.toBeNull();
    expect(placeholder?.textContent).toContain(HIDE_LABEL);
  });
});

describe("REVEALED_ATTR ancestor skip", () => {
  it("skips an element whose ancestor is a revealed marker for this rule", () => {
    // REVEALED_ATTR is also propagated to ancestors via element.closest, so
    // a footer nested inside an already-revealed wrapper for this rule
    // should not be re-hidden.
    const { rule } = createSelectorHideRule({
      id: RULE_ID,
      label: "test",
      description: "test",
      alwaysOnSelectors: ["footer"],
      hideLabel: HIDE_LABEL,
    });
    document.body.innerHTML = `
      <div data-abs-revealed="${RULE_ID}">
        <footer id="inner">x</footer>
      </div>
    `;

    rule.apply(document.body);

    expect(document.querySelector("#inner")).not.toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });
});
