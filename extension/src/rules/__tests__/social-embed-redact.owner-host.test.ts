/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://twitter.com/jack/status/1"}
 */
import { PLACEHOLDER_CLASS } from "../../lib/placeholder";
import { socialEmbedRedactRule } from "../social-embed-redact";

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  socialEmbedRedactRule.teardown?.();
});

describe("socialEmbedRedactRule on embed-owner hosts", () => {
  it("leaves tweets alone on twitter.com (embeds are the content there)", () => {
    document.body.innerHTML = `
      <blockquote class="twitter-tweet"><p>tweet body</p></blockquote>
    `;
    socialEmbedRedactRule.apply(document.body);

    expect(document.querySelector("blockquote.twitter-tweet")).not.toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });
});
