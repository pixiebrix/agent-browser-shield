// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// ESLint complements Biome here: Biome owns formatting and the common-error
// recommended set; ESLint runs only the rules Biome does not have (unicorn's
// modern-API hints) plus this project's custom rules in `eslint-rules/`.

import js from "@eslint/js";
import importX from "eslint-plugin-import-x";
import jest from "eslint-plugin-jest";
import reactHooks from "eslint-plugin-react-hooks";
import unicorn from "eslint-plugin-unicorn";
import globals from "globals";
import tseslint from "typescript-eslint";
import localPlugin from "./eslint-rules/index.js";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "src/**/*.generated.*",
      "eslint-rules/**",
      "eslint.config.js",
      "jest.config.cjs",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  unicorn.configs["flat/recommended"],
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.webextensions,
      },
      parserOptions: {
        project: "./tsconfig.eslint.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "agent-browser-shield": localPlugin,
      "import-x": importX,
    },
    settings: {
      "import-x/resolver-next": [
        importX.createNodeResolver({
          extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
        }),
      ],
    },
    rules: {
      "agent-browser-shield/rule-id-matches-filename": "error",

      // Import hygiene — TS handles existence/named-export checking, so
      // import-x here only owns structural issues TS can't see: cycles,
      // duplicate import statements, self-imports, useless path segments,
      // and inconsistent type-specifier style.
      "import-x/no-cycle": ["error", { maxDepth: 10, ignoreExternal: true }],
      "import-x/no-self-import": "error",
      "import-x/no-duplicates": "error",
      "import-x/no-useless-path-segments": "error",
      "import-x/consistent-type-specifier-style": ["error", "prefer-top-level"],

      // Disabled — overlaps with Biome's recommended set or its formatter.
      "unicorn/no-useless-undefined": "off",
      "unicorn/no-array-callback-reference": "off",
      "unicorn/no-nested-ternary": "off",

      "unicorn/prevent-abbreviations": [
        "error",
        {
          replacements: {
            // Idiomatic in JS/TS — kept as-is.
            props: false,
            params: false,
            param: false,
            ref: false,
            refs: false,
            args: false,
            db: false,
            // Node/build conventions. `env` is required by `NodeJS.ProcessEnv`;
            // `src` is the standard `fs.cp` filter callback parameter name.
            env: false,
            src: false,
            // Common file/module naming convention (`dom-utils.ts`, etc.).
            utils: false,
            util: false,
            // Loop counters and map/filter callback params. The rule is
            // not scope-aware, so these are allowed globally.
            i: false,
            j: false,
            k: false,
            x: false,
            y: false,
          },
        },
      ],

      // Disabled — too opinionated for this codebase.
      "unicorn/no-null": "off",
      "unicorn/no-array-reduce": "off",
      "unicorn/no-array-for-each": "off",
      "unicorn/prefer-module": "off",
      "unicorn/import-style": "off",
      "unicorn/no-keyword-prefix": "off",
      "unicorn/switch-case-braces": "off",

      // Keep but downgrade: useful guidance, but the codebase has many
      // existing `for…of` loops we don't want to mass-rewrite right now.
      "unicorn/no-for-loop": "warn",

      // Filenames are kebab-case across the project, except React component
      // files which follow PascalCase by ecosystem convention.
      "unicorn/filename-case": [
        "error",
        { cases: { kebabCase: true, pascalCase: true } },
      ],

      // Allow underscore-prefixed unused parameters (e.g. `_root` for the
      // Rule#apply signature when a rule ignores the argument).
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      // Pure style — Biome's formatter and the codebase don't care about
      // `T[]` vs `Array<T>` or the syntax used for non-null assertions.
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/non-nullable-type-assertion-style": "off",

      // Allow `${number}` in template literals — common for debug strings
      // and codegen output, and TS already guarantees the operand is a number.
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true },
      ],
    },
  },
  {
    files: ["src/**/__tests__/**/*.{ts,tsx}"],
    plugins: { jest },
    rules: {
      // Tests legitimately use literal nulls and many small `for` loops.
      "unicorn/no-useless-undefined": "off",
      "unicorn/consistent-function-scoping": "off",
      // Jest matchers and mock patterns routinely pass methods by reference.
      "@typescript-eslint/unbound-method": "off",

      // Catch common test mistakes — focused/disabled tests left in,
      // assertions that don't run, expects in unexpected places.
      "jest/no-focused-tests": "error",
      "jest/no-disabled-tests": "error",
      "jest/valid-expect": "error",
      "jest/no-standalone-expect": "error",
      "jest/no-identical-title": "error",
      "jest/valid-title": "error",

      // `expect*` recognizes in-file helpers like `expectHidden(el)` that
      // wrap one or more real `expect()` calls — without this, every rule
      // test that delegates to such a helper trips the rule.
      "jest/expect-expect": [
        "error",
        { assertFunctionNames: ["expect", "expect*"] },
      ],

      // Off: the codebase relies on TS discriminated-union narrowing
      //   expect(result.ok).toBe(false);
      //   if (!result.ok) { expect(result.error).toMatch(/.../); }
      // The rule flags any `expect` inside an `if`, which is too coarse for
      // this pattern. Both branches of an `it.each` matrix also legitimately
      // assert different things.
      "jest/no-conditional-expect": "off",
    },
  },
  {
    files: ["build.ts", "scripts/**/*.{ts,js,mjs,cjs}"],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "unicorn/no-process-exit": "off",
    },
  },
  {
    // Rules of Hooks + exhaustive-deps catch stale-closure and conditional-
    // hook bugs that TypeScript can't see. Scoped to the React surfaces
    // (popup/options + components under lib/).
    files: ["src/**/*.tsx"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
);
