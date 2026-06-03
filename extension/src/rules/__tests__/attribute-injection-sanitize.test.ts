import { attributeInjectionSanitizeRule } from "../attribute-injection-sanitize";
import { FIXTURES } from "./injection-fixtures";

const MUTATION_THROTTLE_MS = 250;

async function flushMutations(): Promise<void> {
  await Promise.resolve();
}

beforeEach(() => {
  document.body.innerHTML = "";
  jest.useFakeTimers();
});

afterEach(() => {
  attributeInjectionSanitizeRule.teardown();
  jest.useRealTimers();
});

describe("attribute-injection-sanitize candidate attributes", () => {
  it.each([
    ["aria-label", "button"],
    ["aria-description", "div"],
    ["alt", "img"],
    ["title", "span"],
    ["placeholder", "input"],
    ["data-tooltip", "div"],
  ])("removes %s when its value matches an injection pattern", (attribute, tag) => {
    document.body.innerHTML = `<${tag} ${attribute}="${FIXTURES.IGNORE_HACKED}"></${tag}>`;

    attributeInjectionSanitizeRule.apply(document.body);

    const element = document.body.querySelector(tag);
    expect(element?.hasAttribute(attribute)).toBe(false);
  });

  it.each([
    ["aria-label", "button", "Add to cart"],
    ["alt", "img", "Product photo"],
    ["title", "span", "Posted 3 days ago"],
    ["placeholder", "input", "Search products"],
  ])("preserves clean %s values", (attribute, tag, value) => {
    document.body.innerHTML = `<${tag} ${attribute}="${value}"></${tag}>`;

    attributeInjectionSanitizeRule.apply(document.body);

    expect(document.body.querySelector(tag)?.getAttribute(attribute)).toBe(
      value,
    );
  });

  it("strips a poisoned aria-label without touching sibling clean attributes", () => {
    document.body.innerHTML = `
      <button
        aria-label="${FIXTURES.OVERRIDE_GUARDRAILS}"
        title="Real button title"
        data-id="btn-1"
      >Click</button>
    `;

    attributeInjectionSanitizeRule.apply(document.body);

    const button = document.body.querySelector("button");
    expect(button?.hasAttribute("aria-label")).toBe(false);
    expect(button?.getAttribute("title")).toBe("Real button title");
    expect(button?.dataset.id).toBe("btn-1");
    expect(button?.textContent).toContain("Click");
  });

  it("does not touch attributes outside the allowlist", () => {
    document.body.innerHTML = `<div data-note="${FIXTURES.DAN}" data-id="x"></div>`;

    attributeInjectionSanitizeRule.apply(document.body);

    const div = document.body.querySelector("div");
    expect(div?.dataset.note).toBe(FIXTURES.DAN);
    expect(div?.dataset.id).toBe("x");
  });
});

describe("attribute-injection-sanitize disabled input value", () => {
  it("removes a poisoned value on a disabled input", () => {
    document.body.innerHTML = `<input disabled value="${FIXTURES.NEW_INSTRUCTIONS}">`;

    attributeInjectionSanitizeRule.apply(document.body);

    const input = document.body.querySelector("input");
    expect(input?.hasAttribute("value")).toBe(false);
  });

  it("leaves a clean disabled input value alone", () => {
    document.body.innerHTML = `<input disabled value="$129.99">`;

    attributeInjectionSanitizeRule.apply(document.body);

    expect(document.body.querySelector("input")?.getAttribute("value")).toBe(
      "$129.99",
    );
  });

  it("leaves an enabled input value alone even if poisoned", () => {
    // Editable inputs are user-controlled and any prefill is visible — leave
    // them to the human / the user-facing UI to resolve.
    document.body.innerHTML = `<input value="${FIXTURES.IGNORE_ALL}">`;

    attributeInjectionSanitizeRule.apply(document.body);

    expect(document.body.querySelector("input")?.getAttribute("value")).toBe(
      FIXTURES.IGNORE_ALL,
    );
  });
});

describe("attribute-injection-sanitize lazy subtrees", () => {
  it("scrubs an attribute on a subtree added after apply", async () => {
    attributeInjectionSanitizeRule.apply(document.body);

    const route = document.createElement("section");
    route.innerHTML = `<button aria-label="${FIXTURES.IGNORE_HACKED}">x</button>`;
    document.body.append(route);

    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    expect(route.querySelector("button")?.hasAttribute("aria-label")).toBe(
      false,
    );
  });

  it("scrubs an attribute on an element that is itself the added subtree root", async () => {
    attributeInjectionSanitizeRule.apply(document.body);

    const root = document.createElement("button");
    root.setAttribute("aria-label", FIXTURES.DISREGARD);
    document.body.append(root);

    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    expect(root.hasAttribute("aria-label")).toBe(false);
  });

  it("teardown stops the observer", async () => {
    attributeInjectionSanitizeRule.apply(document.body);
    attributeInjectionSanitizeRule.teardown();

    const route = document.createElement("button");
    route.setAttribute("aria-label", FIXTURES.IGNORE_ALL);
    document.body.append(route);

    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    expect(route.getAttribute("aria-label")).toBe(FIXTURES.IGNORE_ALL);
  });
});

describe("attribute-injection-sanitize idempotency", () => {
  it("is idempotent on a second apply", () => {
    document.body.innerHTML = `<button aria-label="${FIXTURES.IGNORE_HACKED}" title="${FIXTURES.DAN}">x</button>`;

    attributeInjectionSanitizeRule.apply(document.body);
    attributeInjectionSanitizeRule.apply(document.body);

    const button = document.body.querySelector("button");
    expect(button?.hasAttribute("aria-label")).toBe(false);
    expect(button?.hasAttribute("title")).toBe(false);
  });
});
