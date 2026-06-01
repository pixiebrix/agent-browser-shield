import { PLACEHOLDER_CLASS } from "../../lib/placeholder";
import { hiddenTextStripRule } from "../hidden-text-strip";
import { FIXTURES } from "./injection-fixtures";

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  hiddenTextStripRule.teardown();
});

describe("hiddenTextStripRule", () => {
  it("removes text with visibility:hidden", () => {
    document.body.innerHTML = `
      <p id="visible">visible content</p>
      <p id="hidden" style="visibility: hidden">${FIXTURES.HIDDEN_IGNORE_PRIOR}</p>
    `;
    hiddenTextStripRule.apply(document.body);

    expect(document.querySelector("#hidden")).toBeNull();
    expect(document.querySelector("#visible")).not.toBeNull();
    // Hidden-text removal does not insert a placeholder — the element is
    // gone from the DOM so DOM-scraping agents can't read it.
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });

  it("removes text with opacity:0", () => {
    document.body.innerHTML = `
      <span id="x" style="opacity: 0">invisible payload</span>
    `;
    hiddenTextStripRule.apply(document.body);

    expect(document.querySelector("#x")).toBeNull();
  });

  it("removes text positioned off-screen", () => {
    document.body.innerHTML = `
      <div id="x" style="position: absolute; left: -10000px">hidden text</div>
    `;
    hiddenTextStripRule.apply(document.body);

    expect(document.querySelector("#x")).toBeNull();
  });

  it("removes text clipped to zero area via clip-path", () => {
    document.body.innerHTML = `
      <div id="x" style="clip-path: inset(100%)">clipped text</div>
    `;
    hiddenTextStripRule.apply(document.body);

    expect(document.querySelector("#x")).toBeNull();
  });

  it("removes text with font-size:0", () => {
    document.body.innerHTML = `
      <span id="x" style="font-size: 0">zero font</span>
    `;
    hiddenTextStripRule.apply(document.body);

    expect(document.querySelector("#x")).toBeNull();
  });

  // Amazon's #nav-belt / #nav-search and many legacy layouts set `font-size:
  // 0` on a wrapper to collapse whitespace between inline-block children, then
  // restore a real font-size on the children themselves. The wrapper has no
  // direct text of its own — stripping it would wipe out the entire top nav.
  it("preserves a font-size:0 wrapper whose children restore a real font-size", () => {
    document.body.innerHTML = `
      <div id="wrapper" style="font-size: 0">
        <span id="child" style="font-size: 14px">visible nav link</span>
      </div>
    `;
    hiddenTextStripRule.apply(document.body);

    expect(document.querySelector("#wrapper")).not.toBeNull();
    expect(document.querySelector("#child")).not.toBeNull();
  });

  it("preserves .sr-only text", () => {
    document.body.innerHTML = `
      <span id="x" class="sr-only" style="position: absolute; left: -10000px">screen reader hint</span>
    `;
    hiddenTextStripRule.apply(document.body);

    expect(document.querySelector("#x")).not.toBeNull();
  });

  it("preserves .visually-hidden text", () => {
    document.body.innerHTML = `
      <span id="x" class="visually-hidden" style="visibility: hidden">a11y label</span>
    `;
    hiddenTextStripRule.apply(document.body);

    expect(document.querySelector("#x")).not.toBeNull();
  });

  // MUI's `visuallyHidden` utility (and Tailwind's `sr-only` when compiled
  // through some build pipelines) emits an auto-generated class — e.g.
  // `mui-ty8jgw` — that the class-name allowlist can't match. Recognize the
  // W3C structural pattern by computed style so the a11y tree stays intact.
  it("preserves the structural W3C SR-only pattern even without a known class", () => {
    document.body.innerHTML = `
      <div id="mui-style" class="auto-generated-class" style="
        position: absolute;
        width: 1px;
        height: 1px;
        clip: rect(0px, 0px, 0px, 0px);
        overflow: hidden;
        white-space: nowrap;
        margin: -1px;
        padding: 0;
        border: 0;
      ">Costco typeahead description</div>
    `;
    hiddenTextStripRule.apply(document.body);

    expect(document.querySelector("#mui-style")).not.toBeNull();
  });

  it("preserves the structural SR-only pattern when expressed via clip-path", () => {
    document.body.innerHTML = `
      <span id="x" class="auto" style="
        position: absolute;
        width: 1px;
        height: 1px;
        clip-path: inset(100%);
        overflow: hidden;
      ">a11y label</span>
    `;
    hiddenTextStripRule.apply(document.body);

    expect(document.querySelector("#x")).not.toBeNull();
  });

  // Amazon's `a-offscreen`, eBay's accessible price labels, and many older
  // ARIA-described affordances use the WebAIM off-left idiom (no `clip`).
  // Stripping it breaks the a11y tree — e.g., search-result prices stop
  // showing up for agents that read accessible names.
  it("preserves the WebAIM off-left SR-only idiom (1×1 + overflow:hidden, no clip)", () => {
    document.body.innerHTML = `
      <span id="x" style="
        position: absolute;
        left: -10000px;
        width: 1px;
        height: 1px;
        overflow: hidden;
      ">$29.99</span>
    `;
    hiddenTextStripRule.apply(document.body);

    expect(document.querySelector("#x")).not.toBeNull();
  });

  // Amazon's current `a-offscreen` ships a Bootstrap-5 style envelope:
  // 1×1 + overflow:hidden + clip:rect(1px,1px,1px,1px) + clip-path:inset(50%)
  // + margin:-1px. There is no off-left positioning and the clip is not
  // zero-area. The class-name allowlist (`a-offscreen`) preserves it, and
  // the 1×1 envelope catches the unclassed equivalents — together they
  // keep every Amazon SERP price in the a11y tree.
  it("preserves Amazon's modern a-offscreen envelope (1×1 + overflow:hidden + clip:rect(1px,...))", () => {
    document.body.innerHTML = `
      <span id="x" class="a-offscreen" style="
        clip: rect(1px, 1px, 1px, 1px);
        clip-path: inset(50%);
        position: absolute;
        width: 1px;
        height: 1px;
        margin: -1px;
        padding: 0;
        border: 0;
        overflow: hidden;
        white-space: nowrap;
      ">$29.99</span>
    `;
    hiddenTextStripRule.apply(document.body);

    expect(document.querySelector("#x")).not.toBeNull();
  });

  // Bootstrap-5's `.visually-hidden` and many hand-rolled SR-only utilities
  // omit `left`/`top` entirely and rely on a non-zero clip + clip-path to
  // collapse the visible region. Without the explicit class hint, the only
  // signal we have is the 1×1 + overflow:hidden + out-of-flow envelope.
  it("preserves an unclassed 1×1 + overflow:hidden + absolute envelope (no clip, no off-left)", () => {
    document.body.innerHTML = `
      <span id="x" style="
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
      ">accessible label</span>
    `;
    hiddenTextStripRule.apply(document.body);

    expect(document.querySelector("#x")).not.toBeNull();
  });

  // Amazon's `<nav id="shortcut-menu">` lives at `position: fixed; left:
  // -10000px` and slides in when the user hits a keyboard shortcut. It's
  // prose (1,100+ chars of help text), so the 1×1 SR-only envelope doesn't
  // apply. The semantic landmark tag is the signal: agents and a11y tools
  // treat NAV as navigation regardless of where it's positioned.
  it("preserves an off-screen NAV landmark (keyboard-shortcut help pattern)", () => {
    document.body.innerHTML = `
      <nav id="shortcuts" style="position: fixed; left: -10000px">
        Skip to main content. Keyboard shortcuts: opt+/, shift+opt+C…
      </nav>
    `;
    hiddenTextStripRule.apply(document.body);

    expect(document.querySelector("#shortcuts")).not.toBeNull();
  });

  it("preserves an off-screen element with role=navigation", () => {
    document.body.innerHTML = `
      <div id="shortcuts" role="navigation" style="position: absolute; left: -10000px">
        Keyboard shortcut help menu
      </div>
    `;
    hiddenTextStripRule.apply(document.body);

    expect(document.querySelector("#shortcuts")).not.toBeNull();
  });

  // Landmark preservation is per-element, not per-subtree — an injection
  // shaped descendant inside a NAV is still strippable.
  it("still strips an injection-shaped descendant inside a landmark", () => {
    document.body.innerHTML = `
      <nav id="nav">
        <a href="/home">Home</a>
        <div id="payload" style="position: absolute; left: -10000px; width: 600px; height: 200px">
          ${FIXTURES.HIDDEN_LARGE_OFFSCREEN}
        </div>
      </nav>
    `;
    hiddenTextStripRule.apply(document.body);

    expect(document.querySelector("#nav")).not.toBeNull();
    expect(document.querySelector("#payload")).toBeNull();
  });

  // Amazon's #navbar wrapper has `color: rgb(15,17,17)` against the dark nav
  // background — a color-match by perceptual distance — but the wrapper has
  // no direct text of its own. The visible nav text lives in `<a>`
  // descendants with their own white color that overrides inheritance.
  // Stripping the wrapper would wipe out the top nav.
  it("preserves a color-matched wrapper whose text comes from descendants", () => {
    document.body.innerHTML = `
      <div id="nav" style="color: rgb(15, 17, 17); background-color: rgb(19, 25, 33)">
        <a href="/home" style="color: rgb(255, 255, 255)">Home</a>
        <a href="/account" style="color: rgb(255, 255, 255)">Account</a>
      </div>
    `;
    hiddenTextStripRule.apply(document.body);

    expect(document.querySelector("#nav")).not.toBeNull();
    expect(document.querySelector("a[href='/home']")).not.toBeNull();
  });

  // `Node.textContent` includes inline script source, which historically led
  // us to scan wrappers whose only "text" was a JSON blob or telemetry
  // bootstrap inside <script>. The wrapper should look text-less to the rule.
  it("ignores text inside <script> when deciding whether a wrapper has content", () => {
    document.body.innerHTML = `
      <div id="nav" style="color: rgb(15, 17, 17); background-color: rgb(19, 25, 33)">
        <script>window.navmet.push({key:'Logo',end:+new Date()});</script>
      </div>
    `;
    hiddenTextStripRule.apply(document.body);

    expect(document.querySelector("#nav")).not.toBeNull();
  });

  // An offscreen element that's large enough to carry prose is not an
  // SR-only label — it's the injection shape we exist to strip.
  it("still removes large off-left blocks (no 1×1 envelope = not SR-only)", () => {
    document.body.innerHTML = `
      <div id="x" style="
        position: absolute;
        left: -10000px;
        width: 600px;
        height: 200px;
        overflow: hidden;
      ">${FIXTURES.HIDDEN_LARGE_OFFSCREEN}</div>
    `;
    hiddenTextStripRule.apply(document.body);

    expect(document.querySelector("#x")).toBeNull();
  });

  it("removes text whose foreground color matches the page background", () => {
    document.body.setAttribute("style", "background-color: rgb(255, 255, 255)");
    document.body.innerHTML = `
      <p id="x" style="color: rgb(255, 255, 255)">${FIXTURES.HIDDEN_WHITE_ON_WHITE}</p>
    `;
    hiddenTextStripRule.apply(document.body);

    expect(document.querySelector("#x")).toBeNull();
  });

  // Effective background comes from an ancestor, not the element itself.
  // Common in injections where the attacker sets color on a span but the
  // background lives on a wrapper div.
  it("removes text whose color matches an ancestor's background", () => {
    document.body.innerHTML = `
      <section style="background-color: rgb(20, 20, 20)">
        <span id="x" style="color: rgb(22, 22, 22)">${FIXTURES.HIDDEN_SMUGGLED}</span>
      </section>
    `;
    hiddenTextStripRule.apply(document.body);

    expect(document.querySelector("#x")).toBeNull();
  });

  it("preserves text with normal contrast against its background", () => {
    document.body.setAttribute("style", "background-color: rgb(255, 255, 255)");
    document.body.innerHTML = `
      <p id="x" style="color: rgb(0, 0, 0)">normal readable paragraph</p>
    `;
    hiddenTextStripRule.apply(document.body);

    expect(document.querySelector("#x")).not.toBeNull();
  });

  it("preserves text inside aria-hidden=true ancestors", () => {
    document.body.innerHTML = `
      <div aria-hidden="true">
        <span id="x" style="visibility: hidden">decorative</span>
      </div>
    `;
    hiddenTextStripRule.apply(document.body);

    expect(document.querySelector("#x")).not.toBeNull();
  });

  it("leaves display:none text alone (collapsed menu / tab panel pattern)", () => {
    document.body.innerHTML = `
      <div id="panel" style="display: none">tab panel content</div>
    `;
    hiddenTextStripRule.apply(document.body);

    expect(document.querySelector("#panel")).not.toBeNull();
  });

  it("leaves visible text alone", () => {
    document.body.innerHTML = `<p id="x">normal visible paragraph</p>`;
    hiddenTextStripRule.apply(document.body);

    expect(document.querySelector("#x")).not.toBeNull();
  });

  // Other rules drop their own placeholders that may legitimately contain
  // hidden subtrees as the "original" payload. Never reach into them.
  it("does not strip hidden text inside another rule's placeholder", () => {
    document.body.innerHTML = `
      <div id="ph" class="${PLACEHOLDER_CLASS}">
        <span id="inner" style="opacity: 0">hidden</span>
      </div>
    `;
    hiddenTextStripRule.apply(document.body);

    expect(document.querySelector("#ph")).not.toBeNull();
    expect(document.querySelector("#inner")).not.toBeNull();
  });
});
