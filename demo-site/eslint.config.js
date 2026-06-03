// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Lightweight ESLint config for the demo site — Biome owns formatting and
// the common-error recommended set; ESLint runs only the rules Biome does
// not have. Today that's just `unicorn/prevent-abbreviations` so the React
// surface stays grep-friendly with the extension's naming convention.

import js from "@eslint/js";
import unicorn from "eslint-plugin-unicorn";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  { ignores: ["dist/**", "node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: { ...globals.browser },
    },
    plugins: { unicorn },
    rules: {
      // Mirrors `extension/eslint.config.js`'s replacement allowlist so the
      // same idiomatic short names work in both codebases.
      "unicorn/prevent-abbreviations": [
        "error",
        {
          replacements: {
            props: false,
            params: false,
            param: false,
            ref: false,
            refs: false,
            args: false,
            db: false,
            env: false,
            src: false,
            utils: false,
            util: false,
            i: false,
            j: false,
            k: false,
            x: false,
            y: false,
          },
        },
      ],
    },
  },
];
