---
title: Rules reference
description: The defense rules shipped with agent-browser-shield, what each one does, and its default state.
---

The extension ships 21 rules grouped into five rough categories. Each rule is
independently toggleable from the extension popup. Rules marked **default: on**
are active on fresh install; **default: off** rules must be enabled manually.

Rules marked **top frame only** never run inside iframes — useful for page-wide
targets (footers, cookie overlays, URL recipes) so they don't fire pointlessly
in every embedded frame.

The authoritative source for these definitions is
[`extension/src/rules/`](https://github.com/pixiebrix/agent-browser-shield/tree/main/extension/src/rules).
If this page disagrees with the source, trust the source.

## Sensitive data masking

Replace credentials and personal identifiers with placeholders before they reach
the model. Both rules walk text nodes and substitute in place — the page still
renders normally for humans.

### Mask PII

- **ID:** `pii-mask`
- **Default:** on

Hide credit card numbers (Luhn-validated), phone numbers, and SSNs.

### Mask Secrets

- **ID:** `secrets-mask`
- **Default:** on

Hide API keys, tokens, JWTs, private keys, and other high-entropy credentials.

## Prompt-injection defense

Remove or hide content that could carry attacker-controlled instructions —
user-generated text, invisible text, and HTML comments.

### Hide Prompt Injection

- **ID:** `prompt-injection-hide`
- **Default:** on

Hide page sections matching known prompt-injection patterns. The pattern set is
intentionally not reproduced in docs — see the project README for how patterns
are sourced and shipped.

### Strip Hidden Text

- **ID:** `hidden-text-strip`
- **Default:** on

Remove text that is invisible to humans (foreground matching background,
`visibility:hidden`, `opacity:0`, `font-size:0`, off-screen positioning,
zero-area clipping) but still readable by agents. Defends against "unseeable"
prompt injection. Screen-reader-only text is preserved (via `.sr-only`,
`.visually-hidden`, `.a-offscreen`, `.aok-offscreen`, MUI `visuallyHidden`, and
the 1×1 + `overflow:hidden` + `position:absolute` envelope) so a11y-tree
affordances like Amazon SERP prices stay intact. `display:none` is left alone so
collapsed menus and tab panels keep working.

### Strip HTML Comments

- **ID:** `html-comment-strip`
- **Default:** on

Remove HTML comments from the page. Comments are invisible to humans but
readable by agents and can carry prompt-injection payloads. Comments inside
`<script>`/`<style>`/`<noscript>` are preserved. Removal is not reversible
within the current page load.

### Hide Comments

- **ID:** `comments-hide`
- **Default:** on

Hide user-generated comment threads so agents aren't exposed to potential prompt
injection from commenters. Covers common platforms (Disqus, Facebook) plus
Reddit, YouTube, and Hacker News.

### Hide Reviews

- **ID:** `reviews-hide`
- **Default:** on

Hide user-generated review text so agents aren't exposed to potential prompt
injection from reviewers. Covers schema.org microdata and supported sites
(Amazon, Walmart); aggregate star ratings are kept visible.

### Hide Social Embeds

- **ID:** `social-embed-hide`
- **Default:** on

Hide embedded social-media widgets (Twitter/X, YouTube, Facebook, Instagram,
TikTok, LinkedIn, Reddit, Spotify, SoundCloud). Replaced with a placeholder so
the agent knows an embed lived there. Skipped on the embed providers' own
domains, where embeds are the page content.

### Hide Cross-Origin Frames (Experimental)

- **ID:** `cross-origin-frame-hide`
- **Default:** off

Replace every `<iframe>` whose `src` resolves to a different web origin with a
click-to-reveal placeholder, so a browser-use agent reading the parent page
doesn't ingest the embedded-origin content. Same-origin frames, `srcdoc`
frames, and inert `about:`/`javascript:`/`data:`/`blob:` frames are left
alone. Each frame in the page processes its own direct children, so a
cross-origin frame nested inside a same-origin frame is also caught. Off by
default because legitimate cross-origin embeds (payment widgets, OAuth
pop-ins, video, third-party comments) are common and removing them will
break those flows until the user reveals.

Motivated by Roesner & Kohlbrenner,
[*Agentic Browsers and the Same-Origin
Policy*](https://www.franziroesner.com/pdf/roesner_kohlbrenner_2026_agentic_sop.pdf)
(ICLR 2026 Workshop), which shows that agents willing to read cross-origin
frame content turn the same-origin policy from a hard guarantee into a soft
one.

## Dark-pattern blocking

Block manipulative UI patterns that work on humans and can mislead agents the
same way.

### Hide Countdown Timers

- **ID:** `countdown-timer-hide`
- **Default:** on

Hide running countdown timers so agents aren't pressured by the artificial
time-sensitivity dark pattern. Snapshots timer-shaped text and confirms the
value decreased after 1.5s; re-scans on subtree mutations to catch lazy-loaded
sections.

### Hide Scarcity Warnings

- **ID:** `scarcity-hide`
- **Default:** on

Hide scarcity- and activity-based urgency messages ("Only 3 left", "Selling
fast", "12 viewing now") so agents aren't pressured by manufactured scarcity.
Out-of-stock indicators and bestseller badges are kept visible because they
convey real purchaseability or preference information.

### Clear Checkout Checkboxes

- **ID:** `checkout-checkbox-clear`
- **Default:** on

On checkout-like URLs (`/cart`, `/checkout`, `/basket`, `/bag`, `/payment`,
`/order`), uncheck every pre-checked checkbox so the agent inherits no silently
selected add-ons (insurance, warranty, gift wrap, donations, marketing opt-ins).
The agent is then expected to re-check anything it actually wants to opt into,
including required agreements. `role="checkbox"` widgets and radio groups are
out of scope.

### Flag Cart Add-Ons (Sneak-Into-Basket)

- **ID:** `cart-addon-flag`
- **Default:** on

On checkout-like URLs, prepend a visible `[abs: likely cart add-on]` annotation
to line items matching common sneak-into-basket patterns (protection plans,
extended warranties, AppleCare/SquareTrade/Asurion, insurance,
donation/round-up, gift wrap, carbon offset, shipping/package protection, Route,
Seel, Navidium, driver tips). The line item is **not** removed — the agent reads
the annotation and decides whether to click the line's remove control.

## Token-saving cleanup

Remove page chrome that costs tokens without helping the agent complete its
task.

### Hide Page Footer

- **ID:** `footer-hide`
- **Default:** on

Hide the page footer (legal links, sitemap, social icons, marketing copy) to
save tokens. Per-section footers inside articles or asides are left visible.

### Remove Cookie Banners

- **ID:** `cookie-banner-hide`
- **Default:** on
- **Scope:** top frame only

Remove GDPR/CCPA cookie consent banners (OneTrust, Cookiebot, TrustArc,
Sourcepoint, Quantcast, Osano, Didomi, and generic patterns). These overlays
float above the page, so they're removed entirely rather than replaced with an
in-flow placeholder.

### Remove Chat Widgets

- **ID:** `chat-widget-hide`
- **Default:** on
- **Scope:** top frame only

Remove live-chat widgets (Intercom, Drift, Zendesk, Crisp, Tawk.to, HubSpot,
Olark, LiveChat, Freshchat, Zopim). These bubbles float above the page, so
they're removed entirely rather than replaced with an in-flow placeholder.

### Remove Newsletter Modals

- **ID:** `newsletter-modal-hide`
- **Default:** on
- **Scope:** top frame only

Remove interstitial newsletter signup modals that cover the page. Detects
fixed-position dialogs containing signup language and an email input. Standard
login modals, paywalls, and small toasts are kept visible.

### Hide Ads & Sponsored Results

- **ID:** `ads-hide`
- **Default:** on

Remove display ads and paid/sponsored search results. Well-known surfaces
(AdSense, GAM, Outbrain, Taboola, Google/Bing/Amazon sponsored results) are
stripped from the DOM so the agent never sees them. ~13k additional ad selectors
from EasyList are injected as a `display:none` stylesheet for broader coverage
of third-party ad networks.

### Remove Unused SVG Sprites

- **ID:** `svg-sprite-suppress`
- **Default:** on

Remove hidden SVG sprite containers (those holding only `<symbol>`/`<defs>`
definitions) when none of their symbols are referenced by any `<use>` element on
the page. Referenced sprites are preserved so icons keep working.

### Hide Irrelevant Sections (AI)

- **ID:** `irrelevant-sections-hide`
- **Default:** off
- **Scope:** top frame only
- **Availability:** requires an OpenAI API key — either bundled at build time
  via `OPENAI_API_KEY`, or saved on the extension's options page. Until a key is
  configured the rule shows as Unavailable in the popup and options.

Use a small LLM to identify engagement/exploration rails (related products, "you
might also like", recommended articles, trending now, etc.) and replace them
with click-to-reveal placeholders. Sends a compressed page tree with stable refs
so the LLM can choose the right granularity; interactive elements (search, cart,
checkout, login) are labeled as protected. Re-scans on scroll to catch
lazy-loaded content.

## Agent affordances

Inject hints that make pages easier for agents to navigate without changing the
human-visible UI.

### Embed Search URL Recipes

- **ID:** `search-url-helper`
- **Default:** on
- **Scope:** top frame only

On covered hosts (Amazon, Best Buy, Etsy, IKEA, Home Depot, REI, GitHub,
Wikipedia, Hacker News, MDN, npm, weather.gov, arXiv, Python docs, BBC), embed a
screen-reader-only landmark at the top of the page describing how to run
searches, filters, sorts, and direct lookups via URL. Lets agents navigate by
URL instead of typing into search boxes and clicking facets. No visible
affordance — the landmark is preserved by `hidden-text-strip` via the `sr-only`
class allowlist.
