import { RULE_ATTR } from "../../lib/dom-markers";
import { PLACEHOLDER_CLASS } from "../../lib/placeholder";
import {
  countdownTimerRedactRule,
  matchesTimerPattern,
  parseTotalSeconds,
} from "../countdown-timer-redact";

const SNAPSHOT_DELAY_MS = 1500;
const MUTATION_THROTTLE_MS = 250;

// jsdom batches MutationObserver delivery on a microtask. Use this in tests
// that add nodes after apply() to make sure the observer callback has run
// before we advance fake timers.
async function flushMutations(): Promise<void> {
  await Promise.resolve();
}

beforeEach(() => {
  document.body.innerHTML = "";
  jest.useFakeTimers();
});

afterEach(() => {
  countdownTimerRedactRule.teardown();
  jest.useRealTimers();
});

describe("matchesTimerPattern", () => {
  it("matches HH:MM:SS", () => {
    expect(matchesTimerPattern("12:34:56")).toBe(true);
  });

  it("matches MM:SS", () => {
    expect(matchesTimerPattern("05:30")).toBe(true);
  });

  it("matches multi-unit forms with words", () => {
    expect(matchesTimerPattern("1 day 4 hours")).toBe(true);
    expect(matchesTimerPattern("2 hours 30 minutes")).toBe(true);
  });

  it("matches multi-unit forms with abbreviations", () => {
    expect(matchesTimerPattern("1h 23m")).toBe(true);
    expect(matchesTimerPattern("5m 30s")).toBe(true);
  });

  it("matches urgency phrasing with a single unit", () => {
    expect(matchesTimerPattern("30 seconds left")).toBe(true);
    expect(matchesTimerPattern("15 minutes remaining")).toBe(true);
  });

  it("does not match arbitrary numbers", () => {
    expect(matchesTimerPattern("Item #123456")).toBe(false);
    expect(matchesTimerPattern("Save 30%")).toBe(false);
  });

  it("does not match invalid clock-style values", () => {
    // 78 is not a valid minute value.
    expect(matchesTimerPattern("12:78")).toBe(false);
  });

  it("does not match a bare unit count without urgency context", () => {
    expect(matchesTimerPattern("30 seconds")).toBe(false);
  });
});

describe("parseTotalSeconds", () => {
  it("parses HH:MM:SS", () => {
    expect(parseTotalSeconds("01:02:03")).toBe(3723);
  });

  it("parses MM:SS as minutes and seconds", () => {
    expect(parseTotalSeconds("05:30")).toBe(330);
  });

  it("parses multi-unit abbreviations", () => {
    expect(parseTotalSeconds("1h 23m 45s")).toBe(1 * 3600 + 23 * 60 + 45);
  });

  it("parses days alongside other units", () => {
    expect(parseTotalSeconds("2 days 3 hours")).toBe(2 * 86_400 + 3 * 3600);
  });

  it("returns null when no time value is present", () => {
    expect(parseTotalSeconds("hello world")).toBeNull();
  });
});

