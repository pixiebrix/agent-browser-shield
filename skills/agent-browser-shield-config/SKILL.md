---
name: agent-browser-shield-config
description: How to configure the agent-browser-shield Chromium extension — toggling individual rules, pasting JSON to apply a full configuration, and the full list of rule IDs. Use when the user wants to change which agent-browser-shield rules are active.
---

# Configuring agent-browser-shield

Each rule can be toggled. Settings persist in `chrome.storage.local` and apply
on the next page load.

## Opening the options page

Humans: right-click the toolbar icon → *Options*, or go to `chrome://extensions`
→ *Details* → *Extension options*. The popup (toolbar icon click) exposes the
same per-rule toggles.

Builds may also enable a floating **shield-icon badge** in the bottom-right
corner of every page — a circular button with `[data-abs="open-options"]` and
accessible name *"Open Agent Browser Shield options"*. The badge is off by
default and is enabled per-build via the `optionsButton: true` field in the
defaults file (see the `agent-browser-shield-install` skill). When enabled,
agents driving via the accessibility tree can target it by its accessible name.

## Applying a config by pasting JSON

The options page has an *Apply configuration* section with a JSON textarea.
Paste an object mapping rule IDs to booleans, then click *Apply*:

```json
{
  "ads-hide": false,
  "pii-redact": true,
  "reviews-redact": false
}
```

**Apply replaces the full config.** Any rule omitted from the pasted JSON resets
to its default. To disable only one rule while preserving others, first click
*Export JSON*, edit the downloaded file, then paste it back. Unknown keys and
non-boolean values are rejected with an error.

A superset of this JSON shape can also be passed at build time via
`bun run build --defaults <path>` or `EXTENSION_DEFAULTS_FILE=<path>`. The
build-time file accepts the same rule-id keys plus a small set of reserved
non-rule keys (currently `optionsButton`) for build-time toggles that aren't
exposed in the Options page export. That's the right tool for infrastructure
deployments that need a custom default set in every fresh session without the
agent flipping toggles each time — see the `agent-browser-shield-install` skill
for the build-time workflow.

## Rule IDs

- `pii-redact` — mask emails, phones, SSNs, addresses
- `secrets-redact` — mask API keys, tokens, card numbers
- `reviews-redact` — placeholder over user reviews
- `comments-redact` — placeholder over comment threads
- `prompt-injection-redact` — placeholder over likely injection surfaces
- `countdown-timer-redact` — remove urgency countdowns
- `scarcity-redact` — remove "only N left" scarcity cues
- `confirmshame-sanitize` — rewrite guilt-tripping decline buttons ("No, I'd
  rather pay full price") to a neutral "No thanks"
- `footer-redact` — collapse site footers
- `checkout-checkbox-sanitize` — uncheck pre-checked checkout boxes
- `cookie-banner-hide` — strip cookie consent banners
- `chat-widget-hide` — strip live-chat widgets
- `html-comment-strip` — strip HTML comments
- `hidden-text-strip` — strip text that's invisible to humans but readable by
  agents (color matched to background, opacity:0, visibility:hidden,
  font-size:0, off-screen blocks). Preserves SR-only text
  (.sr-only/.visually-hidden classes, plus the 1×1 + overflow:hidden structural
  envelope used by Amazon's `a-offscreen` etc.)
- `newsletter-modal-hide` — strip newsletter modals
- `svg-sprite-strip` — strip inline SVG sprite definitions
- `svg-text-strip` — blank injection-shaped text inside in-page SVG `<title>`,
  `<desc>`, and `<text>` elements (covers logos, infographics, and charts;
  complements `svg-sprite-strip`, which only removes unused sprite containers)
- `social-embed-redact` — strip social media embeds
- `ads-hide` — remove display ads and paid/sponsored search results (curated
  selectors + EasyList stylesheet)
- `disguised-ad-flag` — hide article-shaped blocks carrying a visible
  "Sponsored" / "Promoted" / "Advertorial" / "Paid Post" / "Partner Content"
  disclosure label (plus bracket forms like `[Ad]` and suffix forms like "Paid
  for and presented by X"). Catches native advertorials rendered by the
  publisher's CMS that bypass the network-level selectors in `ads-hide`.
  Replaces matching cards with click-to-reveal placeholders.
- `cart-addon-annotate` — flag likely sneak-into-basket add-ons
- `link-spoof-annotate` — flag `<a>` elements whose visible text mixes scripts
  (homoglyph) or shows a domain that doesn't match the link's actual host.
  Renders a visible inline chip next to the anchor; useful for vision-based
  agents (DOM-walking agents can spot the same discrepancies themselves)
- `search-url-helper` — embed a screen-reader-only landmark with URL recipes
  (search/filter/sort/direct lookup) on covered hosts (Amazon, Best Buy, Etsy,
  IKEA, Home Depot, REI, GitHub, Wikipedia, Hacker News, hn.algolia.com, MDN,
  npm, weather.gov, arXiv, Python docs, BBC) so agents can navigate by URL
  instead of typing into search boxes
- `irrelevant-sections-redact` — AI-classified hide of engagement / exploration
  rails (related products, "you might also like", recommended articles, trending
  now, sponsored, site-wide navigation rails). Calls a small LLM in the
  background worker; requires an OpenAI API key — either bundled at build time
  via `OPENAI_API_KEY` or saved on the options page. Until a key is configured
  the toggle shows as Unavailable. Hidden sections become click-to-reveal
  placeholders.
- `cross-origin-frame-redact` — **experimental, off by default.** Replace
  cross-origin `<iframe>` elements with click-to-reveal placeholders so an agent
  reading the parent page doesn't ingest the embedded-origin content.
  Same-origin frames, `srcdoc` frames, and inert (`about:`/`javascript:`/
  `data:`/`blob:`) frames are left alone. Off by default because legitimate
  cross-origin embeds (payment widgets, OAuth pop-ins, video) are common and
  removing them breaks those flows until revealed.
