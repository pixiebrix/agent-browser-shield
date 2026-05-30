---
name: agent-browser-shield-config
description: How to configure the agent-browser-shield Chromium extension — toggling individual rules, pasting JSON to apply a full configuration, and the full list of rule IDs. Use when the user wants to change which agent-browser-shield rules are active.
---

# Configuring agent-browser-shield

Each rule can be toggled. Settings persist in `chrome.storage.local` and apply
on the next page load.

## Opening the options page

Click the **shield-icon badge** in the bottom-right corner of any page — it's a
circular button with `[data-abs="open-options"]` that opens the options tab.
Agents driving via the accessibility tree should target the button by its
accessible name *"Open Agent Browser Shield options"* (the shield glyph is
`aria-hidden`). This is the reliable path for browser agents that can't reach
the Chrome toolbar.

Humans can also right-click the toolbar icon → *Options*, or go to
`chrome://extensions` → *Details* → *Extension options*. The popup (toolbar icon
click) exposes the same per-rule toggles.

## Applying a config by pasting JSON

The options page has an *Apply configuration* section with a JSON textarea.
Paste an object mapping rule IDs to booleans, then click *Apply*:

```json
{
  "ads-hide": false,
  "pii-mask": true,
  "reviews-hide": false
}
```

**Apply replaces the full config.** Any rule omitted from the pasted JSON resets
to its default (enabled). To disable only one rule while preserving others,
first click *Export JSON*, edit the downloaded file, then paste it back. Unknown
keys and non-boolean values are rejected with an error.

## Rule IDs

- `pii-mask` — mask emails, phones, SSNs, addresses
- `secrets-mask` — mask API keys, tokens, card numbers
- `reviews-hide` — placeholder over user reviews
- `comments-hide` — placeholder over comment threads
- `prompt-injection-hide` — placeholder over likely injection surfaces
- `countdown-timer-hide` — remove urgency countdowns
- `scarcity-hide` — remove "only N left" scarcity cues
- `footer-hide` — collapse site footers
- `checkout-checkbox-clear` — uncheck pre-checked checkout boxes
- `cookie-banner-hide` — strip cookie consent banners
- `chat-widget-hide` — strip live-chat widgets
- `html-comment-strip` — strip HTML comments
- `hidden-text-strip` — strip text that's invisible to humans but readable by
  agents (color matched to background, opacity:0, visibility:hidden,
  font-size:0, off-screen blocks). Preserves SR-only text
  (.sr-only/.visually-hidden classes, plus the 1×1 + overflow:hidden structural
  envelope used by Amazon's `a-offscreen` etc.)
- `newsletter-modal-hide` — strip newsletter modals
- `svg-sprite-suppress` — strip inline SVG sprite definitions
- `social-embed-hide` — strip social media embeds
- `ads-hide` — remove display ads and paid/sponsored search results (curated
  selectors + EasyList stylesheet)
- `cart-addon-flag` — flag likely sneak-into-basket add-ons
- `search-url-helper` — embed a screen-reader-only landmark with URL recipes
  (search/filter/sort/direct lookup) on covered hosts (Amazon, Best Buy, Etsy,
  IKEA, Home Depot, REI, GitHub, Wikipedia, Hacker News, hn.algolia.com, MDN,
  npm, weather.gov, arXiv, Python docs, BBC) so agents can navigate by URL
  instead of typing into search boxes
- `irrelevant-sections-hide` — AI-classified hide of engagement / exploration
  rails (related products, "you might also like", recommended articles, trending
  now, sponsored, site-wide navigation rails). Calls a small LLM in the
  background worker; requires an OpenAI API key — either bundled at build time
  via `OPENAI_API_KEY` or saved on the options page. Until a key is configured
  the toggle shows as Unavailable. Hidden sections become click-to-reveal
  placeholders.
