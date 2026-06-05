// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import type { AvailabilitySnapshot, Rule } from "../../rules/types";

// The rule catalog imports the entire EasyList stylesheet via ads-hide; mock
// `../../rules` to a small fixture catalog so this test only exercises the
// availability module itself.
const staticAvailableRule: Rule = {
  id: "static-available-rule",
  label: "static-available",
  description: "available because no `available` field set",
  apply: jest.fn(),
};
const staticTrueRule: Rule = {
  id: "static-true-rule",
  label: "static-true",
  description: "available: true",
  apply: jest.fn(),
  available: true,
};
const staticFalseRule: Rule = {
  id: "static-false-rule",
  label: "static-false",
  description: "available: false with no reason",
  apply: jest.fn(),
  available: false,
};
const staticFalseWithReasonRule: Rule = {
  id: "static-false-reason-rule",
  label: "static-false-reason",
  description: "available: false with unavailableReason",
  apply: jest.fn(),
  available: false,
  unavailableReason: "build did not ship the optional dependency",
};
const reactiveSubscribeMock = jest.fn<() => void, [() => void]>();
const reactiveGetMock = jest.fn<Promise<AvailabilitySnapshot>, []>();
const reactiveRule: Rule = {
  id: "reactive-rule",
  label: "reactive",
  description: "object-form `available` accessor",
  apply: jest.fn(),
  available: {
    get: reactiveGetMock,
    subscribe: reactiveSubscribeMock,
  },
};

const FAKE_RULES: readonly Rule[] = [
  staticAvailableRule,
  staticTrueRule,
  staticFalseRule,
  staticFalseWithReasonRule,
  reactiveRule,
];

jest.mock("../../rules", () => ({
  RULES: FAKE_RULES,
}));

// `HAS_BUILT_IN_OPENAI_KEY` is read off the mocked module via the getter so
// individual tests can flip it. `getUserApiKey` / `subscribeUserApiKey` are
// jest.fn()s the createApiKeyAvailability tests drive.
let mockHasBuiltInKey = false;
const mockGetUserApiKey = jest.fn<Promise<string>, []>();
const mockSubscribeUserApiKey = jest.fn<() => void, [(key: string) => void]>();

jest.mock("../api-key-storage", () => ({
  get HAS_BUILT_IN_OPENAI_KEY() {
    return mockHasBuiltInKey;
  },
  getUserApiKey: () => mockGetUserApiKey(),
  subscribeUserApiKey: (listener: (key: string) => void) =>
    mockSubscribeUserApiKey(listener),
}));

import {
  availabilitySource,
  createApiKeyAvailability,
  getRuleAvailabilityStates,
  resolveAvailability,
  subscribeRuleAvailability,
} from "../availability";

beforeEach(() => {
  reactiveSubscribeMock.mockReset();
  reactiveGetMock.mockReset();
  mockGetUserApiKey.mockReset();
  mockSubscribeUserApiKey.mockReset();
  mockHasBuiltInKey = false;
});

describe("resolveAvailability", () => {
  it("returns ALWAYS_AVAILABLE for a rule with no `available` field", async () => {
    await expect(resolveAvailability(staticAvailableRule)).resolves.toEqual({
      available: true,
    });
  });

  it("returns ALWAYS_AVAILABLE for `available: true`", async () => {
    await expect(resolveAvailability(staticTrueRule)).resolves.toEqual({
      available: true,
    });
  });

  it("returns `{ available: false }` without reason for `available: false` + no unavailableReason", async () => {
    await expect(resolveAvailability(staticFalseRule)).resolves.toEqual({
      available: false,
    });
  });

  it("includes the unavailableReason when one is set", async () => {
    await expect(
      resolveAvailability(staticFalseWithReasonRule),
    ).resolves.toEqual({
      available: false,
      reason: "build did not ship the optional dependency",
    });
  });

  it("delegates to the reactive accessor's get() for object-form availability", async () => {
    reactiveGetMock.mockResolvedValueOnce({
      available: false,
      reason: "user needs to log in",
    });
    await expect(resolveAvailability(reactiveRule)).resolves.toEqual({
      available: false,
      reason: "user needs to log in",
    });
    expect(reactiveGetMock).toHaveBeenCalledTimes(1);
  });
});

