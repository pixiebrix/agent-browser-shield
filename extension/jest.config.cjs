// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

/** @type {import("jest").Config} */
module.exports = {
  testEnvironment: "jsdom",
  testMatch: ["<rootDir>/src/**/__tests__/**/*.test.ts"],
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
  clearMocks: true,
};