describe("countdownTimerRedactRule", () => {
  it("hides an element whose colon-style timer value decreased after 1.5s", () => {
    document.body.innerHTML = `<span id="t">12:34:56</span>`;
    countdownTimerRedactRule.apply(document.body);

    // No placeholder yet — snapshot hasn't fired.
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();

    // Simulate the timer ticking down before the snapshot fires.
    const timer = document.querySelector("#t");
    if (timer) {
      timer.textContent = "12:34:55";
    }

    jest.advanceTimersByTime(SNAPSHOT_DELAY_MS);

    expect(document.querySelector("#t")).toBeNull();
    const placeholder = document.querySelector(`.${PLACEHOLDER_CLASS}`);
    expect(placeholder).not.toBeNull();
    expect(placeholder?.getAttribute(RULE_ATTR)).toBe("countdown-timer-redact");
    expect(placeholder?.textContent).toContain("countdown timer hidden");
  });

  it("hides an element whose unit-style timer value decreased", () => {
    document.body.innerHTML = `<div id="t">5m 30s</div>`;
    countdownTimerRedactRule.apply(document.body);

    const timer = document.querySelector("#t");
    if (timer) {
      timer.textContent = "5m 29s";
    }

    jest.advanceTimersByTime(SNAPSHOT_DELAY_MS);

    expect(document.querySelector("#t")).toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).not.toBeNull();
  });

  it("leaves static clock-shaped text alone", () => {
    document.body.innerHTML = `<span>Posted at 12:34</span>`;
    countdownTimerRedactRule.apply(document.body);

    jest.advanceTimersByTime(SNAPSHOT_DELAY_MS);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
    expect(document.querySelector("span")).not.toBeNull();
  });

  it("ignores text that changes but is not counting down", () => {
    document.body.innerHTML = `<span id="t">05:30</span>`;
    countdownTimerRedactRule.apply(document.body);

    // Stopwatch-style increment — should not be hidden.
    const timer = document.querySelector("#t");
    if (timer) {
      timer.textContent = "05:31";
    }

    jest.advanceTimersByTime(SNAPSHOT_DELAY_MS);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
    expect(document.querySelector("#t")).not.toBeNull();
  });

  it("skips elements whose value did not change during the window", () => {
    document.body.innerHTML = `<span>12:34:56</span>`;
    countdownTimerRedactRule.apply(document.body);

    jest.advanceTimersByTime(SNAPSHOT_DELAY_MS);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
    expect(document.querySelector("span")).not.toBeNull();
  });

  it("hides the innermost timer element when nested wrappers also match", () => {
    document.body.innerHTML = `
      <div id="outer">
        Sale ends in
        <span id="inner">10:00</span>
      </div>
    `;
    countdownTimerRedactRule.apply(document.body);

    const inner = document.querySelector("#inner");
    if (inner) {
      inner.textContent = "09:59";
    }

    jest.advanceTimersByTime(SNAPSHOT_DELAY_MS);

    expect(document.querySelector("#outer")).not.toBeNull();
    expect(document.querySelector("#inner")).toBeNull();
    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(1);
  });

  it("ignores elements whose text content is too long to be a timer", () => {
    document.body.innerHTML = `<p id="t">Lorem ipsum dolor sit amet, consectetur adipiscing elit — countdown 10:00 here for context.</p>`;
    countdownTimerRedactRule.apply(document.body);

    const node = document.querySelector("#t");
    if (node) {
      node.textContent =
        "Lorem ipsum dolor sit amet, consectetur adipiscing elit — countdown 09:59 here for context.";
    }

    jest.advanceTimersByTime(SNAPSHOT_DELAY_MS);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
    expect(document.querySelector("#t")).not.toBeNull();
  });

  it("does not process text inside SCRIPT or STYLE", () => {
    document.body.innerHTML = `
      <script>const t = "10:00";</script>
      <style>.x { content: "10:00"; }</style>
    `;
    countdownTimerRedactRule.apply(document.body);

    jest.advanceTimersByTime(SNAPSHOT_DELAY_MS);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });

  it("restores the original element on click", () => {
    document.body.innerHTML = `<span id="t">10:00</span>`;
    countdownTimerRedactRule.apply(document.body);

    const timer = document.querySelector("#t");
    if (timer) {
      timer.textContent = "09:59";
    }

    jest.advanceTimersByTime(SNAPSHOT_DELAY_MS);

    const placeholder = document.querySelector<HTMLElement>(
      `.${PLACEHOLDER_CLASS}`,
    );
    expect(placeholder).not.toBeNull();
    placeholder?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
    expect(document.querySelector("#t")).not.toBeNull();
  });

  it("does not re-process content inside an existing placeholder", () => {
    document.body.innerHTML = `
      <div class="${PLACEHOLDER_CLASS}">
        <span id="t">10:00</span>
      </div>
    `;
    countdownTimerRedactRule.apply(document.body);

    const timer = document.querySelector("#t");
    if (timer) {
      timer.textContent = "09:59";
    }

    jest.advanceTimersByTime(SNAPSHOT_DELAY_MS);

    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(1);
    expect(document.querySelector("#t")).not.toBeNull();
  });
});

describe("countdownTimerRedactRule lazy-loaded sections", () => {
  it("hides a timer that was injected after apply()", async () => {
    countdownTimerRedactRule.apply(document.body);

    // Simulate a lazy-loaded section appearing after first paint.
    const lazy = document.createElement("div");
    lazy.innerHTML = `<span id="t">10:00</span>`;
    document.body.append(lazy);

    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    const timer = document.querySelector("#t");
    if (timer) {
      timer.textContent = "09:59";
    }

    jest.advanceTimersByTime(SNAPSHOT_DELAY_MS);

    expect(document.querySelector("#t")).toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).not.toBeNull();
  });

  it("coalesces a burst of additions into a single scan via throttle", async () => {
    countdownTimerRedactRule.apply(document.body);

    // Rapidly append several wrapper sections that each contain a timer —
    // the throttled scan should batch them rather than scanning per insert.
    for (let i = 0; i < 5; i++) {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = `<span class="t" data-i="${i}">10:00</span>`;
      document.body.append(wrapper);
    }

    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    for (const span of document.querySelectorAll(".t")) {
      span.textContent = "09:59";
    }

    jest.advanceTimersByTime(SNAPSHOT_DELAY_MS);

    expect(document.querySelectorAll(".t")).toHaveLength(0);
    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(5);
  });

  it("teardown stops the observer so later additions are ignored", async () => {
    countdownTimerRedactRule.apply(document.body);
    countdownTimerRedactRule.teardown();

    const lazy = document.createElement("div");
    lazy.innerHTML = `<span id="t">10:00</span>`;
    document.body.append(lazy);

    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    const timer = document.querySelector("#t");
    if (timer) {
      timer.textContent = "09:59";
    }

    jest.advanceTimersByTime(SNAPSHOT_DELAY_MS);

    expect(document.querySelector("#t")).not.toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });

  it("teardown cancels pending snapshot timeouts from the initial scan", () => {
    document.body.innerHTML = `<span id="t">10:00</span>`;
    countdownTimerRedactRule.apply(document.body);

    const timer = document.querySelector("#t");
    if (timer) {
      timer.textContent = "09:59";
    }

    countdownTimerRedactRule.teardown();
    jest.advanceTimersByTime(SNAPSHOT_DELAY_MS);

    expect(document.querySelector("#t")).not.toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });

  it("does not loop when its own placeholder is inserted", async () => {
    document.body.innerHTML = `<span id="t">10:00</span>`;
    countdownTimerRedactRule.apply(document.body);

    const timer = document.querySelector("#t");
    if (timer) {
      timer.textContent = "09:59";
    }

    jest.advanceTimersByTime(SNAPSHOT_DELAY_MS);

    // After the snapshot replaces the original with a placeholder, the
    // observer should not re-process it.
    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS + SNAPSHOT_DELAY_MS);

    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(1);
  });
});
