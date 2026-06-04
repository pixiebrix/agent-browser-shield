import { PLACEHOLDER_CLASS } from "../../lib/placeholder";
import { promptInjectionRedactRule } from "../prompt-injection-redact";
import { FIXTURES } from "./injection-fixtures";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("prompt-injection-redact", () => {
  it("hides paragraphs that ask the agent to ignore previous instructions", () => {
    document.body.innerHTML = `
      <p>Welcome to our product page.</p>
      <p>${FIXTURES.IGNORE_HACKED}</p>
    `;
    promptInjectionRedactRule.apply(document.body);

    const paragraphs = document.querySelectorAll("p");
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]?.textContent).toBe("Welcome to our product page.");
    expect(
      document.querySelector(`.${PLACEHOLDER_CLASS}`)?.textContent,
    ).toContain("possible prompt injection hidden");
  });

  it("matches case-insensitively", () => {
    document.body.innerHTML = `<p>${FIXTURES.DISREGARD}</p>`;
    promptInjectionRedactRule.apply(document.body);

    expect(document.querySelector("p")).toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).not.toBeNull();
  });

  it("hides jailbreak persona phrasing", () => {
    document.body.innerHTML = `<blockquote>${FIXTURES.DAN}</blockquote>`;
    promptInjectionRedactRule.apply(document.body);

    expect(document.querySelector("blockquote")).toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).not.toBeNull();
  });

  it("hides developer-mode activation phrasing", () => {
    document.body.innerHTML = `<li>${FIXTURES.DEV_MODE}</li>`;
    promptInjectionRedactRule.apply(document.body);

    expect(document.querySelector("li")).toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).not.toBeNull();
  });

  it("hides text containing ChatML special tokens", () => {
    document.body.innerHTML = `<p>${FIXTURES.CHATML}</p>`;
    promptInjectionRedactRule.apply(document.body);

    expect(document.querySelector("p")).toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).not.toBeNull();
  });

  it("hides text containing Llama instruct tokens", () => {
    document.body.innerHTML = `<pre>${FIXTURES.LLAMA_INST}</pre>`;
    promptInjectionRedactRule.apply(document.body);

    expect(document.querySelector("pre")).toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).not.toBeNull();
  });

  it('hides "new instructions:" directive prefixes', () => {
    document.body.innerHTML = `<p>${FIXTURES.NEW_INSTRUCTIONS}</p>`;
    promptInjectionRedactRule.apply(document.body);

    expect(document.querySelector("p")).toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).not.toBeNull();
  });

  it("hides bypass / override of safety guardrails", () => {
    document.body.innerHTML = `<p>${FIXTURES.OVERRIDE_GUARDRAILS}</p>`;
    promptInjectionRedactRule.apply(document.body);

    expect(document.querySelector("p")).toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).not.toBeNull();
  });

  it("leaves ordinary prose untouched", () => {
    document.body.innerHTML = `
      <p>The quarterly report shows revenue grew 12% year over year.</p>
      <p>Users prefer the new onboarding flow.</p>
    `;
    promptInjectionRedactRule.apply(document.body);

    expect(document.querySelectorAll("p")).toHaveLength(2);
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });

  it("does not hide benign mentions of LLM concepts without directives", () => {
    document.body.innerHTML = `<p>${FIXTURES.BENIGN_LLM}</p>`;
    promptInjectionRedactRule.apply(document.body);

    expect(document.querySelector("p")).not.toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });

  it("scopes the placeholder to the nearest paragraph, not the whole article", () => {
    document.body.innerHTML = `
      <article>
        <p>Intro paragraph that stays visible.</p>
        <p>${FIXTURES.PLEASE_IGNORE}</p>
        <p>Conclusion paragraph that stays visible.</p>
      </article>
    `;
    promptInjectionRedactRule.apply(document.body);

    expect(document.querySelector("article")).not.toBeNull();
    const visibleParas = document.querySelectorAll("article > p");
    expect(visibleParas).toHaveLength(2);
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).not.toBeNull();
  });

  it("does not redact the surrounding article when injection text lives inside an SVG", () => {
    // svg-text-strip is the rule that scrubs SVG title/desc/text content.
    // prompt-injection-redact must not fire on those text nodes — the SVG
    // has no paragraph-like ancestor, so it would otherwise escalate the
    // placeholder all the way up to the wrapping <article> and wipe out
    // the whole section (#133).
    document.body.innerHTML = `
      <article>
        <h1>Product title that stays visible.</h1>
        <div>
          <svg>
            <title>${FIXTURES.IGNORE_HACKED}</title>
            <desc>${FIXTURES.OVERRIDE_GUARDRAILS}</desc>
            <text>${FIXTURES.DISREGARD}</text>
          </svg>
        </div>
      </article>
    `;
    promptInjectionRedactRule.apply(document.body);

    expect(document.querySelector("article")).not.toBeNull();
    expect(document.querySelector("h1")?.textContent).toBe(
      "Product title that stays visible.",
    );
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });

  it("does not process text inside SCRIPT or STYLE", () => {
    document.body.innerHTML = `
      <script>${FIXTURES.SCRIPT_STRING}</script>
      <style>${FIXTURES.STYLE_COMMENT}</style>
    `;
    promptInjectionRedactRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
    expect(document.querySelector("script")).not.toBeNull();
    expect(document.querySelector("style")).not.toBeNull();
  });

  it("does not re-process content inside an existing placeholder", () => {
    document.body.innerHTML = `
      <div class="${PLACEHOLDER_CLASS}">
        <p>${FIXTURES.IGNORE_ALL}</p>
      </div>
    `;
    promptInjectionRedactRule.apply(document.body);

    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(1);
    expect(document.querySelector("p")).not.toBeNull();
  });

  it("reveals the original content on click", () => {
    document.body.innerHTML = `<p>${FIXTURES.IGNORE_ALL}</p>`;
    promptInjectionRedactRule.apply(document.body);

    const placeholder = document.querySelector<HTMLElement>(
      `.${PLACEHOLDER_CLASS}`,
    );
    placeholder?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
    expect(document.body.textContent).toContain(FIXTURES.IGNORE_ALL);
  });
});
