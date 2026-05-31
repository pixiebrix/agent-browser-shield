// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Renders extension/icons/icon.svg to PNGs at the sizes the manifest and the
// Chrome Web Store listing need. Generated files are committed alongside the
// SVG so contributors without the renderer dep can still build the extension.
//
// Run manually with `bun run build-icons` after editing icon.svg.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";

const ROOT = join(import.meta.dir, "..");
const ICONS = join(ROOT, "icons");
const SOURCE = join(ICONS, "icon.svg");

// 16/24/32 cover the toolbar action; 48 is Chrome's extensions page tile;
// 128 is required by the Chrome Web Store store-listing icon.
const SIZES = [16, 24, 32, 48, 128];

export function generateIcons(): void {
  if (!existsSync(SOURCE)) {
    throw new Error(`Missing source SVG at ${SOURCE}`);
  }
  const svg = readFileSync(SOURCE);

  for (const size of SIZES) {
    const png = new Resvg(svg, {
      fitTo: { mode: "width", value: size },
    })
      .render()
      .asPng();
    writeFileSync(join(ICONS, `icon-${size}.png`), png);
  }
}

if (import.meta.main) {
  generateIcons();
  console.log(`Generated ${SIZES.length} icon PNGs in ${ICONS}`);
}
