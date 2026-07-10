// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Adaptive-palette experimental toggle: classifier walks the ancestor chain
// for a non-transparent background, and `replaceWithBlockPlaceholder` /
// `replaceMatchesInTextNode` stamp `data-abs-placeholder-palette="dark"`
// only when the cache is on AND the sample classifies as dark.

import { PLACEHOLDER_PALETTE_ATTR } from "../dom-markers";
import {
  PLACEHOLDER_CLASS,
  pickPaletteFromAncestor,
  replaceMatchesInTextNode,
  replaceWithBlockPlaceholder,
} from "../placeholder";
import { setAdaptivePaletteCache } from "../placeholder-adaptive-palette";
import type { RuleId } from "../storage";

const RULE_ID = "footer-redact" as RuleId;
const PII_RULE_ID = "pii-redact" as RuleId;

beforeEach(() => {
  document.body.replaceChildren();
  document.body.removeAttribute("style");
  // Default to off so the cache state of one test doesn't leak into the
  // next. Each test that needs the toggle on flips it explicitly.
  setAdaptivePaletteCache(false);
});

describe("pickPaletteFromAncestor", () => {
  it("returns 'light' when the nearest non-transparent background is bright", () => {
    document.body.innerHTML = `<div id="bg" style="background-color: rgb(255, 255, 255)"><span id="target">x</span></div>`;
    const target = document.querySelector<HTMLElement>("#target");
    if (!target) {
      throw new Error("fixture missing #target");
    }
    expect(pickPaletteFromAncestor(target)).toBe("light");
  });

  it("returns 'dark' when the nearest non-transparent background is dark", () => {
    document.body.innerHTML = `<div id="bg" style="background-color: rgb(13, 17, 23)"><span id="target">x</span></div>`;
    const target = document.querySelector<HTMLElement>("#target");
    if (!target) {
      throw new Error("fixture missing #target");
    }
    expect(pickPaletteFromAncestor(target)).toBe("dark");
  });

  it("walks past transparent ancestors to the first opaque background", () => {
    document.body.setAttribute("style", "background-color: rgb(13, 17, 23)");
    document.body.innerHTML = `<div><section><span id="target">x</span></section></div>`;
    const target = document.querySelector<HTMLElement>("#target");
    if (!target) {
      throw new Error("fixture missing #target");
    }
    // The intermediate divs/sections have no background; only <body> does.
    expect(pickPaletteFromAncestor(target)).toBe("dark");
  });

  it("falls back to 'light' when every ancestor is transparent", () => {
    document.body.innerHTML = `<div><span id="target">x</span></div>`;
    const target = document.querySelector<HTMLElement>("#target");
    if (!target) {
      throw new Error("fixture missing #target");
    }
    expect(pickPaletteFromAncestor(target)).toBe("light");
  });

  it("returns 'light' when start is null", () => {
    expect(pickPaletteFromAncestor(null)).toBe("light");
  });
});

describe("replaceWithBlockPlaceholder palette stamping", () => {
  it("does not stamp the palette attribute when the toggle is off", () => {
    document.body.setAttribute("style", "background-color: rgb(13, 17, 23)");
    document.body.innerHTML = `<section id="target">x</section>`;
    const target = document.querySelector<HTMLElement>("#target");
    if (!target) {
      throw new Error("fixture missing #target");
    }

    const placeholder = replaceWithBlockPlaceholder(
      target,
      RULE_ID,
      "[hidden]",
    );
    expect(placeholder.hasAttribute(PLACEHOLDER_PALETTE_ATTR)).toBe(false);
  });

  it("stamps palette='dark' when toggle on and ancestor sampled dark", () => {
    setAdaptivePaletteCache(true);
    document.body.setAttribute("style", "background-color: rgb(13, 17, 23)");
    document.body.innerHTML = `<section id="target">x</section>`;
    const target = document.querySelector<HTMLElement>("#target");
    if (!target) {
      throw new Error("fixture missing #target");
    }

    const placeholder = replaceWithBlockPlaceholder(
      target,
      RULE_ID,
      "[hidden]",
    );
    expect(placeholder.getAttribute(PLACEHOLDER_PALETTE_ATTR)).toBe("dark");
  });

  it("omits the attribute when toggle on but ancestor sampled light", () => {
    setAdaptivePaletteCache(true);
    document.body.setAttribute("style", "background-color: rgb(255, 255, 255)");
    document.body.innerHTML = `<section id="target">x</section>`;
    const target = document.querySelector<HTMLElement>("#target");
    if (!target) {
      throw new Error("fixture missing #target");
    }

    const placeholder = replaceWithBlockPlaceholder(
      target,
      RULE_ID,
      "[hidden]",
    );
    expect(placeholder.hasAttribute(PLACEHOLDER_PALETTE_ATTR)).toBe(false);
  });
});

describe("inline placeholder palette stamping", () => {
  it("stamps palette='dark' on inline placeholders when ancestor is dark", () => {
    setAdaptivePaletteCache(true);
    document.body.innerHTML = `<p id="host" style="background-color: rgb(13, 17, 23)">hello world</p>`;
    const host = document.querySelector<HTMLElement>("#host");
    if (!host) {
      throw new Error("fixture missing #host");
    }
    const textNode = host.firstChild as Text;

    replaceMatchesInTextNode(
      textNode,
      [{ start: 0, end: 5, label: "[hidden]" }],
      PII_RULE_ID,
    );

    const placeholder = host.querySelector(`.${PLACEHOLDER_CLASS}--inline`);
    expect(placeholder?.getAttribute(PLACEHOLDER_PALETTE_ATTR)).toBe("dark");
  });

  it("omits the attribute on inline placeholders when toggle is off", () => {
    document.body.innerHTML = `<p id="host" style="background-color: rgb(13, 17, 23)">hello world</p>`;
    const host = document.querySelector<HTMLElement>("#host");
    if (!host) {
      throw new Error("fixture missing #host");
    }
    const textNode = host.firstChild as Text;

    replaceMatchesInTextNode(
      textNode,
      [{ start: 0, end: 5, label: "[hidden]" }],
      PII_RULE_ID,
    );

    const placeholder = host.querySelector(`.${PLACEHOLDER_CLASS}--inline`);
    expect(placeholder?.hasAttribute(PLACEHOLDER_PALETTE_ATTR)).toBe(false);
  });
});
