// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://twitter.com/jack/status/1"}
 */
import { PLACEHOLDER_CLASS } from "../../lib/placeholder";
import { socialEmbedHideRule } from "../social-embed-hide";

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  socialEmbedHideRule.teardown?.();
});

describe("socialEmbedHideRule on embed-owner hosts", () => {
  it("leaves tweets alone on twitter.com (embeds are the content there)", () => {
    document.body.innerHTML = `
      <blockquote class="twitter-tweet"><p>tweet body</p></blockquote>
    `;
    socialEmbedHideRule.apply(document.body);

    expect(document.querySelector("blockquote.twitter-tweet")).not.toBeNull();
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });
});
