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
  defaultEnabled: true,
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

import { isTopFrame } from "../frame";
import { start } from "../rule-engine";
import { getRuleStates } from "../storage";

const getRuleStatesMock = getRuleStates as jest.MockedFunction<
  typeof getRuleStates
>;
const isTopFrameMock = isTopFrame as jest.MockedFunction<typeof isTopFrame>;

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
  document.body.innerHTML = "<main></main>";
  (allFrameRule.apply as jest.Mock).mockClear();
  (topOnlyRule.apply as jest.Mock).mockClear();
  (unavailableRule.apply as jest.Mock).mockClear();
  getRuleStatesMock.mockResolvedValue(allEnabled);
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
