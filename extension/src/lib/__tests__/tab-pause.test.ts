// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import {
  isPauseActive,
  SNOOZE_1_HOUR_MS,
  SNOOZE_15_MIN_MS,
  TAB_PAUSE_STORAGE_KEY,
} from "../tab-pause";

const NOW = 1_700_000_000_000;

describe("isPauseActive", () => {
  it("is not active for a missing pause", () => {
    expect(isPauseActive(null, NOW)).toBe(false);
    expect(isPauseActive(undefined, NOW)).toBe(false);
  });

  it("is active for a no-time-limit pause (reveal / pause-this-tab)", () => {
    expect(isPauseActive({ scope: "page", expiresAt: null }, NOW)).toBe(true);
    expect(isPauseActive({ scope: "tab", expiresAt: null }, NOW)).toBe(true);
  });

  it("is active while a timed snooze still has time left", () => {
    expect(isPauseActive({ scope: "tab", expiresAt: NOW + 1 }, NOW)).toBe(true);
  });

  it("is not active once a timed snooze has elapsed", () => {
    // The deadline itself counts as expired — strictly-greater semantics.
    expect(isPauseActive({ scope: "tab", expiresAt: NOW }, NOW)).toBe(false);
    expect(isPauseActive({ scope: "tab", expiresAt: NOW - 1 }, NOW)).toBe(
      false,
    );
  });

  it("fails safe (not active) on a malformed expiresAt", () => {
    expect(
      isPauseActive(
        { scope: "tab", expiresAt: undefined as unknown as number },
        NOW,
      ),
    ).toBe(false);
    expect(
      isPauseActive(
        { scope: "tab", expiresAt: "soon" as unknown as number },
        NOW,
      ),
    ).toBe(false);
  });
});

describe("snooze constants", () => {
  it("encodes the two presets in milliseconds", () => {
    expect(SNOOZE_15_MIN_MS).toBe(15 * 60 * 1000);
    expect(SNOOZE_1_HOUR_MS).toBe(60 * 60 * 1000);
  });

  it("namespaces the storage key", () => {
    expect(TAB_PAUSE_STORAGE_KEY).toMatch(/^agent-browser-shield\./);
  });
});
