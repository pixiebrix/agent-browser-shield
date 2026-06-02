import { unicodeInvisiblesStripRule } from "../unicode-invisibles-strip";

// Code-point references are written as \u{...} escapes inside string
// literals so the test source itself stays free of the invisible characters
// under test — otherwise editors / diff tools would mangle this file.
const TAG_A = "\u{E0061}"; // tag-block 'a'
const TAG_B = "\u{E0062}"; // tag-block 'b'
const TAG_NL = "\u{E000A}"; // tag-block newline
const ZWSP = "\u{200B}";
const ZWNBSP = "\u{FEFF}"; // BOM
const WORD_JOINER = "\u{2060}";
const RLO = "\u{202E}"; // bidi override
const LRI = "\u{2066}"; // bidi isolate
const ZWJ = "\u{200D}"; // preserved
const ZWNJ = "\u{200C}"; // preserved
const LRM = "\u{200E}"; // preserved

const MUTATION_THROTTLE_MS = 250;

async function flushMutations(): Promise<void> {
  await Promise.resolve();
}

beforeEach(() => {
  document.body.innerHTML = "";
  jest.useFakeTimers();
});

afterEach(() => {
  unicodeInvisiblesStripRule.teardown();
  jest.useRealTimers();
});

describe("unicode-invisibles-strip text nodes", () => {
  it("strips Unicode tag-block characters", () => {
    document.body.innerHTML = `<p>Visible${TAG_A}${TAG_B}${TAG_NL}text</p>`;
    unicodeInvisiblesStripRule.apply(document.body);

    expect(document.body.textContent).toBe("Visibletext");
  });

  it("strips bidi override and isolate characters", () => {
    document.body.innerHTML = `<p>safe${RLO}danger${LRI}word</p>`;
    unicodeInvisiblesStripRule.apply(document.body);

    expect(document.body.textContent).toBe("safedangerword");
  });

  it("strips zero-width space, word joiner, and BOM", () => {
    document.body.innerHTML = `<p>a${ZWSP}b${WORD_JOINER}c${ZWNBSP}d</p>`;
    unicodeInvisiblesStripRule.apply(document.body);

    expect(document.body.textContent).toBe("abcd");
  });

  it("preserves ZWJ, ZWNJ, and directional marks", () => {
    const preserved = `man${ZWJ}woman${ZWNJ}name${LRM}end`;
    document.body.innerHTML = `<p>${preserved}</p>`;
    unicodeInvisiblesStripRule.apply(document.body);

    expect(document.body.textContent).toBe(preserved);
  });

  it("leaves plain text untouched", () => {
    document.body.innerHTML = `<p>hello world</p>`;
    unicodeInvisiblesStripRule.apply(document.body);

    expect(document.body.textContent).toBe("hello world");
  });

  it("is idempotent on a second apply", () => {
    document.body.innerHTML = `<p>x${TAG_A}y</p>`;
    unicodeInvisiblesStripRule.apply(document.body);
    unicodeInvisiblesStripRule.apply(document.body);

    expect(document.body.textContent).toBe("xy");
  });

  // Script/style/noscript text is parsed as raw content; agents typically
  // don't read it as prose. `walkTextNodes` already skips these, but pin the
  // behavior so a future helper change can't silently regress it.
  it.each([
    "script",
    "style",
    "noscript",
  ])("does not modify text inside <%s>", (tag) => {
    const payload = `${TAG_A}${ZWSP}`;
    document.body.innerHTML = `<${tag}>const s = "x${payload}y";</${tag}>`;
    const before = document.querySelector(tag)?.textContent ?? "";
    unicodeInvisiblesStripRule.apply(document.body);

    expect(document.querySelector(tag)?.textContent).toBe(before);
  });
});

describe("unicode-invisibles-strip attribute values", () => {
  it("strips tag-block characters from aria-label", () => {
    document.body.innerHTML = `<button aria-label="Buy${TAG_A}now">Buy</button>`;
    unicodeInvisiblesStripRule.apply(document.body);

    expect(document.querySelector("button")?.getAttribute("aria-label")).toBe(
      "Buynow",
    );
  });

  it("strips bidi overrides from alt, title, and placeholder", () => {
    document.body.innerHTML = `
      <img alt="cat${RLO}photo">
      <span title="hello${ZWSP}world">x</span>
      <input placeholder="search${LRI}here">
    `;
    unicodeInvisiblesStripRule.apply(document.body);

    expect(document.querySelector("img")?.getAttribute("alt")).toBe("catphoto");
    expect(document.querySelector("span")?.getAttribute("title")).toBe(
      "helloworld",
    );
    expect(document.querySelector("input")?.getAttribute("placeholder")).toBe(
      "searchhere",
    );
  });

  it("preserves attribute values that contain only legitimate code points", () => {
    document.body.innerHTML = `<button aria-label="ok${ZWJ}fine">x</button>`;
    unicodeInvisiblesStripRule.apply(document.body);

    expect(document.querySelector("button")?.getAttribute("aria-label")).toBe(
      `ok${ZWJ}fine`,
    );
  });

  it("strips from arbitrary data-* attributes", () => {
    document.body.innerHTML = `<div data-tooltip="hi${TAG_A}there">x</div>`;
    unicodeInvisiblesStripRule.apply(document.body);

    expect(document.querySelector("div")?.dataset.tooltip).toBe("hithere");
  });
});

describe("unicode-invisibles-strip lazy subtrees", () => {
  it("strips invisibles from a subtree added after apply", async () => {
    unicodeInvisiblesStripRule.apply(document.body);

    const route = document.createElement("section");
    route.innerHTML = `<p>safe${RLO}word</p>`;
    document.body.append(route);

    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    expect(route.textContent).toBe("safeword");
  });

  it("teardown stops the observer", async () => {
    unicodeInvisiblesStripRule.apply(document.body);
    unicodeInvisiblesStripRule.teardown();

    const route = document.createElement("section");
    route.innerHTML = `<p>safe${RLO}word</p>`;
    document.body.append(route);

    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    expect(route.textContent).toBe(`safe${RLO}word`);
  });
});
