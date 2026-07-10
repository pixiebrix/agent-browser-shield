import {
  confirmshameSanitizeRule,
  isConfirmshameLabel,
} from "../confirmshame-sanitize";

const MUTATION_THROTTLE_MS = 250;
const NEUTRAL_LABEL = "No thanks";

async function flushMutations(): Promise<void> {
  await Promise.resolve();
}

beforeEach(() => {
  document.body.replaceChildren();
  jest.useFakeTimers();
});

afterEach(() => {
  confirmshameSanitizeRule.teardown();
  jest.useRealTimers();
});

describe("isConfirmshameLabel", () => {
  it.each([
    "No, I'd rather pay full price",
    "I would rather pay full price",
    "I prefer to pay more",
    "I'd rather keep paying retail",
    "I'm fine paying full price",
    "I'm OK paying more",
    "I'm happy without the discount",
    "I'm fine without the offer",
    "I don't want to save money",
    "I do not want to save money",
    "I don't care about deals",
    "I don't need to get the discount",
    "I don't want to receive offers",
    "I hate saving money",
    "I dislike discounts",
    "I don't like deals",
    "I don't deserve a discount",
    "I love paying full price",
    "I enjoy overpaying",
    "Skip and miss out on this deal",
    "Continue without my discount",
    "Proceed and pay full price",
    "I'm not smart enough to save",
    "I'm not interested in saving money",
    "Maybe never",
    // Health / safety / family / privacy guilt
    "I don't want to protect my family",
    "I don't need to protect my account",
    "I don't care about my family",
    "I don't care about my kids",
    "I don't care about my privacy",
    "I don't care about my security",
    "I don't care about the safety of my family",
    "I'd rather be unsafe",
    "I would rather be vulnerable",
    "I'd rather be hacked",
    "I'm fine being unprotected",
    "I'm OK being at risk",
    // Loyalty / membership downgrade
    "Downgrade to basic",
    "Downgrade my account",
    "Downgrade my membership",
    "Remove my VIP benefits",
    "Forfeit my Gold status",
    "Give up my membership",
    "Drop my Premium",
    "Lose my Platinum perks",
    "I don't deserve VIP",
    // Gamification / streak loss
    "Lose my streak",
    "Forfeit all my XP",
    "Abandon my progress",
    "Sacrifice my rank",
    "Throw away my hard-earned points",
    "Give up all of my coins",
    "Yes, lose my streak",
    "Yes, reset my progress",
    "Yes, forfeit my XP",
    "Yes, lose 30 days",
    // Imperative self-commands
    "Make me pay full price",
    "Let me pay more",
    "Force me to pay retail",
    "Charge me more",
    "Charge me extra",
    "Charge me 20% more",
    "Charge me $5 more",
    "Stop helping me save",
    "Stop trying to help me find deals",
    "Don't help me save",
    "Don't help me protect my account",
    // Sarcastic acceptance
    "Sure, charge me",
    "Whatever, take my money",
    "Fine, take my cash",
    "Of course, I love spam",
    "Alright, charge me",
    // Reverse-positive ("Yes, [bad outcome]")
    "Yes, skip my savings",
    "Yes, forfeit my discount",
    "Yes, take away my coupon",
    "Yes, cancel my membership",
    "Yes, lose my streak", // also caught by gamification
    "Yes, pay full price",
    "Yes, charge me 20% more",
    "Yes, charge me $50 more",
    "Confirm: pay full price",
    "Confirm — pay more",
    "Yes, place my order without my discount",
    "Yes, place order without the coupon",
  ])("matches confirmshame copy: %s", (text) => {
    expect(isConfirmshameLabel(text)).toBe(true);
  });

  it.each([
    "No thanks",
    "No",
    "Decline",
    "Maybe later",
    "Skip",
    "Skip for now",
    "Close",
    "Cancel",
    "Dismiss",
    "Continue as guest",
    "Continue without an account",
    "Sign in later",
    "Not now",
    "Remind me later",
    "Subscribe",
    "Save 20%",
    "Get the discount",
    "Yes, save my spot",
    // Health / safety adjacent that should NOT trigger
    "I'd rather be alone",
    "I'm fine being here",
    "Protect my account", // affirmative call to action
    "Stay protected",
    // Loyalty adjacent
    "Upgrade to Premium",
    "Manage my membership",
    "View my Gold benefits",
    "Downgrade plan", // missing required object — keep this as ambiguous-OK
    // Gamification adjacent
    "Reset settings",
    "Reset progress", // bare "reset" without "yes,"/"lose" qualifier
    "View my streak",
    "Continue my progress",
    "Start a new game",
    // Imperative adjacent
    "Charge me later",
    "Charge me",
    "Make me a member",
    "Stop the timer",
    // Confirm-dialog adjacent that should NOT trigger
    "Yes",
    "Yes, I'm sure",
    "Yes, continue",
    "Yes, confirm",
    "Confirm",
    "Confirm order",
    "Place order",
    "Yes, place my order",
    // Sarcastic adjacent
    "Sure",
    "Sure, sounds good",
    "Whatever works",
    "Fine",
    "OK",
  ])("leaves plain refusal / unrelated text alone: %s", (text) => {
    expect(isConfirmshameLabel(text)).toBe(false);
  });

  it("ignores empty / whitespace text", () => {
    expect(isConfirmshameLabel("")).toBe(false);
    expect(isConfirmshameLabel(" ".repeat(3))).toBe(false);
  });

  it("ignores text longer than the button-label cap", () => {
    const long = `${"x ".repeat(200)} I hate saving money`;
    expect(isConfirmshameLabel(long)).toBe(false);
  });
});

