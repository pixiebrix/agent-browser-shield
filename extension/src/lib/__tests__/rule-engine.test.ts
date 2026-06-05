/**
 * @jest-environment jsdom
 */
import type { Rule } from "../../rules/types";

// Storage and RULES are mocked because the real engine pulls in the full rule
// catalog (and via that, the EasyList stylesheet — multi-MB of CSS text). The
// engine module itself is the unit under test; we want to assert how it
// chooses what to apply, not exercise every shipped rule.

const buildRule = (id: string, overrides: Partial<Rule> = {}): Rule => ({
  id,
  label: id,
  description: id,
  apply: jest.fn(),
  teardown: jest.fn(),
  ...overrides,
});

const allFrameRule = buildRule("all-frame-rule");
const topOnlyRule = buildRule("top-only-rule", { topFrameOnly: true });
const unavailableRule = buildRule("unavailable-rule", { available: false });

const FAKE_RULES: readonly Rule[] = [
  allFrameRule,
  topOnlyRule,
  unavailableRule,
];

jest.mock("../../rules", () => ({
  RULES: FAKE_RULES,
}));

jest.mock("../storage", () => ({
  getRuleStates: jest.fn(),
  subscribe: jest.fn(() => () => undefined),
}));

jest.mock("../placeholder-display", () => ({
  getPlaceholderDisplayMode: jest.fn(() => Promise.resolve("icon")),
  subscribePlaceholderDisplayMode: jest.fn(() => () => undefined),
  PLACEHOLDER_DISPLAY_MODE_DEFAULT: "icon",
}));

jest.mock("../frame", () => ({
  isTopFrame: jest.fn(),
}));

jest.mock("../enforcement", () => ({
  getEnforcementEnabled: jest.fn(() => Promise.resolve(true)),
  subscribeEnforcementEnabled: jest.fn(() => () => undefined),
  ENFORCEMENT_ENABLED_DEFAULT: true,
}));

// Mock availability so tests can drive availability-flip reconciliation
// directly. The real module subscribes to user-api-key changes underneath,
// which the engine doesn't need to know about for unit coverage.
jest.mock("../availability", () => ({
  getRuleAvailabilityStates: jest.fn(),
  subscribeRuleAvailability: jest.fn(() => () => undefined),
}));

// Mock revealAll so we can assert it fires when a rule is disabled, without
// the real implementation walking the DOM for placeholder elements that
// don't exist in these unit tests.
jest.mock("../placeholder", () => {
  const actual = jest.requireActual<Record<string, unknown>>("../placeholder");
  return {
    ...actual,
    revealAll: jest.fn(),
  };
});

import type { RuleAvailabilityStates } from "../availability";
import {
  getRuleAvailabilityStates,
  subscribeRuleAvailability,
} from "../availability";
import { subscribeEnforcementEnabled } from "../enforcement";
import { isTopFrame } from "../frame";
import { revealAll } from "../placeholder";
import { start } from "../rule-engine";
import { getRuleStates, subscribe } from "../storage";

const getRuleStatesMock = getRuleStates as jest.MockedFunction<
  typeof getRuleStates
>;
const isTopFrameMock = isTopFrame as jest.MockedFunction<typeof isTopFrame>;
const getAvailabilityMock = getRuleAvailabilityStates as jest.MockedFunction<
  typeof getRuleAvailabilityStates
>;
const subscribeStorageMock = subscribe as jest.MockedFunction<typeof subscribe>;
const subscribeEnforcementMock =
  subscribeEnforcementEnabled as jest.MockedFunction<
    typeof subscribeEnforcementEnabled
  >;
const subscribeAvailabilityMock =
  subscribeRuleAvailability as jest.MockedFunction<
    typeof subscribeRuleAvailability
  >;
const revealAllMock = revealAll as jest.MockedFunction<typeof revealAll>;

const ALL_AVAILABLE: RuleAvailabilityStates = {
  "all-frame-rule": { available: true },
  "top-only-rule": { available: true },
  "unavailable-rule": { available: false, reason: "unavailable" },
};

const allEnabled = {
  "all-frame-rule": true,
  "top-only-rule": true,
  "unavailable-rule": true,
};

function setFrame(isTop: boolean): void {
  // jsdom locks `window.top` as a non-configurable getter, so we mock the
  // helper module instead of trying to override the global. The engine reads
  // through `isTopFrame()`, which makes this both safer and faster.
  isTopFrameMock.mockReturnValue(isTop);
}

beforeEach(() => {
  // Tests in "missing document.body" remove the body element; restore it so
  // subsequent tests can mutate innerHTML. TS lib types `document.body` as
  // non-null, but jsdom honors the removal we did and returns null here.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!document.body) {
    document.documentElement.append(document.createElement("body"));
  }
  document.body.innerHTML = "<main></main>";
  for (const rule of FAKE_RULES) {
    (rule.apply as jest.Mock).mockClear();
    (rule.teardown as jest.Mock).mockClear();
  }
  getRuleStatesMock.mockResolvedValue(allEnabled);
  getAvailabilityMock.mockResolvedValue(ALL_AVAILABLE);
  revealAllMock.mockClear();
});

describe("rule engine — frame gating", () => {
  it("applies both top-only and frame-agnostic rules in the top frame", async () => {
    setFrame(true);
    await start();
    expect(allFrameRule.apply).toHaveBeenCalledTimes(1);
    expect(topOnlyRule.apply).toHaveBeenCalledTimes(1);
  });

  it("skips top-only rules in subframes", async () => {
    setFrame(false);
    await start();
    expect(allFrameRule.apply).toHaveBeenCalledTimes(1);
    expect(topOnlyRule.apply).not.toHaveBeenCalled();
  });

  it("never applies rules marked unavailable, regardless of frame", async () => {
    setFrame(true);
    await start();
    expect(unavailableRule.apply).not.toHaveBeenCalled();
  });
});

