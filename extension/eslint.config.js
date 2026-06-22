// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// ESLint complements Biome here: Biome owns formatting and the common-error
// recommended set; ESLint runs only the rules Biome does not have (unicorn's
// modern-API hints) plus this project's custom rules in `eslint-rules/`.

import path from "node:path";
import js from "@eslint/js";
import eslintComments from "@eslint-community/eslint-plugin-eslint-comments";
import importX from "eslint-plugin-import-x";
import jest from "eslint-plugin-jest";
import reactHooks from "eslint-plugin-react-hooks";
import unicorn from "eslint-plugin-unicorn";
import globals from "globals";
import tseslint from "typescript-eslint";
import localPlugin from "./eslint-rules/index.js";

// `import-x/no-restricted-paths` resolves `from` against basePath (cwd) but
// uses `except` patterns raw. We resolve them ourselves so the contract works
// from any cwd — and so minimatch doesn't have to traverse dot-prefixed
// segments like `.claude/worktrees/` (its default `dot: false` blocks `**`
// from crossing those).
const here = import.meta.dirname;
const rulePath = (suffix) => path.join(here, "src/rules", suffix);

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "src/**/*.generated.*",
      "eslint-rules/**",
      "eslint.config.js",
      "stylelint.config.js",
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
      "@eslint-community/eslint-comments": eslintComments,
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

      // Discourage silencing the linter. `no-unused-disable` removes stale
      // disable comments so they don't accumulate as code changes around
      // them; `no-restricted-disable` blocks suppression of the high-value
      // type-safety and hooks rules outright — the right fix is the code,
      // not a `// eslint-disable-next-line`.
      "@eslint-community/eslint-comments/no-unused-disable": "error",
      "@eslint-community/eslint-comments/no-restricted-disable": [
        "error",
        "@typescript-eslint/no-explicit-any",
        "@typescript-eslint/no-floating-promises",
        "@typescript-eslint/no-misused-promises",
        "@typescript-eslint/no-non-null-assertion",
        "@typescript-eslint/no-unsafe-argument",
        "@typescript-eslint/no-unsafe-assignment",
        "@typescript-eslint/no-unsafe-call",
        "@typescript-eslint/no-unsafe-member-access",
        "@typescript-eslint/no-unsafe-return",
        "@typescript-eslint/switch-exhaustiveness-check",
        "react-hooks/rules-of-hooks",
        "react-hooks/exhaustive-deps",
      ],

      // Already on via `strictTypeChecked`, but pinned explicitly so the
      // intent is visible: every `switch` over a union (RuleId, message
      // discriminants, etc.) must handle every case. Agents extending those
      // unions get a compile-time nudge to update the switches.
      "@typescript-eslint/switch-exhaustiveness-check": [
        "error",
        { considerDefaultExhaustiveForUnions: true },
      ],

      // Import hygiene — TS handles existence/named-export checking, so
      // import-x here only owns structural issues TS can't see: cycles,
      // duplicate import statements, self-imports, useless path segments,
      // and inconsistent type-specifier style.
      "import-x/no-cycle": ["error", { maxDepth: 10, ignoreExternal: true }],
      "import-x/no-self-import": "error",
      "import-x/no-duplicates": "error",
      "import-x/no-useless-path-segments": "error",
      "import-x/consistent-type-specifier-style": ["error", "prefer-top-level"],

      // The module-boundary contract between src/rules and src/lib lives in
      // dedicated config blocks below (search for `no-restricted-paths`) —
      // scoping via `files`/`ignores` is cleaner than encoding the same
      // negation inside the zone definitions.

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
      // files which follow PascalCase by ecosystem convention. v66 added
      // directory-name checking (`checkDirectories`), which flags the Jest
      // `__tests__` / `__test-mocks__` convention we deliberately keep — so
      // restrict the rule to filenames only.
      "unicorn/filename-case": [
        "error",
        {
          cases: { kebabCase: true, pascalCase: true },
          checkDirectories: false,
        },
      ],

      // eslint-plugin-unicorn 66 turned on a batch of new recommended rules.
      // The cleanly autofixable ones are fixed in-tree and stay errors; the
      // three below are turned off because their autofix is wrong (or
      // redundant) for this codebase, and the rest are temporarily downgraded
      // to warnings so the bump lands without a mass manual rewrite. Ratcheting
      // them back to errors is tracked in #279.
      //
      // Off — autofix corrupts source or is redundant here:
      //   comment-content rewrites prose and real paths in comments
      //     (`.github/…` → `.GitHub/…`, `*.yaml` → `*.YAML`, `Vue` → `Vue.js`).
      //   prefer-https rewrites schema.org itemtype URIs and intentional
      //     `http://` test fixtures, changing their meaning.
      //   require-css-escape double-escapes values already run through this
      //     project's `escapeAttributeValue` helper and wraps numeric
      //     interpolations (`CSS.escape(i)`, which expects a string); the
      //     dynamic selector values it targets are already escaped via that
      //     helper, so the rule is redundant noise on the constant cases.
      "unicorn/comment-content": "off",
      "unicorn/prefer-https": "off",
      "unicorn/require-css-escape": "off",

      // Warn — ratchet to error in #279:
      "unicorn/prefer-scoped-selector": "warn",
      "unicorn/prefer-await": "warn",
      "unicorn/no-this-outside-of-class": "warn",
      "unicorn/no-break-in-nested-loop": "warn",
      "unicorn/no-computed-property-existence-check": "warn",
      "unicorn/max-nested-calls": "warn",
      "unicorn/prefer-number-coercion": "warn",
      "unicorn/no-unreadable-new-expression": "warn",
      "unicorn/require-array-sort-compare": "warn",
      "unicorn/prefer-uint8array-base64": "warn",
      "unicorn/no-declarations-before-early-exit": "warn",
      // no-global-object-property-assignment stays at its recommended `error`
      // for production code; it's disabled only for tests (which legitimately
      // assign globals to set up mocks) in the test-files block below.
      "unicorn/prefer-minimal-ternary": "warn",
      "unicorn/prefer-iterator-to-array": "warn",
      "unicorn/no-incorrect-query-selector": "warn",
      "unicorn/no-top-level-side-effects": "warn",
      // Partially autofixable — fixable instances are corrected in-tree; the
      // remainder warn until handled in #279.
      "unicorn/no-unnecessary-global-this": "warn",
      "unicorn/prefer-type-literal-last": "warn",
      "unicorn/prefer-short-arrow-method": "warn",

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
      // Tests assign onto global objects to install mocks / stubs; the rule
      // stays an error everywhere else.
      "unicorn/no-global-object-property-assignment": "off",
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
  {
    // Module-boundary contract: each rule file is a leaf. It can depend on
    // shared helpers in ../lib, its own ./types contract, and codegen output
    // (*.generated.ts) — but not on another rule's implementation. The only
    // place allowed to enumerate the catalog is rules/index.ts (which is
    // excluded from this block via `ignores`), where the RuleId union and
    // RULES array are derived from a single tuple.
    //
    // `except` entries are absolute globs (via rulePath) for the reasons in
    // the helper's docstring at the top of this file.
    files: ["src/rules/*.ts"],
    ignores: [
      "src/rules/index.ts",
      "src/rules/types.ts",
      "src/rules/*.generated.ts",
    ],
    rules: {
      "import-x/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: "./src/rules",
              from: "./src/rules/*.ts",
              // Brace expansions force is-glob to return true; the only file
              // matched by each pattern is the literal one named.
              except: [rulePath("types.{ts,tsx}"), rulePath("*.generated.ts")],
              message:
                "Rules must not import sibling rules — only ./types and ./*.generated.ts. Shared helpers belong in ../lib; the catalog lives in ./index.ts.",
            },
          ],
        },
      ],
    },
  },
  {
    // lib/ owns the runtime engine and shared helpers. It depends on the
    // rule catalog (rules/index), the contract (rules/types), the
    // generated tables, and the hand-edited rule-metadata table — never on
    // a specific rule implementation. Reaching into one rule from lib
    // quietly couples a helper to that rule's internals and makes the next
    // rule that needs the same hook copy-paste instead of factor.
    files: ["src/lib/**/*.ts", "src/lib/**/*.tsx"],
    ignores: ["src/lib/**/__tests__/**"],
    rules: {
      "import-x/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: "./src/lib",
              from: "./src/rules/*.ts",
              except: [
                rulePath("{index,types,rule-metadata}.ts"),
                rulePath("*.generated.ts"),
              ],
              message:
                "lib/ may only depend on rules/{index,types,rule-metadata,*.generated} — not on a specific rule file.",
            },
          ],
        },
      ],
    },
  },
  {
    // `data-abs-*` attributes are the extension's DOM marker namespace —
    // every one the engine or any rule stamps on a node has to be declared
    // and exported from `src/lib/dom-markers.ts` so collisions surface at
    // compile time and new rules have one canonical naming reference.
    // Allowed only in the registry file itself.
    ignores: ["src/lib/dom-markers.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/^data-abs-/]",
          message:
            "data-abs-* attribute names must be declared in src/lib/dom-markers.ts and imported — no inline string literals.",
        },
        {
          selector: "TemplateElement[value.raw=/^data-abs-/]",
          message:
            "data-abs-* attribute names must be declared in src/lib/dom-markers.ts and imported — no inline template literals.",
        },
      ],
    },
  },
);