describe("confirmshameSanitizeRule.apply", () => {
  it("rewrites a confirmshame <button> in place", () => {
    document.body.innerHTML = `<button id="b">No, I'd rather pay full price</button>`;
    confirmshameSanitizeRule.apply(document.body);

    const button = document.querySelector<HTMLButtonElement>("#b");
    expect(button).not.toBeNull();
    expect(button?.textContent).toBe(NEUTRAL_LABEL);
  });

  it("rewrites a [role='button'] anchor in place", () => {
    document.body.innerHTML = `<a id="a" role="button">I don't want to save money</a>`;
    confirmshameSanitizeRule.apply(document.body);

    const anchor = document.querySelector<HTMLAnchorElement>("#a");
    expect(anchor).not.toBeNull();
    expect(anchor?.textContent).toBe(NEUTRAL_LABEL);
  });

  it("rewrites an <input type='button'> via the value attribute", () => {
    document.body.innerHTML = `<input id="i" type="button" value="I hate saving money">`;
    confirmshameSanitizeRule.apply(document.body);

    const input = document.querySelector<HTMLInputElement>("#i");
    expect(input).not.toBeNull();
    expect(input?.value).toBe(NEUTRAL_LABEL);
  });

  it("rewrites confirmshame aria-label and title when present", () => {
    document.body.innerHTML = `
      <button id="b" aria-label="I don't want to save money" title="I hate discounts">
        No, I'd rather pay full price
      </button>
    `;
    confirmshameSanitizeRule.apply(document.body);

    const button = document.querySelector<HTMLButtonElement>("#b");
    expect(button?.getAttribute("aria-label")).toBe(NEUTRAL_LABEL);
    expect(button?.getAttribute("title")).toBe(NEUTRAL_LABEL);
  });

  it("leaves benign decline buttons untouched", () => {
    document.body.innerHTML = `
      <button id="a">No thanks</button>
      <button id="b">Decline</button>
      <button id="c">Maybe later</button>
      <button id="d">Continue as guest</button>
    `;
    confirmshameSanitizeRule.apply(document.body);

    expect(document.querySelector("#a")?.textContent).toBe("No thanks");
    expect(document.querySelector("#b")?.textContent).toBe("Decline");
    expect(document.querySelector("#c")?.textContent).toBe("Maybe later");
    expect(document.querySelector("#d")?.textContent).toBe("Continue as guest");
  });

  it("leaves non-button elements untouched even if their text matches", () => {
    document.body.innerHTML = `<p id="p">I'd rather pay full price for this article.</p>`;
    confirmshameSanitizeRule.apply(document.body);

    expect(document.querySelector("#p")?.textContent).toBe(
      "I'd rather pay full price for this article.",
    );
  });

  it("preserves the button element identity (event handlers stick)", () => {
    document.body.innerHTML = `<button id="b">I hate saving money</button>`;
    const before = document.querySelector<HTMLButtonElement>("#b");
    let clicks = 0;
    before?.addEventListener("click", () => {
      clicks++;
    });

    confirmshameSanitizeRule.apply(document.body);

    const after = document.querySelector<HTMLButtonElement>("#b");
    expect(after).toBe(before);
    after?.click();
    expect(clicks).toBe(1);
  });

  it("does not re-rewrite an already-neutralized button on a second apply", () => {
    document.body.innerHTML = `<button id="b">I'd rather pay full price</button>`;
    confirmshameSanitizeRule.apply(document.body);
    confirmshameSanitizeRule.apply(document.body);

    const button = document.querySelector<HTMLButtonElement>("#b");
    expect(button?.textContent).toBe(NEUTRAL_LABEL);
    expect(button?.dataset.absConfirmshameOrigText).toBe(
      "I'd rather pay full price",
    );
  });
});

