// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://www.reddit.com/r/javascript"}
 */
import { PLACEHOLDER_CLASS } from "../../lib/placeholder";
import { commentsHideRule, selectorsFor } from "../comments-hide";

describe("selectorsFor", () => {
  it("includes always-on selectors regardless of URL", () => {
    const selectors = selectorsFor("https://random-blog.example.com/post");
    expect(selectors).toContain("#disqus_thread");
    expect(selectors).toContain("#comments");
    expect(selectors).toContain(".fb-comments");
  });

  it("adds reddit-specific selectors on reddit.com", () => {
    const selectors = selectorsFor("https://www.reddit.com/r/javascript");
    expect(selectors).toContain("shreddit-comment-tree");
  });

  it("adds reddit selectors on old.reddit.com subdomain", () => {
    const selectors = selectorsFor("https://old.reddit.com/r/javascript");
    expect(selectors).toContain("shreddit-comment-tree");
  });

  it("adds reddit selectors on apex reddit.com", () => {
    const selectors = selectorsFor("https://reddit.com/r/javascript");
    expect(selectors).toContain("shreddit-comment-tree");
  });

  it("does not add reddit selectors on unrelated sites", () => {
    const selectors = selectorsFor("https://example.com/post");
    expect(selectors).not.toContain("shreddit-comment-tree");
  });

  it("does not match look-alike hostnames", () => {
    const selectors = selectorsFor("https://notreddit.com/r/javascript");
    expect(selectors).not.toContain("shreddit-comment-tree");
  });

  it("adds youtube selectors on youtube.com", () => {
    const selectors = selectorsFor("https://www.youtube.com/watch?v=abc");
    expect(selectors).toContain("ytd-comments");
  });

  it("adds hacker news selectors on news.ycombinator.com", () => {
    const selectors = selectorsFor("https://news.ycombinator.com/item?id=1");
    expect(selectors).toContain(".comment-tree");
  });

  it("adds #bigbox on the hacker news /newcomments page", () => {
    const selectors = selectorsFor("https://news.ycombinator.com/newcomments");
    expect(selectors).toContain("#bigbox");
  });

  it("does not add #bigbox on other hacker news pages", () => {
    const selectors = selectorsFor("https://news.ycombinator.com/item?id=1");
    expect(selectors).not.toContain("#bigbox");
  });
});

describe("commentsHideRule.apply", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("replaces always-on comment containers with a placeholder", () => {
    document.body.innerHTML = `<div id="comments"><p>a comment</p></div>`;
    commentsHideRule.apply(document.body);

    expect(document.querySelector("#comments")).toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).not.toBeNull();
  });

  it("replaces site-specific elements when on the matching site", () => {
    // This test file runs with location.href = https://www.reddit.com/...
    document.body.innerHTML = `
      <shreddit-comment-tree>
        <div>Reddit comments</div>
      </shreddit-comment-tree>
    `;
    commentsHideRule.apply(document.body);

    expect(document.querySelector("shreddit-comment-tree")).toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).not.toBeNull();
  });

  it("does not re-hide an element the user revealed via click", async () => {
    document.body.innerHTML = `<div id="comments"><p>a comment</p></div>`;
    commentsHideRule.apply(document.body);

    const placeholder = document.querySelector<HTMLElement>(
      `.${PLACEHOLDER_CLASS}`,
    );
    placeholder?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    // The mutation from replaceWith should trigger the subtree watcher, which
    // re-scans document.body. Wait long enough for the 250ms throttle to fire.
    await new Promise((resolve) => setTimeout(resolve, 350));

    expect(document.getElementById("comments")).not.toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();

    commentsHideRule.teardown?.();
  });
});
