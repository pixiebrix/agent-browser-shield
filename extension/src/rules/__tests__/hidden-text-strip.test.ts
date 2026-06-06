import { PLACEHOLDER_CLASS } from "../../lib/placeholder";
import {
  __resetColorProbeForTesting,
  hiddenTextStripRule,
} from "../hidden-text-strip";
import { FIXTURES } from "./injection-fixtures";

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  hiddenTextStripRule.teardown();
});

function expectScrubbed(selector: string): void {
  const element = document.querySelector(selector);
  // The element itself stays attached so framework reconciliation can
  // unmount it cleanly on the next route change.
  expect(element).not.toBeNull();
  expect(element?.textContent).toBe("");
}

describe("hiddenTextStripRule", () => {
  it("scrubs text with visibility:hidden", () => {
    document.body.innerHTML = `
      <p id="visible">visible content</p>
      <p id="hidden" style="visibility: hidden">${FIXTURES.HIDDEN_IGNORE_PRIOR}</p>
    `;
    hiddenTextStripRule.apply(document.body);

    expectScrubbed("#hidden");
    expect(document.querySelector("#visible")).not.toBeNull();
    expect(document.querySelector("#visible")?.textContent).toContain(
      "visible content",
    );
    // Hidden-text scrub does not insert a placeholder — the contents are
    // by construction invisible to sighted users.
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });

  it("scrubs text with opacity:0", () => {
    document.body.innerHTML = `
      <span id="x" style="opacity: 0">invisible payload</span>
    `;
    hiddenTextStripRule.apply(document.body);

    expectScrubbed("#x");
  });

  // Regression for #126: Primer's <dialog> backdrop renders at opacity:0
  // with an opacity transition, then animates to 1 once the dialog opens.
  // The subtree watcher catches the wrapper mid-transition. The opacity:0
  // is transient (the user will see it within ~150ms), not a hidden-text
  // injection signal, so the rule must let transitioning elements through.
  it("does not strip an element fading in via opacity transition", () => {
    document.body.innerHTML = `
      <div id="backdrop" style="opacity: 0; transition: opacity 150ms ease-out">
        <h2>Create new issue</h2>
        <p>Bug report</p>
      </div>
    `;
    hiddenTextStripRule.apply(document.body);

    expect(document.querySelector("#backdrop")).not.toBeNull();
  });

  it("does not strip an element fading in via a transition on `all`", () => {
    document.body.innerHTML = `
      <div id="x" style="opacity: 0; transition: all 200ms">
        modal contents
      </div>
    `;
    hiddenTextStripRule.apply(document.body);

    expect(document.querySelector("#x")).not.toBeNull();
  });

  it("does not strip an element with a running opacity keyframe animation", () => {
    document.body.innerHTML = `
      <div id="x" style="opacity: 0; animation: fadeIn 150ms ease-out">
        modal contents
      </div>
    `;
    hiddenTextStripRule.apply(document.body);

    expect(document.querySelector("#x")).not.toBeNull();
  });

  it("still scrubs opacity:0 when no transition or animation is set", () => {
    // Guards against making the transition check too permissive — a plain
    // opacity:0 with no animation is the classic hidden-injection signal.
    document.body.innerHTML = `
      <div id="x" style="opacity: 0">${FIXTURES.HIDDEN_IGNORE_PRIOR}</div>
    `;
    hiddenTextStripRule.apply(document.body);

    expectScrubbed("#x");
  });

  it("still scrubs opacity:0 when the transition duration is zero", () => {
    // A `transition: opacity 0s` is instantaneous — the text never becomes
    // visible. Without this case, an attacker could declare a zero-duration
    // opacity transition to bypass the strip.
    document.body.innerHTML = `
      <div id="x" style="opacity: 0; transition: opacity 0s">${FIXTURES.HIDDEN_IGNORE_PRIOR}</div>
    `;
    hiddenTextStripRule.apply(document.body);

    expectScrubbed("#x");
  });

  it("still scrubs opacity:0 when the animation duration is zero", () => {
    document.body.innerHTML = `
      <div id="x" style="opacity: 0; animation: fadeIn 0s">${FIXTURES.HIDDEN_IGNORE_PRIOR}</div>
    `;
    hiddenTextStripRule.apply(document.body);

    expectScrubbed("#x");
  });

  it("still scrubs opacity:0 when the transition targets a non-opacity property", () => {
    document.body.innerHTML = `
      <div id="x" style="opacity: 0; transition: transform 150ms">${FIXTURES.HIDDEN_IGNORE_PRIOR}</div>
    `;
    hiddenTextStripRule.apply(document.body);

    expectScrubbed("#x");
  });

  it("scrubs text positioned off-screen", () => {
    document.body.innerHTML = `
      <div id="x" style="position: absolute; left: -10000px">hidden text</div>
    `;
    hiddenTextStripRule.apply(document.body);

    expectScrubbed("#x");
  });

  it("scrubs text clipped to zero area via clip-path", () => {
    document.body.innerHTML = `
      <div id="x" style="clip-path: inset(100%)">clipped text</div>
    `;
    hiddenTextStripRule.apply(document.body);

    expectScrubbed("#x");
  });

  it("scrubs text with font-size:0", () => {
    document.body.innerHTML = `
      <span id="x" style="font-size: 0">zero font</span>
    `;
    hiddenTextStripRule.apply(document.body);

    expectScrubbed("#x");
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
  it("still scrubs an injection-shaped descendant inside a landmark", () => {
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
    expectScrubbed("#payload");
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
  it("still scrubs large off-left blocks (no 1×1 envelope = not SR-only)", () => {
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

    expectScrubbed("#x");
  });

  it("scrubs text whose foreground color matches the page background", () => {
    document.body.setAttribute("style", "background-color: rgb(255, 255, 255)");
    document.body.innerHTML = `
      <p id="x" style="color: rgb(255, 255, 255)">${FIXTURES.HIDDEN_WHITE_ON_WHITE}</p>
    `;
    hiddenTextStripRule.apply(document.body);

    expectScrubbed("#x");
  });

  // Effective background comes from an ancestor, not the element itself.
  // Common in injections where the attacker sets color on a span but the
  // background lives on a wrapper div.
  it("scrubs text whose color matches an ancestor's background", () => {
    document.body.innerHTML = `
      <section style="background-color: rgb(20, 20, 20)">
        <span id="x" style="color: rgb(22, 22, 22)">${FIXTURES.HIDDEN_SMUGGLED}</span>
      </section>
    `;
    hiddenTextStripRule.apply(document.body);

    expectScrubbed("#x");
  });

  // Tailwind v4 (and any modern stylesheet using CSS Color Level 4)
  // compiles backgrounds to `oklch()` / `lab()` / `color()`, which browsers
  // expose in computed style unnormalized. The walker historically treated
  // those as transparent and kept climbing, so a `bg-orange-500` button
  // with white text inside a white card looked like white-on-white and got
  // stripped. Bail when we hit a background we can't parse rather than
  // falling through to a distant white ancestor.
  it("preserves white text on an oklch background nested in a white card", () => {
    document.body.innerHTML = `
      <aside style="background-color: rgb(255, 255, 255)">
        <a id="buy" href="/checkout"
           style="background-color: oklch(0.705 0.213 47.604); color: rgb(255, 255, 255)">Buy Now</a>
      </aside>
    `;
    hiddenTextStripRule.apply(document.body);

    expect(document.querySelector("#buy")).not.toBeNull();
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

// jsdom's HTMLCanvasElement.getContext returns null without the `canvas`
// package, so the canvas-based color parser never runs in tests by default.
// These cases install a deterministic stub that mimics the spec's
// silent-ignore behavior for unparseable fillStyle assignments, then
// exercise the rule against CSS Color Level 4 syntaxes that the regex
// parser doesn't understand. With the stub uninstalled, the existing
// jsdom path (regex parser only) is what runs.
type RGBA = [number, number, number, number];

function noop(): void {
  // Stub for canvas drawing operations the rule calls but doesn't read.
}

function installMockCanvas(colorMap: Record<string, RGBA>): () => void {
  // Sentinels used by parseColorViaCanvas must be accepted as valid colors
  // so the two-probe round trip can converge for a parseable input.
  const knownColors: Record<string, RGBA> = {
    "#1a2b3c": [26, 43, 60, 255],
    "#fedcba": [254, 220, 186, 255],
    "#000000": [0, 0, 0, 255],
    ...Object.fromEntries(
      Object.entries(colorMap).map(([k, v]) => [k.toLowerCase().trim(), v]),
    ),
  };
  let internal = "#000000";
  const stubContext = {
    clearRect: noop,
    fillRect: noop,
    getImageData: (): ImageData => {
      const rgba = knownColors[internal] ?? [0, 0, 0, 0];
      return {
        data: new Uint8ClampedArray(rgba),
        width: 1,
        height: 1,
        colorSpace: "srgb",
      };
    },
  };
  Object.defineProperty(stubContext, "fillStyle", {
    get: () => internal,
    set: (value: string) => {
      if (typeof value !== "string") {
        return;
      }
      const lower = value.toLowerCase().trim();
      // Spec: an unparseable assignment is silently ignored. Mirror that
      // by only accepting strings present in the color map.
      if (knownColors[lower] !== undefined) {
        internal = lower;
      }
    },
  });

  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function patched(
    kind: string,
  ): unknown {
    if (kind === "2d") {
      return stubContext;
    }
    return null;
  } as typeof HTMLCanvasElement.prototype.getContext;
  __resetColorProbeForTesting();

  return () => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    __resetColorProbeForTesting();
  };
}

describe("hiddenTextStripRule modern CSS color syntaxes", () => {
  let uninstall: (() => void) | undefined;

  afterEach(() => {
    uninstall?.();
    uninstall = undefined;
  });

  // The dominant in-the-wild bypass against the regex-only parser: text
  // painted via `oklch()` (Tailwind v4, Open Props, modern design systems)
  // reaches computed style unnormalized, so the regex returned null and
  // the candidate was preserved. Canvas resolution recovers the RGB.
  it("scrubs near-white oklch text on a white background", () => {
    uninstall = installMockCanvas({
      "oklch(0.99 0 0)": [252, 252, 252, 255],
    });
    document.body.setAttribute("style", "background-color: rgb(255, 255, 255)");
    document.body.innerHTML = `
      <p id="x" style="color: oklch(0.99 0 0)">${FIXTURES.HIDDEN_WHITE_ON_WHITE}</p>
    `;
    hiddenTextStripRule.apply(document.body);

    expectScrubbed("#x");
  });

  // Same threat via lab(): a dark grey color on a dark background that
  // the regex parser misses.
  it("scrubs near-black lab text on a near-black background", () => {
    uninstall = installMockCanvas({
      "lab(20 0 0)": [48, 48, 48, 255],
      "lab(22 0 0)": [52, 52, 52, 255],
    });
    document.body.innerHTML = `
      <section style="background-color: lab(20 0 0)">
        <span id="x" style="color: lab(22 0 0)">${FIXTURES.HIDDEN_SMUGGLED}</span>
      </section>
    `;
    hiddenTextStripRule.apply(document.body);

    expectScrubbed("#x");
  });

  // Color-mix() is the same threat class with even more obfuscation room
  // — the resolved value can be any RGB, but visually it can match a
  // sibling's background.
  it("scrubs color-mix() text matching the ancestor background", () => {
    uninstall = installMockCanvas({
      "color-mix(in oklch, white, transparent)": [255, 255, 255, 255],
    });
    document.body.setAttribute("style", "background-color: rgb(255, 255, 255)");
    document.body.innerHTML = `
      <p id="x" style="color: color-mix(in oklch, white, transparent)">${FIXTURES.HIDDEN_WHITE_ON_WHITE}</p>
    `;
    hiddenTextStripRule.apply(document.body);

    expectScrubbed("#x");
  });

  // Counterpart to the existing rgb-on-rgb regression: an oklch background
  // that the canvas resolves to orange must NOT cause the white text on
  // top to be stripped, because the perceptual distance is large. The
  // existing test of the same shape passed in jsdom by accident (regex
  // bailed); this confirms the fix preserves the right behavior for the
  // right reason.
  it("preserves white text on an oklch orange background", () => {
    uninstall = installMockCanvas({
      "oklch(0.705 0.213 47.604)": [251, 146, 60, 255],
    });
    document.body.innerHTML = `
      <aside style="background-color: rgb(255, 255, 255)">
        <a id="buy" href="/checkout"
           style="background-color: oklch(0.705 0.213 47.604); color: rgb(255, 255, 255)">Buy Now</a>
      </aside>
    `;
    hiddenTextStripRule.apply(document.body);

    expect(document.querySelector("#buy")).not.toBeNull();
  });

  // The two-sentinel probe must reject any value the browser couldn't
  // parse. Wired up by feeding the mock a name that isn't in its color
  // map; the rule should leave the element alone rather than trip on the
  // sentinel's RGB.
  it("preserves the element when the color value is unparseable", () => {
    uninstall = installMockCanvas({}); // no modern syntaxes registered
    document.body.setAttribute("style", "background-color: rgb(255, 255, 255)");
    document.body.innerHTML = `
      <p id="x" style="color: not-a-color(0 0 0)">${FIXTURES.HIDDEN_WHITE_ON_WHITE}</p>
    `;
    hiddenTextStripRule.apply(document.body);

    expect(document.querySelector("#x")).not.toBeNull();
    expect(document.querySelector("#x")?.textContent ?? "").not.toBe("");
  });
});
