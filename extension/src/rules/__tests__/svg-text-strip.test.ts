import { svgTextStripRule } from "../svg-text-strip";
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
  svgTextStripRule.teardown();
  jest.useRealTimers();
});

describe("svg-text-strip title", () => {
  it("blanks <svg><title> text when it matches", () => {
    document.body.innerHTML = `
      <svg viewBox="0 0 10 10">
        <title>${FIXTURES.IGNORE_HACKED}</title>
        <circle cx="5" cy="5" r="4"/>
      </svg>
    `;

    svgTextStripRule.apply(document.body);

    const title = document.querySelector("svg title");
    expect(title?.textContent).toBe("");
    expect(title?.isConnected).toBe(true);
  });

  it("preserves clean <svg><title> text", () => {
    document.body.innerHTML = `
      <svg viewBox="0 0 10 10">
        <title>Company logo</title>
      </svg>
    `;

    svgTextStripRule.apply(document.body);

    expect(document.querySelector("svg title")?.textContent).toBe(
      "Company logo",
    );
  });
});

describe("svg-text-strip desc", () => {
  it("blanks <svg><desc> text when it matches", () => {
    document.body.innerHTML = `
      <svg viewBox="0 0 10 10">
        <desc>${FIXTURES.NEW_INSTRUCTIONS}</desc>
      </svg>
    `;

    svgTextStripRule.apply(document.body);

    const desc = document.querySelector("svg desc");
    expect(desc?.textContent).toBe("");
    expect(desc?.isConnected).toBe(true);
  });

  it("preserves clean <svg><desc> text", () => {
    document.body.innerHTML = `
      <svg viewBox="0 0 10 10">
        <desc>Quarterly revenue chart, 2024-2026</desc>
      </svg>
    `;

    svgTextStripRule.apply(document.body);

    expect(document.querySelector("svg desc")?.textContent).toBe(
      "Quarterly revenue chart, 2024-2026",
    );
  });
});

describe("svg-text-strip text element", () => {
  it("blanks <svg><text> content when it matches", () => {
    document.body.innerHTML = `
      <svg viewBox="0 0 200 50">
        <text x="10" y="30">${FIXTURES.DAN}</text>
      </svg>
    `;

    svgTextStripRule.apply(document.body);

    const text = document.querySelector("svg text");
    expect(text?.textContent).toBe("");
    expect(text?.isConnected).toBe(true);
  });

  it("preserves clean <svg><text> content", () => {
    document.body.innerHTML = `
      <svg viewBox="0 0 200 50">
        <text x="10" y="30">Revenue: $42M</text>
      </svg>
    `;

    svgTextStripRule.apply(document.body);

    expect(document.querySelector("svg text")?.textContent).toBe(
      "Revenue: $42M",
    );
  });

  it("clears a poisoned <text> but keeps clean siblings", () => {
    document.body.innerHTML = `
      <svg viewBox="0 0 200 100">
        <text x="0" y="20" id="clean">North America</text>
        <text x="0" y="50" id="poisoned">${FIXTURES.OVERRIDE_GUARDRAILS}</text>
        <text x="0" y="80" id="clean2">Europe</text>
      </svg>
    `;

    svgTextStripRule.apply(document.body);

    expect(document.querySelector("#clean")?.textContent).toBe("North America");
    expect(document.querySelector("#poisoned")?.textContent).toBe("");
    expect(document.querySelector("#clean2")?.textContent).toBe("Europe");
  });
});

describe("svg-text-strip scope", () => {
  it("does not touch HTML <title> in <head>", () => {
    const title = document.createElement("title");
    title.textContent = FIXTURES.DISREGARD;
    document.head.append(title);

    svgTextStripRule.apply(document.body);

    expect(title.textContent).toBe(FIXTURES.DISREGARD);
    title.remove();
  });

  it("ignores text-shaped elements outside SVG", () => {
    document.body.innerHTML = `
      <article>
        <p>Some text mentioning <code>ignore previous</code> casually.</p>
      </article>
    `;

    svgTextStripRule.apply(document.body);

    expect(document.querySelector("article")).not.toBeNull();
    expect(document.querySelector("p")?.textContent).toContain(
      "ignore previous",
    );
  });
});

describe("svg-text-strip lazy subtrees", () => {
  it("scrubs an SVG inserted after apply", async () => {
    svgTextStripRule.apply(document.body);

    const section = document.createElement("section");
    section.innerHTML = `
      <svg viewBox="0 0 10 10">
        <title>${FIXTURES.DEV_MODE}</title>
      </svg>
    `;
    document.body.append(section);

    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    expect(section.querySelector("svg title")?.textContent).toBe("");
  });

  it("teardown stops the watcher", async () => {
    svgTextStripRule.apply(document.body);
    svgTextStripRule.teardown();

    const section = document.createElement("section");
    section.innerHTML = `
      <svg viewBox="0 0 10 10">
        <title>${FIXTURES.IGNORE_HACKED}</title>
      </svg>
    `;
    document.body.append(section);

    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    expect(section.querySelector("svg title")?.textContent).toBe(
      FIXTURES.IGNORE_HACKED,
    );
  });
});

describe("svg-text-strip idempotency", () => {
  it("is idempotent on a second apply", () => {
    document.body.innerHTML = `
      <svg viewBox="0 0 10 10">
        <title>${FIXTURES.IGNORE_HACKED}</title>
        <desc>${FIXTURES.DAN}</desc>
        <text x="0" y="5">${FIXTURES.NEW_INSTRUCTIONS}</text>
      </svg>
    `;

    svgTextStripRule.apply(document.body);
    svgTextStripRule.apply(document.body);

    expect(document.querySelector("svg title")?.textContent).toBe("");
    expect(document.querySelector("svg desc")?.textContent).toBe("");
    expect(document.querySelector("svg text")?.textContent).toBe("");
  });
});
