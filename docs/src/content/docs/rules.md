---
title: Rules reference
description: The defense rules shipped with agent-browser-shield, what each one does, and its default state.
---

The extension ships 22 rules grouped into five rough categories. Each rule is
independently toggleable from the extension popup. Rules marked **default: on**
are active on fresh install; **default: off** rules must be enabled manually.

Rules marked **top frame only** never run inside iframes — useful for page-wide
targets (footers, cookie overlays, URL recipes) so they don't fire pointlessly
in every embedded frame.

The authoritative source for these definitions is
[`extension/src/rules/`](https://github.com/pixiebrix/agent-browser-shield/tree/main/extension/src/rules);
the initial enabled/disabled state for each rule lives in
[`extension/data/rule-defaults.json`](https://github.com/pixiebrix/agent-browser-shield/blob/main/extension/data/rule-defaults.json).
If this page disagrees with either, trust the source. The
[Install page](/install/#customizing-defaults-at-build-time) covers how to
override defaults at build time without forking the repo.

## Sensitive data masking

Replace credentials and personal identifiers with placeholders before they reach
the model. Both rules walk text nodes and substitute in place — the page still
renders normally for humans.

### Mask PII

- **ID:** `pii-mask`
- **Default:** on

Hide credit card numbers (Luhn-validated), phone numbers, and SSNs.

Prior art: Microsoft's open-source
[Presidio](https://github.com/microsoft/presidio) framework uses the same mix of
regex patterns, checksum validation (e.g., Luhn for credit cards), and
named-entity recognition to detect and redact PII in text.

### Mask Secrets

- **ID:** `secrets-mask`
- **Default:** on

Hide API keys, tokens, JWTs, private keys, and other high-entropy credentials.

Prior art: Repository secret-scanning tools —
[gitleaks](https://github.com/gitleaks/gitleaks),
[trufflehog](https://github.com/trufflesecurity/trufflehog), and Yelp's
[detect-secrets](https://github.com/Yelp/detect-secrets) — use comparable regex
and entropy heuristics to surface API keys, tokens, and private keys in source
repositories. This rule applies the same approach to live page text instead of
files on disk.

## Prompt-injection defense

Remove or hide content that could carry attacker-controlled instructions —
user-generated text, invisible text, and HTML comments.

Background: Greshake et al.,
[*Not what you've signed up for: Compromising Real-World LLM-Integrated Applications with Indirect Prompt Injection*](https://arxiv.org/abs/2302.12173)
(AISec 2023), introduces the indirect prompt injection threat model — attacker
text reaches the model via the page or document the LLM reads, not via the
user's prompt. Wu et al.,
[*WIPI: A New Web Threat for LLM-Driven Web Agents*](https://arxiv.org/abs/2402.16965),
extends that model specifically to LLM-driven web agents. The rules in this
section each target a delivery vector documented in those threat models.

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

Prior art: Liao et al.,
[*EIA: Environmental Injection Attack on Generalist Web Agents for Privacy Leakage*](https://arxiv.org/abs/2409.11295)
(ICLR 2025), demonstrates that web elements made invisible via CSS — opacity,
off-screen positioning, zero-area clipping — are read by web agents but unseen
by humans, the exact asymmetry this rule closes.

### Strip HTML Comments

- **ID:** `html-comment-strip`
- **Default:** on

Remove HTML comments from the page. Comments are invisible to humans but
readable by agents and can carry prompt-injection payloads. Comments inside
`<script>`/`<style>`/`<noscript>` are preserved. Removal is not reversible
within the current page load.

Prior art: HTML comments are explicitly enumerated as a non-rendered carrier for
indirect prompt injection in Greshake et al. (cited in the section preamble).

### Hide Comments

- **ID:** `comments-hide`
- **Default:** on

Hide user-generated comment threads so agents aren't exposed to potential prompt
injection from commenters. Covers common platforms (Disqus, Facebook) plus
Reddit, YouTube, and Hacker News.

Prior art: User-generated text as an injection delivery vector is core to the
WIPI threat model (Wu et al., cited in the section preamble).

### Hide Reviews

- **ID:** `reviews-hide`
- **Default:** on

Hide user-generated review text so agents aren't exposed to potential prompt
injection from reviewers. Covers schema.org microdata and supported sites
(Amazon, Walmart); aggregate star ratings are kept visible.

Detection relies on the [schema.org `Review`](https://schema.org/Review)
microdata vocabulary where sites expose it; user-generated reviews as an
indirect-prompt-injection vector are covered by the same WIPI threat model
referenced above.

### Hide Social Embeds

- **ID:** `social-embed-hide`
- **Default:** on

Hide embedded social-media widgets (Twitter/X, YouTube, Facebook, Instagram,
TikTok, LinkedIn, Reddit, Spotify, SoundCloud). Replaced with a placeholder so
the agent knows an embed lived there. Skipped on the embed providers' own
domains, where embeds are the page content.

Prior art: Same indirect-prompt-injection threat model as above; social embeds
are a third-party content surface whose text the host page does not control.

### Hide Cross-Origin Frames (Experimental)

- **ID:** `cross-origin-frame-hide`
- **Default:** off

Replace every `<iframe>` whose `src` resolves to a different web origin with a
click-to-reveal placeholder, so a browser-use agent reading the parent page
doesn't ingest the embedded-origin content. Same-origin frames, `srcdoc` frames,
and inert `about:`/`javascript:`/`data:`/`blob:` frames are left alone. Each
frame in the page processes its own direct children, so a cross-origin frame
nested inside a same-origin frame is also caught. Off by default because
legitimate cross-origin embeds (payment widgets, OAuth pop-ins, video,
third-party comments) are common and removing them will break those flows until
the user reveals.

Motivated by Roesner & Kohlbrenner,
[*Agentic Browsers and the Same-Origin Policy*](https://www.franziroesner.com/pdf/roesner_kohlbrenner_2026_agentic_sop.pdf)
(ICLR 2026 Workshop), which shows that agents willing to read cross-origin frame
content turn the same-origin policy from a hard guarantee into a soft one.

## Dark-pattern blocking

Block manipulative UI patterns that work on humans and can mislead agents the
same way. For evidence that current computer-use agents are highly susceptible
to these patterns — sometimes more so than humans — see
[SusBench](https://arxiv.org/abs/2510.11035) (Guo et al., 2025) and
[DECEPTICON](https://arxiv.org/abs/2512.22894) (Cuvin et al., 2025).

The pattern taxonomy itself traces to Harry Brignull's 2010
[deceptive.design](https://www.deceptive.design/) catalog (originally
darkpatterns.org) and the empirical study by Mathur et al.,
[*Dark Patterns at Scale: Findings from a Crawl of 11K Shopping Websites*](https://webtransparency.cs.princeton.edu/dark-patterns/)
(CSCW 2019), which enumerates *Scarcity*, *Sneaking* (sneak-into-basket),
*Preselection*, and *Urgency* (countdown timers) — the four categories the rules
below target. Bösch et al.,
[*Tales from the Dark Side: Privacy Dark Strategies and Privacy Dark Patterns*](https://petsymposium.org/popets/2016/popets-2016-0038.php)
(PoPETs 2016), gives the parallel privacy-side taxonomy.

### Hide Countdown Timers

- **ID:** `countdown-timer-hide`
- **Default:** on

Hide running countdown timers so agents aren't pressured by the artificial
time-sensitivity dark pattern. Snapshots timer-shaped text and confirms the
value decreased after 1.5s; re-scans on subtree mutations to catch lazy-loaded
sections.

The snapshot-and-confirm approach follows Mathur et al.,
[*Dark Patterns at Scale: Findings from a Crawl of 11K Shopping Websites*](https://webtransparency.cs.princeton.edu/dark-patterns/)
(CSCW 2019), who detected countdown timers by capturing DOM mutations over time
and comparing successive snapshots to confirm a ticking value.

### Hide Scarcity Warnings

- **ID:** `scarcity-hide`
- **Default:** on

Hide scarcity- and activity-based urgency messages ("Only 3 left", "Selling
fast", "12 viewing now") so agents aren't pressured by manufactured scarcity.
Out-of-stock indicators and bestseller badges are kept visible because they
convey real purchaseability or preference information.

Prior art: Cataloged as *Scarcity* (low-stock and high-demand subtypes) in
Mathur et al. 2019 (cited in the section preamble), which found scarcity claims
on roughly a fifth of the 11K shopping sites they crawled.

### Clear Checkout Checkboxes

- **ID:** `checkout-checkbox-clear`
- **Default:** on

On checkout-like URLs (`/cart`, `/checkout`, `/basket`, `/bag`, `/payment`,
`/order`), uncheck every pre-checked checkbox so the agent inherits no silently
selected add-ons (insurance, warranty, gift wrap, donations, marketing opt-ins).
The agent is then expected to re-check anything it actually wants to opt into,
including required agreements. `role="checkbox"` widgets and radio groups are
out of scope.

Prior art: Pre-checked opt-ins are *Preselection* in Mathur et al. 2019 and
Brignull's deceptive.design catalog (both cited in the section preamble).

### Neutralize Confirmshame Buttons

- **ID:** `confirmshame-neutralize`
- **Default:** on

Rewrite guilt-tripping decline buttons to a neutral `No thanks` so an agent
reading the DOM or accessibility tree isn't pushed away from the decline
option by manipulative copy. Coverage spans monetary confirmshame
("No, I'd rather pay full price", "I don't want to save money", "I hate
discounts"), health and safety guilt ("I don't care about my family's
safety", "I'm fine being unprotected"), loyalty downgrades ("Downgrade to
basic", "Forfeit my Gold status"), gamified progress loss ("Lose my streak",
"Sacrifice my XP"), imperative self-commands ("Charge me extra", "Stop
helping me save"), sarcastic acceptance ("Whatever, take my money"), and
the reverse-positive "Yes, [bad outcome]" framing common on confirmation
dialogs ("Yes, skip my savings", "Confirm: pay full price").

The underlying control is preserved — only its visible label and any
matching `aria-label` / `title` are rewritten — so the agent can still click
it normally. Plain decline labels like "No thanks", "Decline", "Maybe later",
"Skip", and "Continue as guest" are left untouched.

Prior art: Cataloged as *Confirmshaming* in Brignull's deceptive.design and
as part of the *Misdirection* family in Mathur et al. 2019 (both cited in the
section preamble).

### Flag Cart Add-Ons (Sneak-Into-Basket)

- **ID:** `cart-addon-flag`
- **Default:** on

On checkout-like URLs, prepend a visible `[abs: likely cart add-on]` annotation
to line items matching common sneak-into-basket patterns (protection plans,
extended warranties, AppleCare/SquareTrade/Asurion, insurance,
donation/round-up, gift wrap, carbon offset, shipping/package protection, Route,
Seel, Navidium, driver tips). The line item is **not** removed — the agent reads
the annotation and decides whether to click the line's remove control.

Prior art: Brignull's original 2010 *Sneak into Basket* pattern, generalized to
the *Sneaking* family in Mathur et al. 2019 (both cited in the section
preamble).

## Token-saving cleanup

Remove page chrome that costs tokens without helping the agent complete its
task.

Background: Content-vs-boilerplate separation has a long line of prior art,
starting with Kohlschütter et al.,
[*Boilerplate Detection using Shallow Text Features*](https://dl.acm.org/doi/10.1145/1718487.1718542)
(WSDM 2010) — the basis for the Boilerpipe library — and Mozilla's
[Readability.js](https://github.com/mozilla/readability), the algorithm behind
Firefox Reader View. Several rules below are the agent-facing analogue of those
heuristics, targeted at specific chrome categories instead of running a single
generic article extractor.

### Hide Page Footer

- **ID:** `footer-hide`
- **Default:** on

Hide the page footer (legal links, sitemap, social icons, marketing copy) to
save tokens. Per-section footers inside articles or asides are left visible.

Prior art: Footers are a canonical boilerplate region in Kohlschütter et al. and
are stripped by Readability.js (cited in the section preamble).

### Remove Cookie Banners

- **ID:** `cookie-banner-hide`
- **Default:** on
- **Scope:** top frame only

Remove GDPR/CCPA cookie consent banners (OneTrust, Cookiebot, TrustArc,
Sourcepoint, Quantcast, Osano, Didomi, and generic patterns). These overlays
float above the page, so they're removed entirely rather than replaced with an
in-flow placeholder.

Prior art: Aarhus University's
[Consent-O-Matic](https://github.com/cavi-au/Consent-O-Matic) maintains the
canonical open ruleset for matching CMPs (Consent Management Platforms) like
OneTrust, Cookiebot, and TrustArc — the same CMP coverage this rule targets,
though Consent-O-Matic auto-fills banners while this rule removes them outright.

### Remove Chat Widgets

- **ID:** `chat-widget-hide`
- **Default:** on
- **Scope:** top frame only

Remove live-chat widgets (Intercom, Drift, Zendesk, Crisp, Tawk.to, HubSpot,
Olark, LiveChat, Freshchat, Zopim). These bubbles float above the page, so
they're removed entirely rather than replaced with an in-flow placeholder.

Prior art: Same boilerplate-removal lineage as the section preamble; chat
bubbles are floating chrome that Readability-style extractors discard.

### Remove Newsletter Modals

- **ID:** `newsletter-modal-hide`
- **Default:** on
- **Scope:** top frame only

Remove interstitial newsletter signup modals that cover the page. Detects
fixed-position dialogs containing signup language and an email input. Standard
login modals, paywalls, and small toasts are kept visible.

Prior art: Interstitial signup modals are categorized as *Nagging* in Mathur et
al. 2019 (cited in the Dark-pattern section preamble); reader-mode tools like
Readability.js routinely strip them as non-article chrome.

### Hide Ads & Sponsored Results

- **ID:** `ads-hide`
- **Default:** on

Remove display ads and paid/sponsored search results. Well-known surfaces
(AdSense, GAM, Outbrain, Taboola, Google/Bing/Amazon sponsored results) are
stripped from the DOM so the agent never sees them. ~13k additional ad selectors
from EasyList are injected as a `display:none` stylesheet for broader coverage
of third-party ad networks.

Prior art: Selectors come directly from [EasyList](https://easylist.to/), the
filter list that powers [uBlock Origin](https://github.com/gorhill/uBlock),
Adblock Plus, and most other consumer ad blockers — over a decade of
community-maintained ad and tracker selector patterns.

### Remove Unused SVG Sprites

- **ID:** `svg-sprite-suppress`
- **Default:** on

Remove hidden SVG sprite containers (those holding only `<symbol>`/`<defs>`
definitions) when none of their symbols are referenced by any `<use>` element on
the page. Referenced sprites are preserved so icons keep working.

Prior art: Dead-code elimination — the bundler optimization of dropping
references that no live code reaches — applied to SVG `<symbol>` definitions at
runtime. No direct academic prior art known.

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

Prior art: This is an LLM-driven generalization of the boilerplate-detection
heuristics in Kohlschütter et al. (cited in the section preamble) and
Readability.js. The specific targeting of engagement and recommendation rails
aligns with the *Nagging*/*Interface Interference* families in Mathur et al.
2019 (cited in the Dark-pattern section preamble).

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

Prior art: Same goal as the [llms.txt](https://llmstxt.org/) proposal (Howard,
Answer.AI, 2024) — give LLMs a compact, machine-readable hint about how to use a
site — but injected client-side as a hidden landmark instead of relying on the
site to publish a top-level file. The hidden-but-readable delivery mechanism
reuses the long-established `sr-only` / `visually-hidden` convention from
screen-reader accessibility practice.
