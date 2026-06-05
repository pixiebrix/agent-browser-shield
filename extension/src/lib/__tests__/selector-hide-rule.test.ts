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
import { __resetRouteChangeForTesting } from "../route-change";
import { createSelectorHideRule } from "../selector-hide-rule";
import { __resetSelectorTokenIndexForTesting } from "../selector-token-index";
import type { RuleId } from "../storage";
import { __resetSubtreeWatcherForTesting } from "../subtree-watcher";

const RULE_ID = "footer-redact" as RuleId;
const HIDE_LABEL = "[hidden — click to reveal]";

beforeEach(() => {
  document.body.innerHTML = "";
  // Reset the shared dispatcher / watcher / route-change subscription so
  // tests that build watchSubtrees=true rules don't leak registrations
  // across cases.
  __resetSelectorTokenIndexForTesting();
  __resetSubtreeWatcherForTesting();
  __resetRouteChangeForTesting();
});

afterEach(() => {
  __resetSelectorTokenIndexForTesting();
  __resetSubtreeWatcherForTesting();
  __resetRouteChangeForTesting();
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

describe("selectorsFor memoization", () => {
  it("returns equal selector lists for repeated calls with the same URL", () => {
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

    const first = selectorsFor("https://www.amazon.com/dp/X");
    const second = selectorsFor("https://www.amazon.com/dp/X");
    expect(second).toEqual(first);
  });

  it("recomputes the selector list when the URL changes (memo invalidation)", () => {
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
    // Different URL — site rule must now apply.
    expect(selectorsFor("https://www.amazon.com/dp/X")).toEqual([
      "footer",
      "#navFooter",
    ]);
    // And switching back returns the original shape.
    expect(selectorsFor("https://example.com/")).toEqual(["footer"]);
  });

  it("returns a fresh array on each call — caller mutation does not poison the memo", () => {
    const { selectorsFor } = createSelectorHideRule({
      id: RULE_ID,
      label: "test",
      description: "test",
      alwaysOnSelectors: ["footer", "main"],
      hideLabel: HIDE_LABEL,
    });

    const first = selectorsFor("https://example.com/");
    first.push("INJECTED");
    first.pop();
    first.length = 0;

    // Subsequent call must not see any of the prior caller's mutations.
    expect(selectorsFor("https://example.com/")).toEqual(["footer", "main"]);
  });

  it("rules built from separate factory calls have independent memos", () => {
    const ruleA = createSelectorHideRule({
      id: RULE_ID,
      label: "test",
      description: "test",
      alwaysOnSelectors: ["footer"],
      hideLabel: HIDE_LABEL,
    });
    const ruleB = createSelectorHideRule({
      id: RULE_ID,
      label: "test",
      description: "test",
      alwaysOnSelectors: ["aside"],
      hideLabel: HIDE_LABEL,
    });

    // Same URL — but each rule's memo holds its own selector list.
    expect(ruleA.selectorsFor("https://example.com/")).toEqual(["footer"]);
    expect(ruleB.selectorsFor("https://example.com/")).toEqual(["aside"]);
    // And the second access to each is still its own value.
    expect(ruleA.selectorsFor("https://example.com/")).toEqual(["footer"]);
    expect(ruleB.selectorsFor("https://example.com/")).toEqual(["aside"]);
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

describe("scan from inserted root", () => {
  // Once the token-index dispatcher is online, the watcher hands each
  // rule the added subtree root — not document.body. The scan has to
  // match the root itself, not just its descendants; otherwise a
  // widget whose top-level container is the match (HubSpot, OneTrust,
  // Cookiebot) slips through every batch.

  it("matches the root element itself when its id matches a selector", () => {
    const { rule } = createSelectorHideRule({
      id: RULE_ID,
      label: "test",
      description: "test",
      alwaysOnSelectors: ["#hubspot-messages-iframe-container"],
      removeEntirely: true,
    });
    const widget = document.createElement("div");
    widget.id = "hubspot-messages-iframe-container";
    document.body.append(widget);

    // Scan from the widget itself (the dispatcher's call shape).
    rule.apply(widget);

    expect(widget.style.display).toBe("none");
    expect(widget.getAttribute(HIDDEN_ATTR)).toBe(RULE_ID);
  });

  it("matches the root element itself when one of its classes matches", () => {
    const { rule } = createSelectorHideRule({
      id: RULE_ID,
      label: "test",
      description: "test",
      alwaysOnSelectors: [".cookie-banner"],
      removeEntirely: true,
    });
    const banner = document.createElement("div");
    banner.className = "cookie-banner sticky";
    document.body.append(banner);

    rule.apply(banner);

    expect(banner.style.display).toBe("none");
  });

  it("still matches descendants of the root", () => {
    // The root itself doesn't match; a descendant does. The previous
    // behavior (scan from document.body) handled this; the new behavior
    // (scan from added root) must still walk descendants via QSA.
    const { rule } = createSelectorHideRule({
      id: RULE_ID,
      label: "test",
      description: "test",
      alwaysOnSelectors: [".inner-target"],
      hideLabel: HIDE_LABEL,
    });
    const wrapper = document.createElement("section");
    const inner = document.createElement("div");
    inner.className = "inner-target";
    inner.textContent = "x";
    wrapper.append(inner);
    document.body.append(wrapper);

    rule.apply(wrapper);

    expect(wrapper.querySelector(".inner-target")).toBeNull();
    expect(wrapper.querySelector(`.${PLACEHOLDER_CLASS}`)).not.toBeNull();
  });

  it("matches both root and a descendant when both qualify (outermost dedupe wins)", () => {
    // The outermost-match filter must still apply when scanning from
    // an added root that itself matches and contains a deeper match.
    const { rule } = createSelectorHideRule({
      id: RULE_ID,
      label: "test",
      description: "test",
      alwaysOnSelectors: ["footer"],
      hideLabel: HIDE_LABEL,
    });
    const outer = document.createElement("footer");
    outer.id = "outer";
    const inner = document.createElement("footer");
    inner.id = "inner";
    outer.append(inner);
    document.body.append(outer);

    rule.apply(outer);

    // Only one placeholder lands — outer subsumed inner.
    expect(document.querySelector("#outer")).toBeNull();
    expect(document.querySelector("#inner")).toBeNull();
    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(1);
  });
});

describe("subtree dispatcher integration", () => {
  // Verifies the end-to-end path: watchSubtrees=true rule's apply
  // registers with the token index, a mutation lands on document.body,
  // the shared dispatcher routes to this rule, scan runs on the added
  // root.

  const THROTTLE_MS = 250;

  async function flushMutations(): Promise<void> {
    await Promise.resolve();
  }

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("hides a top-level container injected after apply", async () => {
    // The classic chat-widget shape: rule mounts first, then the
    // vendor script injects the widget container as a direct child of
    // document.body. With watchSubtrees=true the dispatcher catches it.
    const { rule } = createSelectorHideRule({
      id: RULE_ID,
      label: "test",
      description: "test",
      alwaysOnSelectors: ["#late-widget"],
      removeEntirely: true,
      watchSubtrees: true,
    });

    rule.apply(document.body);

    const widget = document.createElement("div");
    widget.id = "late-widget";
    document.body.append(widget);

    await flushMutations();
    jest.advanceTimersByTime(THROTTLE_MS);

    expect(widget.style.display).toBe("none");

    rule.teardown?.();
  });

  it("ignores additions whose tokens don't appear in this rule's selectors", async () => {
    // Index dispatch means we shouldn't even run the rule's scan
    // (no QSA on the added subtree) when no token matches.
    const { rule } = createSelectorHideRule({
      id: RULE_ID,
      label: "test",
      description: "test",
      alwaysOnSelectors: ["#target"],
      removeEntirely: true,
      watchSubtrees: true,
    });

    rule.apply(document.body);

    const unrelated = document.createElement("div");
    unrelated.id = "something-else";
    document.body.append(unrelated);

    await flushMutations();
    jest.advanceTimersByTime(THROTTLE_MS);

    expect(unrelated.style.display).toBe("");

    rule.teardown?.();
  });

  it("teardown unregisters from the dispatcher", async () => {
    const { rule } = createSelectorHideRule({
      id: RULE_ID,
      label: "test",
      description: "test",
      alwaysOnSelectors: ["#target"],
      removeEntirely: true,
      watchSubtrees: true,
    });

    rule.apply(document.body);
    rule.teardown?.();

    const widget = document.createElement("div");
    widget.id = "target";
    document.body.append(widget);

    await flushMutations();
    jest.advanceTimersByTime(THROTTLE_MS);

    // Teardown ran — the dispatcher no longer routes to this rule,
    // so the post-teardown injection stays untouched.
    expect(widget.style.display).toBe("");
  });

  it("catches a post-insert id assignment (attribute-mutation dispatch)", async () => {
    // jQuery-style pattern: page injects a generic <div>, then later
    // sets the id that the rule targets. The token-index dispatcher
    // opts into attribute observation so this no longer slips through.
    const { rule } = createSelectorHideRule({
      id: RULE_ID,
      label: "test",
      description: "test",
      alwaysOnSelectors: ["#late-id"],
      removeEntirely: true,
      watchSubtrees: true,
    });

    rule.apply(document.body);

    const widget = document.createElement("div");
    document.body.append(widget);
    await flushMutations();
    jest.advanceTimersByTime(THROTTLE_MS);
    // No id at insertion time — the rule shouldn't have hidden it.
    expect(widget.style.display).toBe("");

    // The page sets the id afterward. With observeAttributes the
    // dispatcher re-runs and hides the now-matching element.
    widget.id = "late-id";
    await flushMutations();
    jest.advanceTimersByTime(THROTTLE_MS);

    expect(widget.style.display).toBe("none");

    rule.teardown?.();
  });

  it("catches a post-insert class assignment (attribute-mutation dispatch)", async () => {
    const { rule } = createSelectorHideRule({
      id: RULE_ID,
      label: "test",
      description: "test",
      alwaysOnSelectors: [".late-class"],
      removeEntirely: true,
      watchSubtrees: true,
    });

    rule.apply(document.body);

    const widget = document.createElement("div");
    document.body.append(widget);
    await flushMutations();
    jest.advanceTimersByTime(THROTTLE_MS);
    expect(widget.style.display).toBe("");

    widget.classList.add("late-class");
    await flushMutations();
    jest.advanceTimersByTime(THROTTLE_MS);

    expect(widget.style.display).toBe("none");

    rule.teardown?.();
  });

  it("registers siteRule selectors in the token index too", async () => {
    // Without this, a URL-gated selector would never be triggered by
    // the dispatcher even when the URL matches — the rule's scan would
    // run only via complex-fallback (if it landed there at all).
    const { rule } = createSelectorHideRule({
      id: RULE_ID,
      label: "test",
      description: "test",
      alwaysOnSelectors: [],
      siteRules: [
        {
          patterns: [new URLPattern({ pathname: "/*" })],
          selectors: ["#site-specific"],
        },
      ],
      removeEntirely: true,
      watchSubtrees: true,
    });

    rule.apply(document.body);

    const widget = document.createElement("div");
    widget.id = "site-specific";
    document.body.append(widget);

    await flushMutations();
    jest.advanceTimersByTime(THROTTLE_MS);

    expect(widget.style.display).toBe("none");

    rule.teardown?.();
  });
});

describe("processed-node WeakSet bypass", () => {
  // The WeakSet is a perf cache: once a rule's scan concludes "skip"
  // for an element based on the element's own state, future scans
  // short-circuit. Markers (HIDDEN_ATTR, REVEALED_ATTR) stay in the DOM
  // for cross-rule coordination and for reveal click handlers; the
  // WeakSet is purely a hot-loop bypass for this rule's own re-scans.

  it("skips an already-hidden element on re-scan even if HIDDEN_ATTR is removed externally", () => {
    // Demonstrates the perf-cache nature: the rule trusts its own
    // record over the DOM marker. If page JS strips HIDDEN_ATTR, the
    // rule still doesn't re-process the element — this is what makes
    // the bypass a "cache" rather than a recomputation.
    const { rule } = createSelectorHideRule({
      id: RULE_ID,
      label: "test",
      description: "test",
      alwaysOnSelectors: ["#widget"],
      removeEntirely: true,
    });
    document.body.innerHTML = `<div id="widget">x</div>`;

    rule.apply(document.body);
    const widget = document.querySelector<HTMLElement>("#widget");
    expect(widget?.getAttribute(HIDDEN_ATTR)).toBe(RULE_ID);

    // External actor strips the marker, but the element stays in the
    // DOM. The widget is still display:none (rule won't undo that).
    widget?.removeAttribute(HIDDEN_ATTR);
    // Tamper with display so a re-hide would be visible — verifies
    // the rule didn't re-run.
    widget?.style.removeProperty("display");

    rule.apply(document.body);

    expect(widget?.style.display).toBe("");
    expect(widget?.getAttribute(HIDDEN_ATTR)).toBeNull();
  });

  it("skips an element revealed for this rule on re-scan", () => {
    // REVEALED_ATTR is own-state and monotonic — once set, never
    // cleared. The WeakSet memoizes the skip.
    const { rule } = createSelectorHideRule({
      id: RULE_ID,
      label: "test",
      description: "test",
      alwaysOnSelectors: ["footer"],
      hideLabel: HIDE_LABEL,
    });
    document.body.innerHTML = `<footer id="f" data-abs-revealed="${RULE_ID}">revealed</footer>`;

    rule.apply(document.body);
    rule.apply(document.body);

    // Skipped both times: no placeholder, original footer present.
    expect(document.querySelector("#f")).not.toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });

  it("does NOT memoize ancestor-relative skips — element re-evaluated if it moves out from under a revealed ancestor", () => {
    // The safety boundary the WeakSet design intentionally preserves.
    // closest('[REVEALED_ATTR=id]') skips depend on ancestry, which
    // can change; if we memoized this we'd silently miss matches that
    // move out of a revealed wrapper.
    const { rule } = createSelectorHideRule({
      id: RULE_ID,
      label: "test",
      description: "test",
      alwaysOnSelectors: ["footer"],
      hideLabel: HIDE_LABEL,
    });
    document.body.innerHTML = `
      <div id="wrap" data-abs-revealed="${RULE_ID}">
        <footer id="inner">x</footer>
      </div>
      <div id="newhome"></div>
    `;

    rule.apply(document.body);
    // Inside the revealed wrapper — skipped.
    expect(document.querySelector("#inner")).not.toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();

    // Move the footer out of the wrapper.
    const inner = document.querySelector<HTMLElement>("#inner");
    document.querySelector("#newhome")?.append(inner as HTMLElement);

    rule.apply(document.body);
    // Now eligible — should have been hidden.
    expect(document.querySelector("#inner")).toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).not.toBeNull();
  });

  it("does NOT memoize 'inside an existing placeholder' skips", () => {
    // Parallel safety boundary for the closest('.placeholder') check.
    // If the placeholder is replaced (e.g., user reveals it), an
    // element that used to live inside it is now exposed and should
    // be re-evaluated.
    const { rule } = createSelectorHideRule({
      id: RULE_ID,
      label: "test",
      description: "test",
      alwaysOnSelectors: ["footer"],
      hideLabel: HIDE_LABEL,
    });
    const fakePlaceholder = document.createElement("div");
    fakePlaceholder.classList.add(PLACEHOLDER_CLASS);
    const inner = document.createElement("footer");
    inner.id = "inner";
    inner.textContent = "x";
    fakePlaceholder.append(inner);
    document.body.append(fakePlaceholder);

    rule.apply(document.body);
    expect(document.querySelector("#inner")).not.toBeNull();

    // Strip placeholder-ness from the wrapper (simulates the user
    // revealing it).
    fakePlaceholder.classList.remove(PLACEHOLDER_CLASS);

    rule.apply(document.body);
    expect(document.querySelector("#inner")).toBeNull();
  });

  it("memoizes the placeholder-self check so re-scans don't re-pay the classList read", () => {
    // Behavioral assertion via spy: once the rule scans a candidate
    // that is itself a placeholder, the next scan should not call
    // classList.contains for that same element. Hard to assert
    // directly without internals, so we proxy via a spy on
    // Element.prototype.getAttribute and confirm the count is bounded.
    const { rule } = createSelectorHideRule({
      id: RULE_ID,
      label: "test",
      description: "test",
      alwaysOnSelectors: ["div"],
      candidateFilter: (element) =>
        element.classList.contains(PLACEHOLDER_CLASS),
      hideLabel: HIDE_LABEL,
    });
    document.body.innerHTML = `<div class="${PLACEHOLDER_CLASS}">x</div>`;

    const placeholder = document.querySelector<HTMLElement>(
      `.${PLACEHOLDER_CLASS}`,
    ) as HTMLElement;
    const getAttributeSpy = jest.spyOn(placeholder, "getAttribute");

    rule.apply(document.body);
    // First scan: own-state classList check hits, getAttribute not
    // called for marker checks on this element (the placeholder
    // branch short-circuits before the getAttribute lines).
    const firstScanCalls = getAttributeSpy.mock.calls.length;

    rule.apply(document.body);
    // Second scan: WeakSet bypass means we never even reach the
    // classList check. getAttribute call count stays flat.
    expect(getAttributeSpy.mock.calls.length).toBe(firstScanCalls);
    getAttributeSpy.mockRestore();
  });
});
