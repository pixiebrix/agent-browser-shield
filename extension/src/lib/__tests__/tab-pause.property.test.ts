// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Property tests for the tab-pause liveness check. Two invariants the example
// tests can't exhaust:
//   - A no-time-limit pause is active at every instant.
//   - A timed pause is active exactly when its deadline is strictly in the
//     future, for any deadline/now pair.

import fc from "fast-check";
import type { TabPause } from "../tab-pause";
import { isPauseActive } from "../tab-pause";

const scope = fc.constantFrom<TabPause["scope"]>("page", "tab");

describe("isPauseActive properties", () => {
  it("a no-time-limit pause is active at every instant", () => {
    fc.assert(
      fc.property(scope, fc.integer(), (s, now) => {
        expect(isPauseActive({ scope: s, expiresAt: null }, now)).toBe(true);
      }),
    );
  });

  it("a timed pause is active iff its deadline is in the future", () => {
    fc.assert(
      fc.property(scope, fc.integer(), fc.integer(), (s, expiresAt, now) => {
        expect(isPauseActive({ scope: s, expiresAt }, now)).toBe(
          expiresAt > now,
        );
      }),
    );
  });
});
