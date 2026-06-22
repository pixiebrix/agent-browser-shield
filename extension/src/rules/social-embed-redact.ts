// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Hide embedded social-media widgets (Twitter/X tweets, YouTube videos,
// Facebook posts, Instagram posts, TikTok videos, LinkedIn shares, Reddit
// posts, Spotify players, SoundCloud players). Embeds are in-flow content,
// so they're replaced with a placeholder rather than removed — the agent
// can still see "there was an embed here" and click to reveal.
//
// Skipped on the embed providers' own domains (twitter.com, x.com,
// youtube.com, etc.) where the embeds are the actual page content.

import { createSelectorHideRule } from "../lib/selector-hide-rule";

const EMBED_OWNER_HOSTS =
  /(?:^|\.)(?:twitter|x|youtube|facebook|instagram|tiktok|reddit|linkedin|spotify|soundcloud)\.com$/i;

function notOnEmbedOwnerSite(_element: HTMLElement): boolean {
  return !EMBED_OWNER_HOSTS.test(location.hostname);
}

const { rule } = createSelectorHideRule({
  id: "social-embed-redact",
  label: "Hide Social Embeds",
  description:
    "Hide embedded social-media widgets (Twitter/X, YouTube, Facebook, Instagram, TikTok, etc.). Replaced with a placeholder.",
  hideLabel: "[social embed hidden — click to reveal]",
  alwaysOnSelectors: [
    // Twitter / X
    'iframe[src*="twitter.com"]',
    'iframe[src*="://x.com"]',
    'iframe[src*=".x.com"]',
    "blockquote.twitter-tweet",
    "blockquote.twitter-video",
    ".twitter-timeline",
    // YouTube
    'iframe[src*="youtube.com/embed"]',
    'iframe[src*="youtube-nocookie.com/embed"]',
    'iframe[src*="youtu.be"]',
    // Facebook
    'iframe[src*="facebook.com/plugins"]',
    'iframe[src*="facebook.com/v"]',
    ".fb-post",
    ".fb-page",
    ".fb-video",
    ".fb-comments",
    ".fb-like",
    // Instagram
    'iframe[src*="instagram.com/embed"]',
    "blockquote.instagram-media",
    // TikTok
    'iframe[src*="tiktok.com"]',
    "blockquote.tiktok-embed",
    // LinkedIn
    'iframe[src*="linkedin.com/embed"]',
    // Reddit
    'iframe[src*="redditmedia.com"]',
    'iframe[src*="reddit.com/embed"]',
    // Spotify
    'iframe[src*="open.spotify.com/embed"]',
    // SoundCloud
    'iframe[src*="soundcloud.com/player"]',
  ],
  candidateFilter: notOnEmbedOwnerSite,
  // Embeds (esp. Twitter/IG blockquotes) often hydrate from script tags loaded
  // async; the placeholder must catch them when they finish rendering.
  watchSubtrees: true,
});

export const socialEmbedRedactRule = rule;
