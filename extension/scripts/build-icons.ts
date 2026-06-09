// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Renders extension/icons/*.svg to PNGs at the sizes the manifest and the
// Chrome Web Store listing need. Generated files are committed alongside the
// SVGs so contributors without the renderer dep can still build the extension.
//
// Run manually with `bun run build-icons` after editing a source SVG.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";

const ROOT = join(import.meta.dir, "..");
const ICONS = join(ROOT, "icons");

// Each source renders to `${prefix}-${size}.png`.
//   - icon.svg: the blue shield (manifest default_icon + Web Store listing).
//     16/24/32 cover the toolbar action; 48 is Chrome's extensions page
//     tile; 128 is required by the Chrome Web Store store-listing icon.
//   - icon-off.svg: the greyed "enforcement off" variant the background
//     swaps in via chrome.action.setIcon (spec 0010 FR-2a). Toolbar sizes
//     only — it is never used on the extensions page or the store listing.
const SOURCES = [
  { svg: "icon.svg", prefix: "icon", sizes: [16, 24, 32, 48, 128] },
  { svg: "icon-off.svg", prefix: "icon-off", sizes: [16, 24, 32] },
] as const;

export function generateIcons(): number {
  let written = 0;
  for (const { svg: file, prefix, sizes } of SOURCES) {
    const source = join(ICONS, file);
    if (!existsSync(source)) {
      throw new Error(`Missing source SVG at ${source}`);
    }
    const svg = readFileSync(source);
    for (const size of sizes) {
      const png = new Resvg(svg, {
        fitTo: { mode: "width", value: size },
      })
        .render()
        .asPng();
      writeFileSync(join(ICONS, `${prefix}-${size}.png`), png);
      written += 1;
    }
  }
  return written;
}

if (import.meta.main) {
  const count = generateIcons();
  console.log(`Generated ${count} icon PNGs in ${ICONS}`);
}