describe("getRuleAvailabilityStates", () => {
  it("produces a snapshot keyed by rule id with each rule's resolved state", async () => {
    reactiveGetMock.mockResolvedValueOnce({ available: true });

    const snapshot = await getRuleAvailabilityStates();

    expect(snapshot).toEqual({
      "static-available-rule": { available: true },
      "static-true-rule": { available: true },
      "static-false-rule": { available: false },
      "static-false-reason-rule": {
        available: false,
        reason: "build did not ship the optional dependency",
      },
      "reactive-rule": { available: true },
    });
  });
});

describe("subscribeRuleAvailability", () => {
  it("subscribes only to rules with a reactive (object) `available`", () => {
    reactiveSubscribeMock.mockReturnValue(jest.fn());

    subscribeRuleAvailability(jest.fn());

    // Only `reactiveRule` carries a subscribe(); the four static rules don't.
    expect(reactiveSubscribeMock).toHaveBeenCalledTimes(1);
  });

  it("invokes the listener with a freshly-resolved snapshot when an upstream source fires", async () => {
    reactiveSubscribeMock.mockReturnValue(jest.fn());
    reactiveGetMock.mockResolvedValue({ available: true });

    const listener = jest.fn();
    subscribeRuleAvailability(listener);

    // Pull the refresh callback that subscribeRuleAvailability registered and
    // fire it as if the underlying source emitted a change.
    const refresh = reactiveSubscribeMock.mock.calls[0]?.[0];
    if (!refresh) {
      throw new Error("subscribeRuleAvailability did not register a refresh");
    }
    refresh();
    // refresh() chains getRuleAvailabilityStates → Promise.all over RULES →
    // Object.fromEntries → .then(listener). Drain enough microtasks to clear
    // all of them.
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        "reactive-rule": { available: true },
        "static-true-rule": { available: true },
      }),
    );
  });

  it("unsubscribes every reactive source when the returned cleanup runs", () => {
    const reactiveUnsub = jest.fn();
    reactiveSubscribeMock.mockReturnValue(reactiveUnsub);

    const cleanup = subscribeRuleAvailability(jest.fn());
    expect(reactiveUnsub).not.toHaveBeenCalled();

    cleanup();
    expect(reactiveUnsub).toHaveBeenCalledTimes(1);
  });
});

describe("availabilitySource", () => {
  it("exposes get and subscribe wired to the module functions", () => {
    expect(availabilitySource.get).toBe(getRuleAvailabilityStates);
    expect(availabilitySource.subscribe).toBe(subscribeRuleAvailability);
  });

  it("is frozen so consumers can't mutate the bundle", () => {
    expect(Object.isFrozen(availabilitySource)).toBe(true);
  });
});

describe("createApiKeyAvailability", () => {
  const REASON = "Set an OpenAI API key on the options page.";

  it("returns `{ available: true }` unconditionally when the build bundled a key", async () => {
    mockHasBuiltInKey = true;
    const availability = createApiKeyAvailability(REASON);

    await expect(availability.get()).resolves.toEqual({ available: true });
    // User-key lookup is short-circuited — never consulted.
    expect(mockGetUserApiKey).not.toHaveBeenCalled();
  });

  it("returns `{ available: true }` when the user supplied a key", async () => {
    mockHasBuiltInKey = false;
    mockGetUserApiKey.mockResolvedValueOnce("sk-user-key");
    const availability = createApiKeyAvailability(REASON);

    await expect(availability.get()).resolves.toEqual({ available: true });
  });

  it("returns `{ available: false, reason }` when no key is configured", async () => {
    mockHasBuiltInKey = false;
    mockGetUserApiKey.mockResolvedValueOnce("");
    const availability = createApiKeyAvailability(REASON);

    await expect(availability.get()).resolves.toEqual({
      available: false,
      reason: REASON,
    });
  });

  it("subscribes to user-key changes via subscribeUserApiKey", () => {
    const unsub = jest.fn();
    mockSubscribeUserApiKey.mockReturnValueOnce(unsub);
    const availability = createApiKeyAvailability(REASON);

    const listener = jest.fn();
    const cleanup = availability.subscribe(listener);

    expect(mockSubscribeUserApiKey).toHaveBeenCalledTimes(1);
    expect(mockSubscribeUserApiKey).toHaveBeenCalledWith(listener);
    cleanup();
    expect(unsub).toHaveBeenCalledTimes(1);
  });
});
