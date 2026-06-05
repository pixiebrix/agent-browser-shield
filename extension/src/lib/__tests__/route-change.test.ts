// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Tests for the shared route-change emitter. jsdom doesn't ship the
// Navigation API, so the Navigation-API path is exercised indirectly via
// the popstate / hashchange listeners — those are what older browsers and
// the test environment actually surface.

import {
  __resetRouteChangeForTesting,
  subscribeRouteChange,
} from "../route-change";

beforeEach(() => {
  __resetRouteChangeForTesting();
  // Reset the URL between tests — jsdom's location persists across cases.
  history.replaceState(null, "", "/initial");
});

afterEach(() => {
  __resetRouteChangeForTesting();
});

describe("subscribeRouteChange", () => {
  it("fires the listener when popstate changes the URL", () => {
    const listener = jest.fn();
    subscribeRouteChange(listener);

    history.replaceState(null, "", "/next");
    globalThis.dispatchEvent(new Event("popstate"));

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("fires the listener on hashchange when the URL changes", () => {
    const listener = jest.fn();
    subscribeRouteChange(listener);

    history.replaceState(null, "", "/initial#section");
    globalThis.dispatchEvent(new Event("hashchange"));

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("dedupes — same URL across events fires the listener once", () => {
    const listener = jest.fn();
    subscribeRouteChange(listener);

    history.replaceState(null, "", "/next");
    globalThis.dispatchEvent(new Event("popstate"));
    // Same URL — same event again should be a no-op.
    globalThis.dispatchEvent(new Event("popstate"));

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("fans out to multiple subscribers", () => {
    const a = jest.fn();
    const b = jest.fn();
    subscribeRouteChange(a);
    subscribeRouteChange(b);

    history.replaceState(null, "", "/next");
    globalThis.dispatchEvent(new Event("popstate"));

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("unsubscribe stops the listener from firing", () => {
    const listener = jest.fn();
    const unsubscribe = subscribeRouteChange(listener);
    unsubscribe();

    history.replaceState(null, "", "/next");
    globalThis.dispatchEvent(new Event("popstate"));

    expect(listener).not.toHaveBeenCalled();
  });

  it("does not fire when the URL is unchanged across multiple events", () => {
    const listener = jest.fn();
    subscribeRouteChange(listener);

    // Same URL — should not emit at all.
    globalThis.dispatchEvent(new Event("popstate"));
    globalThis.dispatchEvent(new Event("hashchange"));

    expect(listener).not.toHaveBeenCalled();
  });
});