describe("rule engine — reconciliation", () => {
  // Subscriptions are wired inside start(); pull the listeners back out of the
  // mock so each test can drive them with new snapshots.
  async function startAndCaptureListeners(): Promise<{
    onStorageChange: (next: typeof allEnabled) => void;
    onEnforcementChange: (enabled: boolean) => void;
    onAvailabilityChange: (next: typeof ALL_AVAILABLE) => void;
  }> {
    setFrame(true);
    await start();
    const storageCall = subscribeStorageMock.mock.calls.at(-1);
    const enforcementCall = subscribeEnforcementMock.mock.calls.at(-1);
    const availabilityCall = subscribeAvailabilityMock.mock.calls.at(-1);
    if (!storageCall || !enforcementCall || !availabilityCall) {
      throw new Error("start() did not subscribe");
    }
    return {
      onStorageChange: storageCall[0],
      onEnforcementChange: enforcementCall[0],
      onAvailabilityChange: availabilityCall[0],
    };
  }

  it("applies a rule when storage flips it on", async () => {
    getRuleStatesMock.mockResolvedValue({
      ...allEnabled,
      "all-frame-rule": false,
    });
    const { onStorageChange } = await startAndCaptureListeners();
    expect(allFrameRule.apply).not.toHaveBeenCalled();

    onStorageChange(allEnabled);

    expect(allFrameRule.apply).toHaveBeenCalledTimes(1);
    expect(allFrameRule.teardown).not.toHaveBeenCalled();
  });

  it("tears down and reveals a rule when storage flips it off", async () => {
    const { onStorageChange } = await startAndCaptureListeners();
    expect(allFrameRule.apply).toHaveBeenCalledTimes(1);

    onStorageChange({ ...allEnabled, "all-frame-rule": false });

    expect(revealAllMock).toHaveBeenCalledWith("all-frame-rule");
    expect(allFrameRule.teardown).toHaveBeenCalledTimes(1);
  });

  it("does nothing for a rule whose effective state didn't change", async () => {
    const { onStorageChange } = await startAndCaptureListeners();
    (allFrameRule.apply as jest.Mock).mockClear();

    // Re-emit the same states — reconcile should be a no-op for every rule.
    onStorageChange({ ...allEnabled });

    expect(allFrameRule.apply).not.toHaveBeenCalled();
    expect(allFrameRule.teardown).not.toHaveBeenCalled();
  });

  it("tears down all rules when enforcement is disabled", async () => {
    const { onEnforcementChange } = await startAndCaptureListeners();
    expect(allFrameRule.apply).toHaveBeenCalledTimes(1);
    expect(topOnlyRule.apply).toHaveBeenCalledTimes(1);

    onEnforcementChange(false);

    expect(allFrameRule.teardown).toHaveBeenCalledTimes(1);
    expect(topOnlyRule.teardown).toHaveBeenCalledTimes(1);
  });

  it("re-applies rules when enforcement flips back on", async () => {
    const { onEnforcementChange } = await startAndCaptureListeners();
    onEnforcementChange(false);
    (allFrameRule.apply as jest.Mock).mockClear();
    (topOnlyRule.apply as jest.Mock).mockClear();

    onEnforcementChange(true);

    expect(allFrameRule.apply).toHaveBeenCalledTimes(1);
    expect(topOnlyRule.apply).toHaveBeenCalledTimes(1);
  });

  it("tears down a rule when its availability flips to false", async () => {
    const { onAvailabilityChange } = await startAndCaptureListeners();
    expect(allFrameRule.apply).toHaveBeenCalledTimes(1);

    onAvailabilityChange({
      ...ALL_AVAILABLE,
      "all-frame-rule": { available: false, reason: "now unavailable" },
    });

    expect(allFrameRule.teardown).toHaveBeenCalledTimes(1);
  });

  it("applies a rule when its availability flips to true", async () => {
    const { onAvailabilityChange } = await startAndCaptureListeners();
    // unavailable-rule started unavailable → never applied at start().
    expect(unavailableRule.apply).not.toHaveBeenCalled();

    onAvailabilityChange({
      ...ALL_AVAILABLE,
      "unavailable-rule": { available: true },
    });

    expect(unavailableRule.apply).toHaveBeenCalledTimes(1);
  });
});

describe("rule engine — missing document.body", () => {
  it("skips initial application when document.body is absent", async () => {
    // Some about:blank / about:srcdoc iframes hit document_idle without a
    // body. The engine logs and returns; rules must not be invoked with null.
    document.body.remove();
    setFrame(true);

    await expect(start()).resolves.toBeUndefined();
    expect(allFrameRule.apply).not.toHaveBeenCalled();
    expect(topOnlyRule.apply).not.toHaveBeenCalled();
  });

  it("skips reconciliation when document.body is absent on a state change", async () => {
    setFrame(true);
    await start();
    const onStorageChange = subscribeStorageMock.mock.calls.at(-1)?.[0];
    if (!onStorageChange) {
      throw new Error("no storage listener");
    }
    (allFrameRule.apply as jest.Mock).mockClear();
    (allFrameRule.teardown as jest.Mock).mockClear();

    document.body.remove();
    onStorageChange({ ...allEnabled, "all-frame-rule": false });

    expect(allFrameRule.apply).not.toHaveBeenCalled();
    expect(allFrameRule.teardown).not.toHaveBeenCalled();
  });
});
