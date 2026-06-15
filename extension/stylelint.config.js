// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Stylelint lints the popup/options CSS, which lives in <style> blocks inside
// src/popup.html and src/options.html — Biome formats standalone .css files but
// does not parse CSS embedded in HTML, so those styles were previously unlinted.
// postcss-html extracts the <style> blocks for the HTML overrides below.

/** @type {import("stylelint").Config} */
export default {
  extends: ["stylelint-config-standard"],
  ignoreFiles: ["dist/**", "node_modules/**", "**/*.generated.*"],
  rules: {
    // The popup/options styles use BEM (block__element--modifier). Standard's
    // kebab-only class pattern rejects the `__` / `--` separators, so disable
    // the naming check rather than rewrite every selector.
    "selector-class-pattern": null,
    // Selectors are grouped by component, not sorted by specificity. This rule
    // can't be auto-fixed (it would reorder rules and break that grouping), so
    // turn it off rather than fight the file structure.
    "no-descending-specificity": null,
  },
  overrides: [
    {
      files: ["**/*.html"],
      customSyntax: "postcss-html",
    },
  ],
};
