// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Stylelint lints the demo-site CSS. stylelint-config-tailwindcss teaches the
// standard config about Tailwind's at-rules (@import "tailwindcss", @theme,
// @apply, @utility) so they aren't flagged as unknown.

/** @type {import("stylelint").Config} */
export default {
  extends: ["stylelint-config-standard", "stylelint-config-tailwindcss"],
  ignoreFiles: ["dist/**", "node_modules/**"],
};
