// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Test mock for the ESM-only `webext-messenger` package. ts-jest emits
// CommonJS, so importing the real package trips
// `SyntaxError: Unexpected token 'export'` — the same treatment `webext-storage`
// and `abort-utils` get (see jest.config.cjs moduleNameMapper).
//
// None of our unit tests exercise real cross-context messaging. Tests that
// assert on a specific messenger call mock `lib/messenger` directly; every
// other test only loads `lib/messenger` transitively (e.g. via `debug-trace`)
// and just needs its getMethod/getNotifier wrappers to be constructible and
// inert. So the senders here are no-op stubs and `registerMethods` does
// nothing.

export const backgroundTarget = { page: "background" };

const inertMethod = (): Promise<unknown> => Promise.resolve(undefined);

const inertNotifier = (): void => {
  // noop — notifications are fire-and-forget
};

export function getMethod(): () => Promise<unknown> {
  return inertMethod;
}

export function getNotifier(): () => void {
  return inertNotifier;
}

export function registerMethods(): void {
  // noop — no real receiver in the unit-test world
}
