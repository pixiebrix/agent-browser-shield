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

      // Off — fires only on legitimate, unavoidable `this`-outside-a-class:
      // native-prototype monkeypatches (`Element.prototype.attachShadow =
      // function (this: Element) {…}`), `defineProperty` get/set accessors,
      // page-world `executeScript` entry fns (`this: Window`), and
      // webext-messaging handlers — none rewritable as class methods. Every
      // hit would need a disable, so the rule is pure noise here. See #279.
      "unicorn/no-this-outside-of-class": "off",

      // Off — fire only on intentional patterns in this repo, so they have no
      // path to `error`; disabled rather than left as standing warning noise
      // (investigated under #279):
      //   no-computed-property-existence-check flags any `obj[dynamicKey]` in a
      //     boolean position, but our hits are value reads (`!RULE_DEFAULTS[id]`,
      //     `if (states[rule.id])`, `targetMask[i]`), not existence checks —
      //     `Object.hasOwn` would change meaning, and the rule has no option to
      //     narrow scope.
      //   prefer-await flags the fire-and-forget `void promise.then/.catch()`
      //     idiom (our `no-floating-promises` convention) in void fns, React
      //     effects, event-listener/`setTimeout` callbacks, and classic-script
      //     top-level — none of which can cleanly take `await`.
      //   no-top-level-side-effects's only hit is a deliberate, documented
      //     module-load `registerMethods({…})`.
      "unicorn/no-computed-property-existence-check": "off",
      "unicorn/prefer-await": "off",
      "unicorn/no-top-level-side-effects": "off",
      //   max-nested-calls — the call-depth cap doesn't fit the two places we
      //     nest deeply on purpose: zod schema builders
      //     (`z.record(z.string(), z.union([z.string(), z.number()]))`) and
      //     fast-check generators (`fc.array(fc.tuple(fc.nat(…), …))`). Both
      //     are idiomatic and read better nested than split into temporaries.
      "unicorn/max-nested-calls": "off",

      // Off — blocked by the test runtime, not the codebase. The suggested
      // `Uint8Array.fromBase64()`/`#toBase64()` are present in our Chrome
      // target (133+; manifest requires 148) and in Bun (the build script),
      // but Node 24 — which runs Jest/jsdom in CI — only exposes them behind
      // the experimental `--js-base-64` flag, so they're absent under test.
      // The 8 sites include two security-relevant decode paths
      // (`encoded-payload-redact.ts`, `encoded-fixture.ts`) plus their
      // fixtures; rewriting them would either break the suite or force an
      // atob/btoa-based polyfill into jsdom — which would then exercise the
      // shim, not Chrome's native impl, masking any prod divergence on a
      // decode path. Not worth it for a stylistic rule. Revisit once Node
      // ships these unflagged. See #279.
      "unicorn/prefer-uint8array-base64": "off",

      // Enforced (recommended `error`). Dynamically-built arrays pass an
      // explicit comparator; the only sites carrying a scoped `eslint-disable`
      // are where the rule can't be satisfied cleanly:
      //   require-array-sort-compare — compile-time-constant catalog lists
      //     (`RULE_IDS`, `Object.keys(RULE_DEFAULTS)`, …) sorted only to
      //     compare order-independently in tests; non-constant arrays
      //     (readdir results, computed diffs) get a `localeCompare` comparator.
      //   no-incorrect-query-selector — a deliberate `querySelectorAll("#id")`
      //     used to assert the element count.
      //   prefer-number-coercion — `Number()` replaces `parseInt(x, 10)` /
      //     `parseFloat(x)` only where the input is a bare numeric token (a
      //     `\d`-anchored regex capture, `String(i)`); the two scoped
      //     disables in `hidden-text-strip.ts` are where `parseFloat`'s
      //     leading-numeric parse is load-bearing: unit-suffixed CSS
      //     durations (`"0.5s"`) and a possibly-`""` computed `opacity`,
      //     both of which `Number()` would mis-coerce.
      "unicorn/prefer-number-coercion": "error",

      // Off — the rule's `:scope` rewrite is unsound for this codebase's
      // dominant receiver type. It assumes the query receiver is an Element,
      // where `el.querySelectorAll("foo")` and `el.querySelectorAll(":scope
      // foo")` are equivalent. But our shadow-piercing scanners take
      // `root: ParentNode` and run against `Document`, `ShadowRoot`, and
      // `DocumentFragment` receivers at runtime — where `:scope` is NOT
      // equivalent: it matches nothing on a ShadowRoot/DocumentFragment
      // (so `:scope *`/`:scope noscript` silently return empty) and excludes
      // `<html>` on a Document. Mechanically applying the suggestion would
      // silently disable defenses inside shadow DOM (noscript-strip,
      // hidden-text-strip, unicode-invisibles-strip, trust-badge-annotate,
      // closed-shadow-root-annotate, …). The Element-receiver sites where
      // `:scope` *is* safe are all single-compound selectors with no
      // descendant combinator, so there's no correctness upside there either.
      // The rule can't narrow to Element receivers or combinator selectors,
      // so enabling it means breaking shadow-DOM scans or scoped-disabling
      // ~10+ correct sites. Not worth it. See #279.
      "unicorn/prefer-scoped-selector": "off",
      // Warn — ratchet to error in #279:
      "unicorn/no-break-in-nested-loop": "warn",
      // no-global-object-property-assignment stays at its recommended `error`
      // for production code; it's disabled only for tests (which legitimately
      // assign globals to set up mocks) in the test-files block below.
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
    files: [
      "src/**/__tests__/**/*.{ts,tsx}",
      // `__test-mocks__` is test infrastructure (loaded via Jest setupFiles);
      // it gets the same relaxations — same grouping tsconfig.test.json uses.
      "src/__test-mocks__/**/*.{ts,tsx}",
    ],
    plugins: { jest },
    rules: {
      // Tests legitimately use literal nulls and many small `for` loops.
      "unicorn/no-useless-undefined": "off",
      "unicorn/consistent-function-scoping": "off",
      // Tests assign onto global objects to install mocks / stubs; the rule
      // stays an error everywhere else.
      "unicorn/no-global-object-property-assignment": "off",
      // Tests reach for `globalThis.*` deliberately — overriding globals for
      // mocks (`globalThis.MutationObserver = …`) and dispatching events /
      // reading computed style against the jsdom global. Enforced in prod.
      "unicorn/no-unnecessary-global-this": "off",
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
