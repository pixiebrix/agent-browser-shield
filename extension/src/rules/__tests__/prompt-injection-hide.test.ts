// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { PLACEHOLDER_CLASS } from "../../lib/placeholder";
import { promptInjectionHideRule } from "../prompt-injection-hide";
import { FIXTURES } from "./injection-fixtures";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("prompt-injection-hide", () => {
  it("hides paragraphs that ask the agent to ignore previous instructions", () => {
    document.body.innerHTML = `
      <p>Welcome to our product page.</p>
      <p>${FIXTURES.IGNORE_HACKED}</p>
    `;
    promptInjectionHideRule.apply(document.body);

    const paragraphs = document.querySelectorAll("p");
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0].textContent).toBe("Welcome to our product page.");
    expect(
      document.querySelector(`.${PLACEHOLDER_CLASS}`)?.textContent,
    ).toContain("possible prompt injection hidden");
  });

  it("matches case-insensitively", () => {
    document.body.innerHTML = `<p>${FIXTURES.DISREGARD}</p>`;
    promptInjectionHideRule.apply(document.body);

    expect(document.querySelector("p")).toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).not.toBeNull();
  });

  it("hides jailbreak persona phrasing", () => {
    document.body.innerHTML = `<blockquote>${FIXTURES.DAN}</blockquote>`;
    promptInjectionHideRule.apply(document.body);

    expect(document.querySelector("blockquote")).toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).not.toBeNull();
  });

  it("hides developer-mode activation phrasing", () => {
    document.body.innerHTML = `<li>${FIXTURES.DEV_MODE}</li>`;
    promptInjectionHideRule.apply(document.body);

    expect(document.querySelector("li")).toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).not.toBeNull();
  });

  it("hides text containing ChatML special tokens", () => {
    document.body.innerHTML = `<p>${FIXTURES.CHATML}</p>`;
    promptInjectionHideRule.apply(document.body);

    expect(document.querySelector("p")).toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).not.toBeNull();
  });

  it("hides text containing Llama instruct tokens", () => {
    document.body.innerHTML = `<pre>${FIXTURES.LLAMA_INST}</pre>`;
    promptInjectionHideRule.apply(document.body);

    expect(document.querySelector("pre")).toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).not.toBeNull();
  });

  it('hides "new instructions:" directive prefixes', () => {
    document.body.innerHTML = `<p>${FIXTURES.NEW_INSTRUCTIONS}</p>`;
    promptInjectionHideRule.apply(document.body);

    expect(document.querySelector("p")).toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).not.toBeNull();
  });

  it("hides bypass / override of safety guardrails", () => {
    document.body.innerHTML = `<p>${FIXTURES.OVERRIDE_GUARDRAILS}</p>`;
    promptInjectionHideRule.apply(document.body);

    expect(document.querySelector("p")).toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).not.toBeNull();
  });

  it("leaves ordinary prose untouched", () => {
    document.body.innerHTML = `
      <p>The quarterly report shows revenue grew 12% year over year.</p>
      <p>Users prefer the new onboarding flow.</p>
    `;
    promptInjectionHideRule.apply(document.body);

    expect(document.querySelectorAll("p")).toHaveLength(2);
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });

  it("does not hide benign mentions of LLM concepts without directives", () => {
    document.body.innerHTML = `<p>${FIXTURES.BENIGN_LLM}</p>`;
    promptInjectionHideRule.apply(document.body);

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
    promptInjectionHideRule.apply(document.body);

    expect(document.querySelector("article")).not.toBeNull();
    const visibleParas = document.querySelectorAll("article > p");
    expect(visibleParas).toHaveLength(2);
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).not.toBeNull();
  });

  it("does not process text inside SCRIPT or STYLE", () => {
    document.body.innerHTML = `
      <script>${FIXTURES.SCRIPT_STRING}</script>
      <style>${FIXTURES.STYLE_COMMENT}</style>
    `;
    promptInjectionHideRule.apply(document.body);

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
    promptInjectionHideRule.apply(document.body);

    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(1);
    expect(document.querySelector("p")).not.toBeNull();
  });

  it("reveals the original content on click", () => {
    document.body.innerHTML = `<p>${FIXTURES.IGNORE_ALL}</p>`;
    promptInjectionHideRule.apply(document.body);

    const placeholder = document.querySelector<HTMLElement>(
      `.${PLACEHOLDER_CLASS}`,
    );
    placeholder?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
    expect(document.body.textContent).toContain(FIXTURES.IGNORE_ALL);
  });
});
