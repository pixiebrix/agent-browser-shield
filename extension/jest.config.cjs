// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

/** @type {import("jest").Config} */
module.exports = {
  testEnvironment: "jsdom",
  testMatch: [
    "<rootDir>/src/**/__tests__/**/*.test.ts",
    "<rootDir>/scripts/**/__tests__/**/*.test.ts",
  ],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          target: "ES2022",
          module: "CommonJS",
          moduleResolution: "node",
          jsx: "react-jsx",
          esModuleInterop: true,
          strict: true,
          lib: ["ES2022", "DOM", "DOM.Iterable"],
          types: ["jest", "chrome", "node"],
          ignoreDeprecations: "6.0",
        },
        useESM: false,
        diagnostics: { ignoreCodes: ["TS151001"] },
      },
    ],
  },
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  // `webext-storage` is published as ESM-only and our ts-jest config emits
  // CommonJS, so importing it directly trips a `SyntaxError: Unexpected token
  // 'export'`. None of our tests exercise the real storage flow (they mock the
  // storage modules wholesale), so route the import to a small CJS stub.
  moduleNameMapper: {
    "^webext-storage$": "<rootDir>/src/__test-mocks__/webext-storage.ts",
  },
  // - jest-webextension-mock: installs globalThis.chrome + browser with
  //   jest.fn() stubs for MV2/MV3 APIs the extension uses (runtime, storage,
  //   tabs, action, browserAction). Tests reference `chrome.*` directly.
  // - chrome-mv3-extras: adds chrome.scripting (MV3 content-script
  //   registration), which jest-webextension-mock 4.1 does not include.
  // - jsdom-extras: polyfills/stubs for browser APIs jsdom omits
  //   (Element.checkVisibility) or returns degenerate values for
  //   (offsetWidth/offsetHeight). Centralized so tests don't redo the same
  //   Object.defineProperty dance.
  setupFiles: [
    "jest-webextension-mock",
    "<rootDir>/src/__test-mocks__/chrome-mv3-extras.ts",
    "<rootDir>/src/__test-mocks__/jsdom-extras.ts",
  ],
  clearMocks: true,
  collectCoverageFrom: [
    "src/lib/**/*.ts",
    "src/rules/**/*.ts",
    "src/options/parse-config.ts",
    "scripts/**/*.ts",
    "data/site-rules.schema.ts",
    "!**/*.generated.*",
    "!**/__tests__/**",
    "!src/__test-mocks__/**",
    // UI/React glue and runtime entry points aren't unit-tested via jest —
    // exercising them requires the loaded extension. Counting them here would
    // make the threshold meaningless. If we add component tests for them
    // later, include them then.
    "!src/lib/*.tsx",
    "!src/lib/options-badge.ts",
    "!src/lib/options-button-toggle.ts",
    "!src/lib/use-chrome-storage-value.ts",
    "!src/lib/use-transient-status.ts",
    "!src/lib/placeholder-count.ts",
    "!src/lib/placeholder-display.ts",
    "!src/lib/llm-background.ts",
    "!src/lib/llm-client.ts",
    "!src/lib/page-tree.ts",
    "!src/lib/wait-for-settle.ts",
    "!src/lib/automation-element-reference.ts",
    "!src/lib/enforcement.ts",
    "!src/lib/frame.ts",
    // `webdriver-probe-source.ts` defines `installProbe`, which the rule
    // serializes via `Function.prototype.toString` and ships into the
    // page world via inline `<script>` `textContent`. Istanbul
    // instrumentation injects `cov_*` counter references into the
    // serialized source; jsdom then `ReferenceError`s when executing the
    // injected script (the counters live in the test world, not the page
    // world). The function is exercised end-to-end by the rule's tests
    // via the apply flow; excluding the file from coverage keeps the
    // serialize-and-inject path viable.
    "!src/lib/webdriver-probe-source.ts",
  ],
  // Ratchet, not aspiration: thresholds sit just under the current baseline so
  // CI fails on a regression but doesn't block today's PR. Per Jest's rules,
  // path-specific thresholds (./src/rules/) are evaluated against those files
  // only; "global" applies to the rest (lib/, options/parse-config, scripts/,
  // data/). The two ranges differ because src/rules/ is the security surface
  // and held to a higher bar. Note: scripts/ is mostly codegen with ~0%
  // coverage and drags the global average down; that's why global sits well
  // below the all-files summary number.
  coverageThreshold: {
    global: {
      statements: 70,
      branches: 65,
      functions: 71,
      lines: 70,
    },
    "./src/rules/": {
      statements: 91,
      branches: 78,
      functions: 96,
      lines: 91,
    },
  },
};
