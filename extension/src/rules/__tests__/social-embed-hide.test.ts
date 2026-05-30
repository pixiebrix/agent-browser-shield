import { PLACEHOLDER_CLASS, RULE_ATTR } from "../../lib/placeholder";
import { socialEmbedHideRule } from "../social-embed-hide";

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  socialEmbedHideRule.teardown?.();
});

describe("socialEmbedHideRule", () => {
  it("replaces a YouTube embed with a placeholder", () => {
    document.body.innerHTML = `
      <article>
        <p>Watch this:</p>
        <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="video"></iframe>
      </article>
    `;
    socialEmbedHideRule.apply(document.body);

    expect(document.querySelector("iframe")).toBeNull();
    const placeholder = document.querySelector(`.${PLACEHOLDER_CLASS}`);
    expect(placeholder?.getAttribute(RULE_ATTR)).toBe("social-embed-hide");
    expect(placeholder?.textContent).toContain("social embed hidden");
  });

  it("replaces a youtube-nocookie embed", () => {
    document.body.innerHTML = `
      <iframe src="https://www.youtube-nocookie.com/embed/abc"></iframe>
    `;
    socialEmbedHideRule.apply(document.body);
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("replaces a Twitter blockquote with a placeholder", () => {
    document.body.innerHTML = `
      <blockquote class="twitter-tweet"><p>tweet text</p></blockquote>
    `;
    socialEmbedHideRule.apply(document.body);
    expect(document.querySelector("blockquote.twitter-tweet")).toBeNull();
  });

  it("replaces an Instagram blockquote", () => {
    document.body.innerHTML = `
      <blockquote class="instagram-media" data-instgrm-permalink="...">post</blockquote>
    `;
    socialEmbedHideRule.apply(document.body);
    expect(document.querySelector("blockquote.instagram-media")).toBeNull();
  });

  it("replaces a TikTok blockquote", () => {
    document.body.innerHTML = `
      <blockquote class="tiktok-embed" cite="...">video</blockquote>
    `;
    socialEmbedHideRule.apply(document.body);
    expect(document.querySelector("blockquote.tiktok-embed")).toBeNull();
  });

  it("replaces a Facebook plugin iframe", () => {
    document.body.innerHTML = `
      <iframe src="https://www.facebook.com/plugins/post.php?href=..."></iframe>
    `;
    socialEmbedHideRule.apply(document.body);
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("replaces a Facebook-Connect (fb-post) container", () => {
    document.body.innerHTML = `<div class="fb-post" data-href="..."></div>`;
    socialEmbedHideRule.apply(document.body);
    expect(document.querySelector(".fb-post")).toBeNull();
  });

  it("replaces a Spotify embed", () => {
    document.body.innerHTML = `
      <iframe src="https://open.spotify.com/embed/track/abc"></iframe>
    `;
    socialEmbedHideRule.apply(document.body);
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("replaces a SoundCloud player", () => {
    document.body.innerHTML = `
      <iframe src="https://w.soundcloud.com/player/?url=https://api.soundcloud.com/tracks/..."></iframe>
    `;
    socialEmbedHideRule.apply(document.body);
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("leaves unrelated iframes alone", () => {
    document.body.innerHTML = `
      <iframe src="https://example.com/widget" title="custom widget"></iframe>
    `;
    socialEmbedHideRule.apply(document.body);
    expect(document.querySelector("iframe")).not.toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });
});
