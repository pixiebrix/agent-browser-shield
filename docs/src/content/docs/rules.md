---
title: Rules reference
description: The defense rules shipped with agent-browser-shield, what each one does, and its default state.
---

The extension ships 35 rules, each independently toggleable from the extension
popup. Rules marked **default: on** are active on fresh install; **default:
off** rules must be enabled manually.

Rules marked **top frame only** never run inside iframes — useful for page-wide
targets (footers, cookie overlays, URL recipes) so they don't fire pointlessly
in every embedded frame.

This page groups rules by the threat or pattern they defend against. The popup
itself shows a flat list; rule IDs here match the filenames in
[`extension/src/rules/`](https://github.com/pixiebrix/agent-browser-shield/tree/main/extension/src/rules),
which is the authoritative source for behavior. Initial enabled/disabled state
for each rule lives in
[`extension/data/rule-defaults.json`](https://github.com/pixiebrix/agent-browser-shield/blob/main/extension/data/rule-defaults.json).
If this page disagrees with either, trust the source. The
[Install page](/install/#customizing-defaults-at-build-time) covers how to
override defaults at build time without forking the repo.

Numbered citations like [[1]](#ref-greshake-2023) link to the
[References](#references) section at the bottom.

## Coverage scope

All rules run against the page's light DOM and any **open shadow roots** the
page builds via `element.attachShadow({ mode: "open" })`. That covers the way
most chat widgets, consent banners, ad SDKs, and custom elements ship UI today —
the host element lives in the light tree, the rendered content lives one
boundary inside.

**Closed shadow roots** (`{ mode: "closed" }`) are not reached. The Web
Components spec makes closed mode opt-out of all external JavaScript access —
`host.shadowRoot` is `null`, `document.adoptedStyleSheets` and
`MutationObserver` do not cross the boundary, and no supported API undoes that.
Any content a page renders inside a closed shadow root — whether ads, chat
widgets, hidden text, or prompt-injection payloads — is invisible to every rule
and will be passed through to the agent untouched. Closed shadow roots are
uncommon outside browser UA shadows and a handful of hardened embeds, but they
are a known gap. The optional
[Flag Closed Shadow Roots](#flag-closed-shadow-roots-experimental) rule can
heuristically warn the agent at read-time when this gap is in use.

## Indirect prompt injection

Remove or neutralize content that could carry attacker-controlled instructions
to a browser-use agent. The threat model — attacker text reaches the model via
the page the agent reads, not via the user's prompt — is introduced by Greshake
et al. [[1]](#ref-greshake-2023) and extended specifically to LLM-driven web
agents by Wu et al. (WIPI) [[2]](#ref-wu-wipi). Each rule below targets a
delivery vector documented in those threat models.

### Rendered text and user-generated content

#### Hide Prompt Injection

- **ID:** `prompt-injection-redact`
- **Default:** on

Hide page sections matching known prompt-injection patterns. The pattern set is
intentionally not reproduced in docs — see the project README for how patterns
are sourced and shipped.

#### Redact Encoded Payloads

- **ID:** `encoded-payload-redact`
- **Default:** on

Redact long base64, hex, or percent-encoded runs in page text whose decoded
bytes are mostly printable ASCII. Defends against the "decode this and follow
it" carrier — encoded text a human skims past as noise but an agent may
helpfully decode and treat as content or as an instruction. Length floors sit
above common hash sizes (SHA-256, SHA-512, Git commit SHAs), and a decoded
printable-ratio filter discards hashes, fingerprints, and binary blobs whose
bytes are not readable text. JWTs are left alone so `secrets-redact` can flag
them with its more specific label. Encoded content is a non-rendered carrier in
the same class as HTML comments and hidden text in Greshake et al.
[[1]](#ref-greshake-2023).

#### Hide Comments

- **ID:** `comments-redact`
- **Default:** on

Hide user-generated comment threads so agents aren't exposed to potential prompt
injection from commenters. Covers common platforms (Disqus, Facebook) plus
Reddit, YouTube, and Hacker News.

User-generated text as a prompt-injection delivery vector is core to the WIPI
threat model [[2]](#ref-wu-wipi).

#### Hide Reviews

- **ID:** `reviews-redact`
- **Default:** on

Hide user-generated review text so agents aren't exposed to potential prompt
injection from reviewers. Covers schema.org microdata and supported sites
(Amazon, Walmart); aggregate star ratings are kept visible.

Detection relies on the [schema.org `Review`](https://schema.org/Review)
microdata vocabulary where sites expose it.

#### Hide Social Embeds

- **ID:** `social-embed-redact`
- **Default:** on

Hide embedded social-media widgets (Twitter/X, YouTube, Facebook, Instagram,
TikTok, LinkedIn, Reddit, Spotify, SoundCloud). Replaced with a placeholder so
the agent knows an embed lived there. Skipped on the embed providers' own
domains, where embeds are the page content. Social embeds are a third-party
content surface whose text the host page does not control.

### Non-rendered DOM

#### Strip HTML Comments

- **ID:** `html-comment-strip`
- **Default:** on

Remove HTML comments from the page. Comments are invisible to humans but
readable by agents and can carry prompt-injection payloads. Comments inside
`<script>`/`<style>`/`<noscript>` are preserved. Removal is not reversible
within the current page load. HTML comments are explicitly enumerated as a
non-rendered carrier in Greshake et al. [[1]](#ref-greshake-2023).

#### Strip Noscript

- **ID:** `noscript-strip`
- **Default:** on

Remove every `<noscript>` element from the page. A browser-use agent runs in a
browser at all precisely because the site requires JavaScript — an operator who
could read the same data from the server directly would do that and skip the
browser entirely. With JS enabled, `<noscript>` content is, by definition, never
rendered to a human, but the markup still sits in the DOM and is still walked by
accessibility-tree and `innerText` consumers. That makes it a clean carrier for
prompt-injection payloads, fabricated authority claims, or fallback chrome the
agent may treat as load-bearing. `html-comment-strip` previously preserved
Comment nodes inside `<noscript>` so that SSR hydration markers and
conditional-CSS fragments survived; with this rule on, the surrounding noscript
element is removed outright, taking those comments with it.

Same non-rendered-carrier class as Greshake et al. [[1]](#ref-greshake-2023);
the "renderer-and-reader disagree on what's visible" asymmetry is the one
formalized for zero-width characters in Boucher et al.
[[5]](#ref-boucher-bad-chars) and CSS-hidden DOM in Liao et al. (EIA)
[[3]](#ref-liao-eia).

#### Strip Hidden Text

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

Liao et al. (EIA) [[3]](#ref-liao-eia) demonstrates that web elements made
invisible via CSS — opacity, off-screen positioning, zero-area clipping — are
read by web agents but unseen by humans, the exact asymmetry this rule closes.

#### Strip Unicode Invisibles

- **ID:** `unicode-invisibles-strip`
- **Default:** on

Remove Unicode code points that have no visible glyph but are still read by
agents walking the DOM or accessibility tree: the Unicode Tags block
(`U+E0000–U+E007F`), bidi override and isolate characters (`U+202A–U+202E`,
`U+2066–U+2069`), and the zero-width family (`U+200B`, `U+2060–U+2064`,
`U+FEFF`, `U+180E`). Applied to text nodes and to every attribute value, so the
rule also closes the `aria-label` / `alt` / `title` / `placeholder` surface.
Code points with legitimate script-shaping use are preserved: ZWJ (`U+200D`,
emoji and Indic joining), ZWNJ (`U+200C`, Persian/Hindi ligature control), and
the directional marks LRM/RLM (`U+200E`/`U+200F`).

The bidi-override attack class — invisible reordering chars that make text
render one way to humans and parse another way to compilers, interpreters, or
LLMs — comes from Boucher & Anderson (Trojan Source) [[4]](#ref-boucher-trojan).
Boucher et al. (Bad Characters) [[5]](#ref-boucher-bad-chars) extends the same
family — zero-width insertions, homoglyph swaps, bidi reordering — to NLP
systems and shows comparable degradation in sentiment, translation, and toxicity
classifiers. The Unicode-tag-block variant against LLM-integrated browsers (the
`U+E0000–U+E007F` carrier that encodes arbitrary ASCII as invisible tag
characters) was popularized by Goodside (2024) and is now a standard test case
in the indirect-injection benchmarks.

### HTML metadata and attributes

#### Strip Meta Injection

- **ID:** `meta-injection-strip`
- **Default:** on

Walk every `<meta>` element with a `content` attribute and every `<title>`
element. When the value matches the prompt-injection pattern set (the same regex
bundle as `prompt-injection-redact`), remove the `<meta>` element outright and
blank the `<title>` text. The rule does not gate on specific `name=` /
`property=` values — any meta whose content carries instruction-shaped text is
removed, covering `name="description"`, `name="keywords"`,
`property="og:title"`, `property="og:description"`, `name="twitter:title"`,
`name="twitter:description"`, `name="twitter:image:alt"`, and the `article:*`
family. Meta tags without a content attribute are left alone. The rule scans
`document.head` in addition to the engine's `apply` root, since meta and title
normally live in `<head>` and SPA frameworks (React 19 native head metadata,
react-helmet) mutate `<head>` on route changes.

Page metadata is invisible to a sighted human (it surfaces in the browser tab,
social-share unfurls, and search-result snippets, not in the rendered article
body), but agents that summarize a page frequently pull `description` /
`og:description` / `<title>` first as a compact "what is this page" answer. A
poisoned description reaches the agent without ever appearing in the page
content the user reviews.

The metadata vocabularies themselves are [Open Graph](https://ogp.me/)
(Facebook, 2010 — `og:*`) and
[Twitter Cards](https://developer.x.com/en/docs/twitter-for-websites/cards/overview/abouts-cards)
(Twitter / X — `twitter:*`); the underlying `<meta name="description">` is in
the
[HTML Living Standard](https://html.spec.whatwg.org/multipage/semantics.html#meta-name-description-2).
HTML metadata is enumerated among the non-rendered carriers in Greshake et al.
[[1]](#ref-greshake-2023).

#### Scrub Attribute Injection

- **ID:** `attribute-injection-sanitize`
- **Default:** on

Walk every element and, for a small allowlist of agent-readable attributes —
`aria-label`, `aria-description`, `alt`, `title`, `placeholder`, `data-tooltip`,
and `value` on disabled `<input>` elements — remove the attribute outright when
its value matches the prompt-injection pattern set (the same regex bundle used
by `prompt-injection-redact`). Clean attributes are preserved. Attributes
outside the allowlist are not inspected. We remove the whole attribute rather
than blank it because an empty `aria-label` actively hides an element from
accessibility-tree consumers, whereas a missing `aria-label` lets fallback name
computation (visible text, `alt`, associated label) proceed normally.

These attributes are almost never the main visible label sighted users read —
they surface in screen readers, hover popups, and empty-state hints. Browser-use
agents, on the other hand, read the accessibility tree where they are
first-class names and descriptions, so an attribute is a quiet carrier for
instruction-shaped text the operator never has to render.

HTML attribute values are enumerated as non-rendered carriers in Greshake et al.
[[1]](#ref-greshake-2023); Liao et al. (EIA) [[3]](#ref-liao-eia) demonstrates
that web agents act on accessibility-tree content that has no visible
counterpart. The accessibility-tree surface itself is documented by the W3C ARIA
Accessible Name and Description Computation 1.2 spec and Mozilla's
[A11y Tree](https://developer.mozilla.org/en-US/docs/Glossary/Accessibility_tree)
explainer.

### Structured data

#### Sanitize JSON-LD

- **ID:** `json-ld-sanitize`
- **Default:** on

Walk every `<script type="application/ld+json">` block, parse it, recursively
replace any string field whose value matches the prompt-injection pattern set
(the same regex bundle used by `prompt-injection-redact`) with an empty string,
and re-serialize. Structural fields useful to the agent — `price`,
`priceCurrency`, `availability`, `sku`, `identifier`, `ratingValue`,
`reviewCount`, `position` — are preserved exactly. Malformed JSON-LD is left
alone; non-`application/ld+json` `<script>` blocks are not touched.

Structured data is invisible to a sighted human reviewing the page but is
increasingly cited by browser-use agents as a "trusted summary" of what the page
is: `schema.org/Product` gives them name / brand / SKU / price,
`schema.org/Article` gives them author / publisher / datePublished, and
`schema.org/Review` gives them rating context. A site (or a third-party fragment
writing into the page) can poison `description`, `articleBody`, `name`, or
`author.name` without changing what a human sees.

JSON-LD is the JSON serialization of the
[schema.org vocabulary](https://schema.org/) (W3C JSON-LD 1.1 Recommendation,
2020\) — the same vocabulary `reviews-redact` reads to find user-generated
reviews. The non-rendered-but-agent-read carrier model comes from Greshake et
al. [[1]](#ref-greshake-2023); Liao et al. (EIA) [[3]](#ref-liao-eia) and Wu et
al. (WIPI) [[2]](#ref-wu-wipi) both demonstrate agents acting on page metadata
an end user never sees.

#### Strip SVG Injection

- **ID:** `svg-text-strip`
- **Default:** on

Walk every `<title>`, `<desc>`, and `<text>` element that lives inside an
`<svg>` and blank its text content when it matches the prompt-injection pattern
set (the same regex bundle used by `prompt-injection-redact`). The element shell
is preserved: `<text>` belongs to the visible drawing and removing it can shift
surrounding geometry, while `<title>` and `<desc>` are anchored to specific
shapes for accessibility-tree consumers — keeping the element keeps the
structural mapping intact while the payload is gone. The companion
`svg-sprite-strip` rule only removes hidden, unreferenced sprite containers;
this rule handles SVGs that render visually (logos, infographics, charts, inline
icons).

SVG `<title>` and `<desc>` are the SVG-namespace equivalents of HTML's
accessible-name and accessible-description: screen readers surface them, and
browser-use agents reading the accessibility tree pull them as "what is this
image?" without the operator having to render any visible text. SVG `<text>`
content does render, but inside an `<svg>` it lives outside the regular
flow-text walkers that drive several other rules. Either surface can be authored
without touching surrounding HTML — for example, swapping the SVG asset behind
an `<img src=…svg>` reference on a CDN.

SVG accessibility text is the SVG-namespace instance of the non-rendered-carrier
class in Greshake et al. [[1]](#ref-greshake-2023); the surface is documented by
the [W3C SVG Accessibility API Mappings](https://www.w3.org/TR/svg-aam-1.0/) and
the rendered-but-isolated `<text>` case is covered by Liao et al. (EIA)
[[3]](#ref-liao-eia).

#### Sanitize Schema Trust Claims (Experimental)

- **ID:** `schema-trust-sanitize`
- **Default:** off

Walk JSON-LD blocks and microdata items for schema.org `Organization`-typed
claims — `Article.publisher`, `Article.sourceOrganization`,
`ClaimReview.author`, and top-level brand assertions — and blank the `name`,
`url`, and `@id` fields when the claim's `url` resolves to a different
[registrable domain](https://publicsuffix.org/) than the page asserting it.
Structural fields (`@type`, `logo`, `datePublished`, `price`, `ratingValue`) are
preserved exactly, so an agent still gets the article's body data; it just loses
the impersonating identity strings. `Person`-typed claims and name-only claims
with no `url` to anchor against are out of scope and left alone. Off by default
while we gather real-world signal on false positives; the rule short-circuits
entirely on known syndicators (Google News, Yahoo News, MSN, Apple News,
Flipboard, SmartNews, Feedly, Pocket), web archives, AMP cache, and Google
Translate proxies, where mismatched publisher claims are expected.

Schema.org has no native provenance mechanism — every claim is self-asserted,
which is structurally why a page can list itself as published by The New York
Times without any binding to that organization (Iliadis & Pedersen
[[14]](#ref-iliadis-schema); Google's own
[Structured Data General Guidelines](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)
treat publisher impersonation as a policy violation enforced manually after
crawl, not a markup-level check). The unearned-authority surface for agents is
the same one already established for `json-ld-sanitize` and
`meta-injection-strip` — structured data the human reviewer does not see but the
agent ingests as a "trusted summary." Wu et al. (WIPI) [[2]](#ref-wu-wipi) and
Liao et al. (EIA) [[3]](#ref-liao-eia) both document agents acting on page
metadata that has no visible counterpart.

### Cross-origin surface

#### Hide Cross-Origin Frames (Experimental)

- **ID:** `cross-origin-frame-redact`
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

Motivated by Roesner & Kohlbrenner [[15]](#ref-roesner-sop), which shows that
agents willing to read cross-origin frame content turn the same-origin policy
from a hard guarantee into a soft one.

#### Flag navigator.webdriver Reads (Experimental)

- **ID:** `webdriver-probe-annotate`
- **Default:** off
- **Top frame only**

Inject a main-world probe that wraps `navigator.webdriver`'s getter on the
top-level document and listens for reads. If the page reads the property, the
rule prepends a screen-reader-only landmark to the document noting that the site
can distinguish AI-agent traffic from human traffic and may serve different
content to agents than to people.

Content scripts run in the extension's isolated JavaScript world and cannot
observe page-world property accesses directly. Two complementary delivery paths
run the same wrap-and-dispatch logic in the page world, so the rule fires
regardless of when the user toggled it on:

1. **Primary, document_start.** When the rule becomes enabled, the background
   service worker registers a standalone main-world bundle
   (`webdriver-probe.js`) via `chrome.scripting.registerContentScripts` with
   `world: "MAIN"` and `runAt: "document_start"`. Subsequent navigations run the
   probe before the page's first script, so reads issued during initial HTML
   parse are caught.
2. **Fallback, document_idle.** The rule's own `apply` inline-injects the same
   probe via `<script>` `textContent`. Covers the tab the user was already
   viewing when they toggled the rule on (dynamic registrations only apply to
   future navigations). Misses early-parse reads on that tab but catches
   `DOMContentLoaded` / `load` handlers, polled fingerprinters, and
   interaction-driven checks. Pages with a strict `script-src` CSP block the
   inline `<script>`; future navigations are still covered by the registered
   bundle.

Either path dispatches the same DOM `CustomEvent` on the document; the
isolated-world content script listens and stamps the landmark on first
detection. The wrapped getter persists for the lifetime of the document —
disabling the rule stops new landmarks from being added and unregisters the
main-world script for future navigations, but the wrap on the already-loaded
page is left in place.

The annotation flags *capability*, not measured cloaking — a
`navigator.webdriver` read by itself is also consistent with legitimate
anti-fraud fingerprinting on banking, payments, and checkout flows. The landmark
text accordingly never uses the unqualified word "cloaking". Off by default
while the false-positive rate is characterized.

Motivated by the AI-targeted cloaking threat model: Caspi & Tugendhaft
[[18]](#ref-caspi-cloaking) demonstrate that a site identifying inbound requests
as agent traffic can serve a poisoned, attacker-controlled version of a page
that human reviewers never see, turning the page itself into an
indirect-prompt-injection delivery surface. Search-engine cloaking has a long
lineage [[19]](#ref-wu-cloaking); the same primitive aimed at LLM crawlers is
the new threat.

#### Flag Closed Shadow Roots (Experimental)

- **ID:** `closed-shadow-root-annotate`
- **Default:** off
- **Top frame only**

Heuristically detect pages that render content inside closed shadow roots and
prepend a screen-reader-only landmark noting that the extension cannot see
inside those shadow trees. Complements the open-shadow-root coverage described
in [Coverage scope](#coverage-scope) above by giving the agent a positive signal
at read-time that a known blind spot is in use on this page.

Detection is necessarily heuristic: by spec, an element with `mode: "closed"` is
indistinguishable from an element with no shadow root at all from outside
JavaScript. The rule looks for the structural shape strongly correlated with
"closed shadow host": an upgraded custom element (hyphenated tag name, defined
in `customElements`) with no light-DOM children, no `host.shadowRoot`, and a
non-zero rendered box. Built-in elements with UA shadow roots (`<input>`,
`<details>`, `<video>`) are filtered out for free — their tag names contain no
hyphen. Declarative shadow DOM (`<template shadowrootmode="closed">`) is
indistinguishable from imperative closed shadows after parsing and is not
separately surfaced.

The landmark says "may contain content ABS cannot see," not "this is definitely
a closed shadow root" — a custom element that renders via canvas, WebGL, or
`::before` background-image with no actual shadow root will trip the heuristic
too. Off by default while the false-positive rate is characterized.

### Visual identity spoofing

#### Flag Spoofed Links

- **ID:** `link-spoof-annotate`
- **Default:** on

Annotate `<a>` elements whose visible text is visually spoofed relative to the
link's actual destination. Two checks, both signalled with a visible inline chip
appended next to the anchor:

1. The visible text contains a word that mixes Latin letters with letters from
   Greek (`U+0370–03FF`), Cyrillic (`U+0400–04FF`), Armenian (`U+0530–058F`), or
   Cherokee (`U+13A0–13FF`) — the script blocks that supply the Latin
   confusables used in homoglyph attacks. A pure-Cyrillic word adjacent to a
   pure-Latin word does not match; the test requires within-word script mixing.
2. The visible text contains a fully-formed domain whose last-two-labels apex
   doesn't match `URL.hostname` of the link's `href` (after stripping `www.`).
   Gated to `http(s):` hrefs so `mailto:`, `tel:`, and fragment anchors don't
   get spurious comparisons.

The chip is rendered as visible markup — not just a `data-*` attribute — because
the rule's threat model is the asymmetry where a vision-based agent (or a
sighted user) reads the rendered glyphs and acts on the displayed domain, while
the real navigation target is hidden in the unrendered `href`. DOM-walking
agents see the raw code points and the raw href and can perform the same
comparisons themselves; this rule mainly exists to close the gap for
accessibility-tree and screenshot consumers.

The homograph attack class is named by Gabrilovich & Gontmakher
[[6]](#ref-gabrilovich-homograph); Holgers et al. [[7]](#ref-holgers-homograph)
measures real-world prevalence and confusable coverage. The canonical confusable
mapping browsers and TLDs use to refuse mixed-script IDN labels comes from
Unicode [TR #36](https://www.unicode.org/reports/tr36/) and
[TR #39](https://www.unicode.org/reports/tr39/). Boucher et al. (Bad Characters)
[[5]](#ref-boucher-bad-chars) shows homoglyph substitution degrades modern NLP
classifiers at rates comparable to zero-width insertions and bidi reordering.
For the href / text-domain mismatch check, Dhamija et al. (Why Phishing Works)
[[8]](#ref-dhamija-phishing) is the foundational user study showing that
link-text / link-target mismatch is the single most reliable cue users fail to
check — making it the cue best worth re-presenting visibly to the agent.

#### Flag Trust Badges (Experimental)

- **ID:** `trust-badge-annotate`
- **Default:** off

Annotate image-shaped trust badges — Norton Secured, McAfee SECURE, BBB
Accredited, TrustPilot, Verified Seller, and similar — whose accessible name
asserts third-party endorsement that no content-script-accessible signal backs.
The chip notes the claim is not verifiable from page content; the badge itself
is left in place so the visual layout the page operator chose is preserved. Off
by default while we gather real-world signal on false positives.

Detection is intentionally narrow. Only `<img>`, `<svg>`, and elements with
`role="img"` are considered, so plain text labels (e.g., the "Verified Purchase"
line on a review, which `reviews-redact` already owns) are out of scope. The
accessible name is read in standard precedence (`aria-label` → `aria-labelledby`
→ SVG `<title>` → `alt` → `title`), capped at a short length, and matched
against a curated phrase set with word boundaries; bare single words like
"verified" or "trusted" do not match. Badges on the issuer's own registrable
domain — a Norton page showing its own logo, BBB.org showing its accreditation
seal — are exempted as first-party.

A page operator can drop `<img alt="Norton Secured">` onto any page; the chrome
TLS UI, EV certificate organization name, and other trust signals a human would
use to verify the claim are not reachable from a content script. The asymmetry
the rule closes is the same one `link-spoof-annotate` closes for
visible-text-vs-href: a vision-based or accessibility-tree-driven agent sees the
badge as evidence of trustworthiness, with no way to check it.

SusBench [[16]](#ref-susbench) and DECEPTICON [[17]](#ref-decepticon) both
include trust-badge spoofing in their benchmark suites and document that current
computer-use agents over-weight these badges as proof of legitimacy. The
unverifiable-claim framing is the same one applied by `schema-trust-sanitize` to
JSON-LD Organization claims and by `link-spoof-annotate` to anchor text —
page-asserted authority that has no binding to the entity it names.

## Dark patterns

Block manipulative UI patterns that work on humans and can mislead agents the
same way. Current computer-use agents are highly susceptible to these patterns —
sometimes more so than humans — per SusBench [[16]](#ref-susbench) and
DECEPTICON [[17]](#ref-decepticon).

The pattern taxonomy itself traces to Brignull's
[deceptive.design](https://www.deceptive.design/) catalog (originally
darkpatterns.org, 2010) [[10]](#ref-brignull) and the empirical study by Mathur
et al. [[9]](#ref-mathur-dark-patterns), which enumerates *Scarcity*, *Sneaking*
(sneak-into-basket), *Preselection*, *Urgency* (countdown timers),
*Confirmshaming* (under *Misdirection*), and *Nagging* — the families the rules
below target. Bösch et al. [[11]](#ref-bosch-privacy) gives the parallel
privacy-side taxonomy.

### Urgency

#### Hide Countdown Timers

- **ID:** `countdown-timer-redact`
- **Default:** on

Hide running countdown timers so agents aren't pressured by the artificial
time-sensitivity dark pattern. Snapshots timer-shaped text and confirms the
value decreased after 1.5s; re-scans on subtree mutations to catch lazy-loaded
sections. The snapshot-and-confirm approach follows Mathur et al.
[[9]](#ref-mathur-dark-patterns), who detected countdown timers by capturing DOM
mutations over time and comparing successive snapshots to confirm a ticking
value.

### Scarcity

#### Hide Scarcity Warnings

- **ID:** `scarcity-redact`
- **Default:** on

Hide scarcity- and activity-based urgency messages ("Only 3 left", "Selling
fast", "12 viewing now") so agents aren't pressured by manufactured scarcity.
Out-of-stock indicators and bestseller badges are kept visible because they
convey real purchaseability or preference information. Cataloged as *Scarcity*
(low-stock and high-demand subtypes) in Mathur et al.
[[9]](#ref-mathur-dark-patterns), which found scarcity claims on roughly a fifth
of the 11K shopping sites they crawled.

### Sneaking

#### Flag Cart Add-Ons

- **ID:** `cart-addon-annotate`
- **Default:** on

On checkout-like URLs, prepend a visible `[abs: likely cart add-on]` annotation
to line items matching common sneak-into-basket patterns (protection plans,
extended warranties, AppleCare/SquareTrade/Asurion, insurance,
donation/round-up, gift wrap, carbon offset, shipping/package protection, Route,
Seel, Navidium, driver tips). The line item is **not** removed — the agent reads
the annotation and decides whether to click the line's remove control.

Brignull's original 2010 *Sneak into Basket* pattern [[10]](#ref-brignull),
generalized to the *Sneaking* family in Mathur et al.
[[9]](#ref-mathur-dark-patterns).

### Preselection

#### Clear Checkout Checkboxes

- **ID:** `checkout-checkbox-sanitize`
- **Default:** on

On checkout-like URLs (`/cart`, `/checkout`, `/basket`, `/bag`, `/payment`,
`/order`), uncheck every pre-checked checkbox so the agent inherits no silently
selected add-ons (insurance, warranty, gift wrap, donations, marketing opt-ins).
The agent is then expected to re-check anything it actually wants to opt into,
including required agreements. `role="checkbox"` widgets and radio groups are
out of scope.

Pre-checked opt-ins are *Preselection* in Mathur et al.
[[9]](#ref-mathur-dark-patterns) and Brignull's deceptive.design catalog
[[10]](#ref-brignull).

### Confirmshaming

#### Neutralize Confirmshame Buttons

- **ID:** `confirmshame-sanitize`
- **Default:** on

Rewrite guilt-tripping decline buttons to a neutral `No thanks` so an agent
reading the DOM or accessibility tree isn't pushed away from the decline option
by manipulative copy. Coverage spans monetary confirmshame ("No, I'd rather pay
full price", "I don't want to save money", "I hate discounts"), health and
safety guilt ("I don't care about my family's safety", "I'm fine being
unprotected"), loyalty downgrades ("Downgrade to basic", "Forfeit my Gold
status"), gamified progress loss ("Lose my streak", "Sacrifice my XP"),
imperative self-commands ("Charge me extra", "Stop helping me save"), sarcastic
acceptance ("Whatever, take my money"), and the reverse-positive "Yes, \[bad
outcome\]" framing common on confirmation dialogs ("Yes, skip my savings",
"Confirm: pay full price").

The underlying control is preserved — only its visible label and any matching
`aria-label` / `title` are rewritten — so the agent can still click it normally.
Plain decline labels like "No thanks", "Decline", "Maybe later", "Skip", and
"Continue as guest" are left untouched.

Cataloged as *Confirmshaming* in Brignull's deceptive.design
[[10]](#ref-brignull) and as part of the *Misdirection* family in Mathur et al.
[[9]](#ref-mathur-dark-patterns).

### Roach Motel

#### Flag Roach-Motel Sign-Ups

- **ID:** `roach-motel-annotate`
- **Default:** on
- **Scope:** top frame only

On signup, subscription, and checkout pages of sites documented to make
cancellation difficult, embed a screen-reader-only landmark carrying a
normalized cancellation-difficulty grade (`hard`, `very-hard`, `impossible`),
the canonical cancel/delete URL when known, and a short note. Agents reading the
accessibility tree see the warning before completing signup; sighted users see
nothing.

Two data sources back the rule:

- A hand-curated list under
  [`extension/data/sites/`](https://github.com/pixiebrix/agent-browser-shield/tree/main/extension/data/sites)
  for FTC-defendant cases (Amazon Prime, Care.com, Match.com, Cleo AI, LA
  Fitness, Adobe, Vonage) and well-documented cancellation-friction cases
  (NYTimes, Washington Post, WSJ, Planet Fitness, Equinox), each with its own
  signup/subscription pathnames. Curated entries take precedence on URL match.
- A vendored snapshot of [JustDeleteMe](https://justdelete.me/)'s
  account-deletion directory
  ([MIT License](https://github.com/justdeleteme/justdelete.me/blob/master/LICENSE.md),
  Robb Lewis & contributors), filtered to entries graded `hard` or `impossible`.
  Used as a fallback when the curated list misses, gated to signup-shaped
  pathnames (`/signup`, `/subscribe`, `/join`, `/membership`, `/checkout`,
  `/plans`, `/pricing`, `/billing`, `/cart`, `/upgrade`, `/register`).
  JustDeleteMe attribution is included in the landmark text so the agent can
  cite the source back to the user. Refresh with `bun run fetch-justdeleteme`.

Brignull's original 2010 *Roach Motel* pattern, renamed *Hard to cancel* in the
current [deceptive.design](https://www.deceptive.design/types/hard-to-cancel)
taxonomy [[10]](#ref-brignull). Vasudevan et al. [[12]](#ref-vasudevan-roach)
gives the empirical basis: cancellation flows asymmetric to signup flows on a
significant share of subscription sites across the US, EU, and UK. The legal
"good" standard converges on signup/cancel symmetry — the FTC's 2024
[Click-to-Cancel rule](https://www.ftc.gov/news-events/news/press-releases/2024/10/federal-trade-commission-announces-final-click-cancel-rule-making-it-easier-consumers-end-recurring),
California
[AB-2863](https://leginfo.legislature.ca.gov/faces/billNavClient.xhtml?bill_id=202320240AB2863),
and EU Digital Services Act Art. 25.

### Nagging

#### Remove Newsletter Modals

- **ID:** `newsletter-modal-hide`
- **Default:** on
- **Scope:** top frame only

Remove interstitial newsletter signup modals that cover the page. Detects
fixed-position dialogs containing signup language and an email input. Standard
login modals, paywalls, and small toasts are kept visible.

Interstitial signup modals are categorized as *Nagging* in Mathur et al.
[[9]](#ref-mathur-dark-patterns).

## Sensitive-data masking

Replace credentials and personal identifiers with placeholders before they reach
the model. Both rules walk text nodes and substitute in place — the page still
renders normally for humans.

### Mask PII

- **ID:** `pii-redact`
- **Default:** on

Hide credit card numbers (Luhn-validated), phone numbers, and SSNs. Microsoft's
open-source [Presidio](https://github.com/microsoft/presidio) framework uses the
same mix of regex patterns, checksum validation (e.g., Luhn for credit cards),
and named-entity recognition to detect and redact PII in text.

### Mask Secrets

- **ID:** `secrets-redact`
- **Default:** on

Hide API keys, tokens, JWTs, private keys, and other high-entropy credentials.
Repository secret-scanning tools —
[gitleaks](https://github.com/gitleaks/gitleaks),
[trufflehog](https://github.com/trufflesecurity/trufflehog), and Yelp's
[detect-secrets](https://github.com/Yelp/detect-secrets) — use comparable regex
and entropy heuristics to surface API keys, tokens, and private keys in source
repositories. This rule applies the same approach to live page text instead of
files on disk.

## Context pollution

Remove page chrome and irrelevant regions that cost tokens without helping the
agent complete its task — footers, cookie banners, chat widgets, ads, engagement
rails, and dead SVG sprite definitions.

Content-vs-boilerplate separation has a long line of prior art, starting with
Kohlschütter et al. [[13]](#ref-kohlschutter-boilerplate) — the basis for the
Boilerpipe library — and Mozilla's
[Readability.js](https://github.com/mozilla/readability), the algorithm behind
Firefox Reader View. The rules below are the agent-facing analogue of those
heuristics, targeted at specific chrome categories instead of running a single
generic article extractor.

### Hide Page Footer

- **ID:** `footer-redact`
- **Default:** on

Hide the page footer (legal links, sitemap, social icons, marketing copy) to
save tokens. Per-section footers inside articles or asides are left visible.
Footers are a canonical boilerplate region in Kohlschütter et al.
[[13]](#ref-kohlschutter-boilerplate) and are stripped by Readability.js.

### Remove Cookie Banners

- **ID:** `cookie-banner-hide`
- **Default:** on
- **Scope:** top frame only

Remove GDPR/CCPA cookie consent banners (OneTrust, Cookiebot, TrustArc,
Sourcepoint, Quantcast, Osano, Didomi, and generic patterns). These overlays
float above the page, so they're removed entirely rather than replaced with an
in-flow placeholder.

Aarhus University's
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
they're removed entirely rather than replaced with an in-flow placeholder. Chat
bubbles are floating chrome that Readability-style extractors discard.

### Hide Ads and Sponsored Results

- **ID:** `ads-hide`
- **Default:** on

Remove display ads and paid/sponsored search results. Well-known surfaces
(AdSense, GAM, Outbrain, Taboola, Google/Bing/Amazon sponsored results) are
stripped from the DOM so the agent never sees them. ~13k additional ad selectors
from EasyList are injected as a `display:none` stylesheet for broader coverage
of third-party ad networks.

Selectors come directly from [EasyList](https://easylist.to/), the filter list
that powers [uBlock Origin](https://github.com/gorhill/uBlock), Adblock Plus,
and most other consumer ad blockers — over a decade of community-maintained ad
and tracker selector patterns.

### Hide Disguised Ads (Native Advertorials)

- **ID:** `disguised-ad-flag`
- **Default:** on

Hide article-shaped blocks that carry a visible disclosure label — "Sponsored",
"Promoted", "Advertorial", "Paid Post", "Partner Content", or the bracketed
variants common in social feeds — but are rendered by the publisher's own CMS
rather than served from an ad network. Native advertorials bypass the
infrastructure-level selectors that power `ads-hide` because they share class
names and DOM shape with editorial articles; the only signal that distinguishes
them is the disclosure label itself, which the
[FTC's `.com Disclosures`](https://www.ftc.gov/business-guidance/resources/com-disclosures-how-make-effective-disclosures-digital-advertising)
require publishers to render prominently.

Detection works on the visible label — not network selectors — and only fires
when the label sits inside an article-shaped container (heading, image or
outbound link, body prose). Filter chips, navigation links, and editorial
paragraphs that mention sponsorship in passing are excluded by that shape check,
by an interactive-ancestor guard, and by a whole-string regex on the label
element. Matching cards are replaced with a click-to-reveal placeholder in the
same style as `ads-hide` and `irrelevant-sections-redact`.

The label-only approach is the boilerplate-detection counterpart to Kohlschütter
et al. [[13]](#ref-kohlschutter-boilerplate) and
[Readability.js](https://github.com/mozilla/readability), narrowed to the
disclosure signal that paid content must carry by law.

### Remove Unused SVG Sprites

- **ID:** `svg-sprite-strip`
- **Default:** on

Remove hidden SVG sprite containers (those holding only `<symbol>`/`<defs>`
definitions) when none of their symbols are referenced by any `<use>` element on
the page. Referenced sprites are preserved so icons keep working. Dead-code
elimination — the bundler optimization of dropping references that no live code
reaches — applied to SVG `<symbol>` definitions at runtime.

### Hide Irrelevant Sections (AI)

- **ID:** `irrelevant-sections-redact`
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

An LLM-driven generalization of the boilerplate-detection heuristics in
Kohlschütter et al. [[13]](#ref-kohlschutter-boilerplate) and
[Readability.js](https://github.com/mozilla/readability), targeted at engagement
and recommendation rails instead of running a generic article extractor.

## Agent shortcuts

Inject hints that let agents reach what they need without navigating the
human-facing UI — currently URL recipes for searches, filters, and direct
lookups on covered hosts.

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

Same goal as the [llms.txt](https://llmstxt.org/) proposal (Howard, Answer.AI,
2024\) — give LLMs a compact, machine-readable hint about how to use a site — but
injected client-side as a hidden landmark instead of relying on the site to
publish a top-level file. The hidden-but-readable delivery mechanism reuses the
long-established `sr-only` / `visually-hidden` convention from screen-reader
accessibility practice.

## References

<a id="ref-greshake-2023"></a>**[1] Greshake et al. (2023).** *Not what you've
signed up for: Compromising Real-World LLM-Integrated Applications with Indirect
Prompt Injection.* AISec 2023.
[arxiv:2302.12173](https://arxiv.org/abs/2302.12173). Introduces the indirect
prompt injection threat model — attacker text reaches the model via the page or
document the LLM reads, not via the user's prompt — and enumerates non-rendered
DOM regions (HTML comments, hidden text, alt and metadata attributes) as
carriers.

<a id="ref-wu-wipi"></a>**[2] Wu et al.** *WIPI: A New Web Threat for LLM-Driven
Web Agents.* [arxiv:2402.16965](https://arxiv.org/abs/2402.16965). Extends the
indirect prompt injection threat model specifically to LLM-driven web agents.

<a id="ref-liao-eia"></a>**[3] Liao et al. (2025).** *EIA: Environmental
Injection Attack on Generalist Web Agents for Privacy Leakage.* ICLR 2025.
[arxiv:2409.11295](https://arxiv.org/abs/2409.11295). Demonstrates that web
elements made invisible via CSS — opacity, off-screen positioning, zero-area
clipping — and accessibility-tree content without a visible counterpart are read
by web agents but unseen by humans.

<a id="ref-boucher-trojan"></a>**[4] Boucher & Anderson (2023).** *Trojan
Source: Invisible Vulnerabilities.* USENIX Security 2023; CVE-2021-42574.
[trojansource.codes](https://trojansource.codes/trojan-source.pdf). Introduces
the bidi-override attack class.

<a id="ref-boucher-bad-chars"></a>**[5] Boucher, Pajola, Brookes, Anderson
(2022).** *Bad Characters: Imperceptible NLP Attacks.* IEEE S&P 2022.
[arxiv:2106.09898](https://arxiv.org/abs/2106.09898). Zero-width insertions,
homoglyph swaps, and bidi reordering against NLP systems with comparable
degradation in sentiment, translation, and toxicity classifiers.

<a id="ref-gabrilovich-homograph"></a>**[6] Gabrilovich & Gontmakher (2002).**
*The Homograph Attack.* CACM 2002.
[gabrilovich.com](https://gabrilovich.com/publications/papers/Gabrilovich02TheHomographAttack.pdf).
Names the attack class and demonstrates the `microsoft.com`-with-Cyrillic-`o`
proof of concept.

<a id="ref-holgers-homograph"></a>**[7] Holgers, Watson, Gribble (2006).**
*Cutting Through the Confusion: A Measurement Study of Homograph Attacks.*
USENIX ATC 2006.
[usenix.org](https://www.usenix.org/legacy/event/usenix06/tech/full_papers/holgers/holgers.pdf).
Measures real-world prevalence and confusable coverage.

<a id="ref-dhamija-phishing"></a>**[8] Dhamija, Tygar, Hearst (2006).** *Why
Phishing Works.* CHI 2006.
[berkeley.edu](https://people.eecs.berkeley.edu/~tygar/papers/Phishing/why_phishing_works.pdf).
Foundational user study showing that link-text / link-target mismatch is the
single most reliable cue users fail to check.

<a id="ref-mathur-dark-patterns"></a>**[9] Mathur et al. (2019).** *Dark
Patterns at Scale: Findings from a Crawl of 11K Shopping Websites.* CSCW 2019.
[princeton.edu](https://webtransparency.cs.princeton.edu/dark-patterns/).
Enumerates *Scarcity*, *Sneaking*, *Preselection*, *Urgency*, *Misdirection*
(including confirmshaming), and *Nagging*.

<a id="ref-brignull"></a>**[10] Brignull (2010–).**
[deceptive.design](https://www.deceptive.design/) (originally darkpatterns.org).
The pattern taxonomy this section's categories follow.

<a id="ref-bosch-privacy"></a>**[11] Bösch et al. (2016).** *Tales from the Dark
Side: Privacy Dark Strategies and Privacy Dark Patterns.* PoPETs 2016.
[petsymposium.org](https://petsymposium.org/popets/2016/popets-2016-0038.php).
Parallel privacy-side taxonomy.

<a id="ref-vasudevan-roach"></a>**[12] Vasudevan et al. (2024).** *Staying at
the Roach Motel: Cross-Country Analysis of Manipulative Subscription and
Cancellation UXes.* CHI 2024.
[arxiv:2309.17145](https://arxiv.org/abs/2309.17145). Cancellation flows
asymmetric to signup flows across the US, EU, and UK.

<a id="ref-kohlschutter-boilerplate"></a>**[13] Kohlschütter, Fankhauser, Nejdl
(2010).** *Boilerplate Detection using Shallow Text Features.* WSDM 2010.
[dl.acm.org](https://dl.acm.org/doi/10.1145/1718487.1718542). The basis for the
Boilerpipe library.

<a id="ref-iliadis-schema"></a>**[14] Iliadis & Pedersen (2025).** *One schema
to rule them all.* JASIST 2025.
[wiley.com](https://asistdl.onlinelibrary.wiley.com/doi/10.1002/asi.24744).
Schema.org has no native provenance mechanism — every claim is self-asserted.

<a id="ref-roesner-sop"></a>**[15] Roesner & Kohlbrenner (2026).** *Agentic
Browsers and the Same-Origin Policy.* ICLR 2026 Workshop.
[franziroesner.com](https://www.franziroesner.com/pdf/roesner_kohlbrenner_2026_agentic_sop.pdf).
Agents willing to read cross-origin frame content turn the same-origin policy
from a hard guarantee into a soft one.

<a id="ref-susbench"></a>**[16] Guo et al. (2025).** *SusBench.*
[arxiv:2510.11035](https://arxiv.org/abs/2510.11035). Benchmark for
computer-use-agent susceptibility to manipulative UI.

<a id="ref-decepticon"></a>**[17] Cuvin et al. (2025).** *DECEPTICON.*
[arxiv:2512.22894](https://arxiv.org/abs/2512.22894). Companion benchmark for
agent susceptibility to deceptive interface patterns.

<a id="ref-caspi-cloaking"></a>**[18] Caspi & Tugendhaft (2025).** *A Whole New
World: Creating a Parallel-Poisoned Web Only AI-Agents Can See.*
[arxiv:2509.00124](https://arxiv.org/abs/2509.00124). Demonstrates that a site
identifying inbound requests as agent traffic — via UA, IP range, or automation
telltales like `navigator.webdriver` — can serve a different,
attacker-controlled version of a page to AI agents than to human reviewers,
turning the cloaked page into an indirect-prompt-injection carrier.

<a id="ref-wu-cloaking"></a>**[19] Wu & Davison (2005).** *Cloaking and
Redirection: A Preliminary Study.* AIRWeb 2005.
[lehigh.edu](https://www.cse.lehigh.edu/~brian/pubs/2005/airweb/cloaking.pdf).
Names server-side cloaking against search-engine crawlers and characterizes the
agent-fingerprinting techniques operators use to decide which version of a page
to serve. The AI-targeted variant is the same primitive aimed at LLM crawlers.
