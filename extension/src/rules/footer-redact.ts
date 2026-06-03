// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Hide the page footer (legal links, sitemap, social icons, marketing copy)
// from agents. Footers carry navigation and boilerplate that agents almost
// never need to act on but that consume tokens on every page load.
//
// Detection layers:
//   1. HTML5 semantic markers — top-level <footer> and [role="contentinfo"].
//      Footers nested inside <article>/<section>/<aside>/<nav> are skipped
//      because those represent per-section footers (e.g., an article byline)
//      rather than the page footer.
//   2. Conventional id/class selectors used widely across the web.
//   3. Site-specific selectors for sites that ship a non-semantic footer
//      (notably Amazon, which uses a plain <div id="navFooter">). These live
//      in extension/data/sites/*.yaml and are compiled into
//      site-data.generated.ts by `bun run build-site-data`.

import { createSelectorHideRule } from "../lib/selector-hide-rule";
import { FOOTER_REDACT_SITE_RULES } from "./site-data.generated";

const SECTIONING_ANCESTORS = "article, section, aside, nav";

function isPageFooter(element: HTMLElement): boolean {
  return element.closest(SECTIONING_ANCESTORS) === null;
}

const { rule, selectorsFor } = createSelectorHideRule({
  id: "footer-redact",
  label: "Hide Page Footer",
  description:
    "Hide the page footer (legal links, sitemap, social) to save tokens.",
  hideLabel: "[footer hidden — click to reveal]",
  alwaysOnSelectors: [
    "footer",
    '[role="contentinfo"]',
    "#footer",
    "#site-footer",
    "#page-footer",
    ".site-footer",
    ".page-footer",
    // Compound-class conventions used by Webflow templates (pixiebrix.com,
    // most no-code marketing sites) and various theme libraries. Bare
    // ".footer" is deliberately NOT included — it's used too loosely
    // (heading classes, link classes, icon variants).
    ".footer-container",
    ".footer-wrapper",
    ".footer-wrap",
    ".footer-section",
  ],
  siteRules: FOOTER_REDACT_SITE_RULES,
  candidateFilter: isPageFooter,
  // Per-frame footers don't exist in practice — the rule only targets the
  // page-level footer, which lives on the top frame.
  topFrameOnly: true,
  // Costco (Next.js) wraps the footer in a Suspense boundary that bails to
  // CSR — at document_idle the SSR <footer> exists, but React then tears down
  // the boundary subtree and re-mounts the footer client-side, wiping any
  // placeholder we'd installed. Subtree watching catches the re-mount.
  watchSubtrees: true,
});

export { selectorsFor };
export const footerRedactRule = rule;
