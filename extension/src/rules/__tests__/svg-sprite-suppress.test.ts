// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { svgSpriteSuppressRule } from "../svg-sprite-suppress";

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  svgSpriteSuppressRule.teardown?.();
});

describe("svgSpriteSuppressRule", () => {
  it("removes a hidden sprite whose symbols are unreferenced", () => {
    document.body.innerHTML = `
      <main>page content</main>
      <svg id="sprite" style="display: none">
        <symbol id="icon-a"><path d="M0 0h10v10H0z"/></symbol>
        <symbol id="icon-b"><path d="M0 0L10 10"/></symbol>
      </svg>
    `;
    svgSpriteSuppressRule.apply(document.body);

    expect(document.getElementById("sprite")).toBeNull();
    expect(document.querySelector("main")).not.toBeNull();
  });

  it("preserves a sprite whose symbol is referenced via <use href>", () => {
    document.body.innerHTML = `
      <svg id="sprite" style="display: none">
        <symbol id="icon-a"><path d="..."/></symbol>
      </svg>
      <svg class="icon"><use href="#icon-a"></use></svg>
    `;
    svgSpriteSuppressRule.apply(document.body);

    expect(document.getElementById("sprite")).not.toBeNull();
  });

  it("preserves a sprite referenced via xlink:href", () => {
    document.body.innerHTML = `
      <svg id="sprite" style="display: none">
        <symbol id="icon-a"><path/></symbol>
      </svg>
      <svg><use xlink:href="#icon-a"></use></svg>
    `;
    svgSpriteSuppressRule.apply(document.body);

    expect(document.getElementById("sprite")).not.toBeNull();
  });

  it("preserves a sprite referenced via an external-file href (path#id)", () => {
    document.body.innerHTML = `
      <svg id="sprite" style="display: none">
        <symbol id="icon-a"><path/></symbol>
      </svg>
      <svg><use href="/assets/sprite.svg#icon-a"></use></svg>
    `;
    svgSpriteSuppressRule.apply(document.body);

    expect(document.getElementById("sprite")).not.toBeNull();
  });

  it("removes a sprite hidden via inline width:0 + height:0", () => {
    document.body.innerHTML = `
      <svg style="position: absolute; width: 0; height: 0">
        <symbol id="icon-a"><path/></symbol>
      </svg>
    `;
    svgSpriteSuppressRule.apply(document.body);

    expect(document.querySelector("svg")).toBeNull();
  });

  it("removes a sprite marked aria-hidden=true", () => {
    document.body.innerHTML = `
      <svg aria-hidden="true">
        <symbol id="icon-a"><path/></symbol>
      </svg>
    `;
    svgSpriteSuppressRule.apply(document.body);

    expect(document.querySelector("svg")).toBeNull();
  });

  it("leaves a visible SVG with rendered content alone", () => {
    document.body.innerHTML = `
      <svg id="vis" width="100" height="100">
        <circle cx="50" cy="50" r="40"/>
      </svg>
    `;
    svgSpriteSuppressRule.apply(document.body);

    expect(document.getElementById("vis")).not.toBeNull();
  });

  it("leaves a hidden SVG with rendered shapes alongside symbols alone", () => {
    document.body.innerHTML = `
      <svg style="display: none">
        <symbol id="icon-a"><path/></symbol>
        <circle cx="5" cy="5" r="2"/>
      </svg>
    `;
    svgSpriteSuppressRule.apply(document.body);

    expect(document.querySelector("svg")).not.toBeNull();
  });

  it("leaves a visible sprite alone (no hide marker, might be intentional)", () => {
    document.body.innerHTML = `
      <svg>
        <symbol id="icon-a"><path/></symbol>
      </svg>
    `;
    svgSpriteSuppressRule.apply(document.body);

    expect(document.querySelector("svg")).not.toBeNull();
  });

  it("preserves <title>/<desc>/<metadata> alongside symbols (still sprite-shaped)", () => {
    document.body.innerHTML = `
      <svg style="display: none">
        <title>Icons</title>
        <desc>App icon sprite</desc>
        <symbol id="icon-a"><path/></symbol>
      </svg>
    `;
    svgSpriteSuppressRule.apply(document.body);

    expect(document.querySelector("svg")).toBeNull();
  });
});
