// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Stylelint lints the scoped <style> blocks in the Astro components. Biome
// covers the .ts/.tsx/.json under docs/, but not CSS embedded in .astro files;
// postcss-html extracts those <style> blocks. Custom properties are skipped
// because the components consume Starlight's `--sl-*` design tokens.

/** @type {import("stylelint").Config} */
export default {
  extends: ["stylelint-config-standard"],
  ignoreFiles: ["dist/**", "node_modules/**", ".astro/**"],
  rules: {
    "custom-property-pattern": null,
  },
  overrides: [
    {
      files: ["**/*.astro"],
      customSyntax: "postcss-html",
    },
  ],
};
