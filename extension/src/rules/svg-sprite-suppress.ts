// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Remove unused SVG sprite containers. Many sites ship sprite sheets — a
// hidden <svg> whose only children are <symbol>/<defs> definitions — that
// add 1k+ tokens of <path> data to every page even when nothing references
// them (common in component libraries that import the whole icon set).
//
// Safety: a sprite is only removed when (a) it's hidden (display:none,
// visibility:hidden, aria-hidden=true, or inline width=0/height=0) AND
// (b) none of its <symbol> ids are referenced by any <use> element on the
// page. This preserves icons that are actually rendered via <use>.

import { createSubtreeWatcher } from "../lib/subtree-watcher";
import type { Rule } from "./types";

const RULE_ID = "svg-sprite-suppress" as const;
const STRUCTURAL_TAGS = new Set([
  "symbol",
  "defs",
  "title",
  "desc",
  "metadata",
]);

function collectReferencedSymbolIds(): Set<string> {
  const refs = new Set<string>();
  for (const use of document.querySelectorAll("use")) {
    const href = use.getAttribute("href") ?? use.getAttribute("xlink:href");
    if (!href) continue;
    const hashIdx = href.lastIndexOf("#");
    if (hashIdx === -1) continue;
    const id = href.slice(hashIdx + 1);
    if (id) refs.add(id);
  }
  return refs;
}

function isSpriteShaped(svg: SVGSVGElement): boolean {
  const children = [...svg.children];
  if (children.length === 0) return false;
  let hasSymbolOrDefs = false;
  for (const child of children) {
    const tag = child.tagName.toLowerCase();
    if (!STRUCTURAL_TAGS.has(tag)) return false;
    if (tag === "symbol" || tag === "defs") hasSymbolOrDefs = true;
  }
  return hasSymbolOrDefs;
}

function isHidden(svg: SVGSVGElement): boolean {
  if (svg.getAttribute("aria-hidden") === "true") return true;
  const style = globalThis.getComputedStyle(svg);
  if (style.display === "none") return true;
  if (style.visibility === "hidden") return true;
  if (svg.getAttribute("width") === "0" || svg.getAttribute("height") === "0") {
    return true;
  }
  // Inline width:0; height:0 is a common idiom for invisible sprite sheets
  // ("position:absolute;width:0;height:0") even when computed style isn't
  // populated (jsdom doesn't parse longhand-from-shorthand reliably).
  const inline = svg.getAttribute("style") ?? "";
  if (/width\s*:\s*0/i.test(inline) && /height\s*:\s*0/i.test(inline)) {
    return true;
  }
  return false;
}

function scan(root: ParentNode): void {
  const referenced = collectReferencedSymbolIds();
  for (const svg of root.querySelectorAll<SVGSVGElement>("svg")) {
    if (!svg.isConnected) continue;
    if (!isSpriteShaped(svg)) continue;
    if (!isHidden(svg)) continue;
    const symbols = [...svg.querySelectorAll<SVGSymbolElement>("symbol[id]")];
    if (symbols.some((s) => referenced.has(s.id))) continue;
    svg.remove();
  }
}

const watcher = createSubtreeWatcher({
  onSubtrees: () => scan(document.body),
});

function apply(root: ParentNode): void {
  scan(root);
  watcher.start(root);
}

export const svgSpriteSuppressRule = {
  id: RULE_ID,
  label: "Remove Unused SVG Sprites",
  description:
    "Remove hidden SVG sprite containers whose symbols aren't referenced on the page.",
  defaultEnabled: true,
  apply,
  teardown: () => watcher.stop(),
} satisfies Rule;