describe("confirmshameSanitizeRule lazy-loaded buttons", () => {
  it("rewrites a confirmshame button inserted after apply()", async () => {
    confirmshameSanitizeRule.apply(document.body);

    const wrapper = document.createElement("div");
    wrapper.innerHTML = `<button id="late">I don't want to save money</button>`;
    document.body.append(wrapper);

    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    expect(document.querySelector("#late")?.textContent).toBe(NEUTRAL_LABEL);
  });

  it("rewrites a button that is itself the inserted root", async () => {
    confirmshameSanitizeRule.apply(document.body);

    const button = document.createElement("button");
    button.id = "root";
    button.textContent = "I hate saving money";
    document.body.append(button);

    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    expect(document.querySelector("#root")?.textContent).toBe(NEUTRAL_LABEL);
  });

  it("teardown restores original text, value, aria-label, and title", () => {
    // Build the button without surrounding whitespace so the textContent
    // round-trip is byte-exact — confirmshame buttons in the wild are
    // usually plain text, and this rule preserves whatever was there.
    const button = document.createElement("button");
    button.id = "b";
    button.setAttribute("aria-label", "I hate saving money");
    button.setAttribute("title", "I hate saving money");
    button.textContent = "No, I'd rather pay full price";
    const input = document.createElement("input");
    input.id = "i";
    input.type = "button";
    input.value = "I don't want to save money";
    document.body.append(button, input);

    confirmshameSanitizeRule.apply(document.body);

    expect(button.textContent).toBe(NEUTRAL_LABEL);
    expect(input.value).toBe(NEUTRAL_LABEL);

    confirmshameSanitizeRule.teardown();

    expect(button.textContent).toBe("No, I'd rather pay full price");
    expect(button.getAttribute("aria-label")).toBe("I hate saving money");
    expect(button.getAttribute("title")).toBe("I hate saving money");
    expect(Object.hasOwn(button.dataset, "absConfirmshameOrigText")).toBe(
      false,
    );
    expect(input.value).toBe("I don't want to save money");
    expect(Object.hasOwn(input.dataset, "absConfirmshameOrigValue")).toBe(
      false,
    );
  });

  it("teardown stops the observer so later additions are ignored", async () => {
    confirmshameSanitizeRule.apply(document.body);
    confirmshameSanitizeRule.teardown();

    const wrapper = document.createElement("div");
    wrapper.innerHTML = `<button id="late">I hate saving money</button>`;
    document.body.append(wrapper);

    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    expect(document.querySelector("#late")?.textContent).toBe(
      "I hate saving money",
    );
  });
});

describe("confirmshameSanitizeRule known limitations", () => {
  it("does NOT re-neutralize when an existing button's text node is mutated in place", async () => {
    // Encodes the limitation documented in the rule's file header: the
    // shared subtree watcher only observes childList mutations, and
    // `alreadyRewritten()` short-circuits on the stash data-attr — so a
    // framework that mutates the existing text node's `nodeValue` (e.g.
    // React re-rendering `<button>{label}</button>` when `label` flips
    // back to the confirmshame copy) restores the original text and we
    // do not re-neutralize. If this assumption ever breaks on a real
    // site, see the TODO at the top of confirmshame-sanitize.ts.
    document.body.innerHTML = `<button id="b">I'd rather pay full price</button>`;
    confirmshameSanitizeRule.apply(document.body);

    const button = document.querySelector<HTMLButtonElement>("#b");
    expect(button?.textContent).toBe(NEUTRAL_LABEL);

    const textNode = button?.firstChild;
    expect(textNode?.nodeType).toBe(Node.TEXT_NODE);
    if (textNode) {
      textNode.nodeValue = "I'd rather pay full price";
    }

    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    expect(button?.textContent).toBe("I'd rather pay full price");
  });
});
