---
status: Current
last_reviewed: 2026-06-09
---

# Context-pollution reduction

## Purpose

Strip page chrome and irrelevant regions that cost an agent tokens without
helping it complete the task — footers, cookie banners, chat widgets, ads,
disguised native advertorials, dead SVG sprite definitions, and (opt-in)
engagement rails identified by an LLM.

## Problem

Most of the bytes on a typical page — cookie banners, chat widgets, ads,
footers, sidebar rails, dead SVG sprite definitions — aren't load-bearing for
the task the agent was asked to do, but they all consume the agent's read
budget. On a token-billed agent, a chrome-heavy page can burn through budget
before the real content is reached; on a context-window-limited one, the actual
task gets evicted to make room for cookie-policy boilerplate. Either way the
agent gets dumber on pages the user picked precisely *because* the content was
there.

## User stories

### Human users

- As a **person using a token-billed agent**, I want the agent to spend its
  budget on the actual page content, so that a task on a chrome-heavy site
  doesn't burn tokens reading the footer five times.
- As a **person on a site behind a cookie banner**, I want the banner gone by
  default, so that the agent isn't blocked by an overlay before it can see the
  page.

### AI agents

- As a **browser-use agent reading the page**, I want a smaller DOM with the
  boilerplate regions stripped, so that my context window holds more of the
  task-relevant content.
- As a **browser-use agent that would otherwise interact with a chat widget**, I
  want the floating bubble gone, so that it isn't a stray target competing with
  the real call-to-action.
- As a **browser-use agent on a publisher page**, I want native advertorials
  with disclosure labels hidden, so that I don't treat paid placements as
  editorial coverage.

## Functional requirements

- **FR-1.** `footer-redact` (default **on**) hides the page footer (legal links,
  sitemap, social icons, marketing copy). Per-section footers inside articles or
  asides are left visible.
- **FR-2.** `cookie-banner-hide` (default **on**, top-frame only) removes
  GDPR/CCPA cookie consent banners across OneTrust, Cookiebot, TrustArc,
  Sourcepoint, Quantcast, Osano, Didomi, and generic patterns. Floating overlays
  are removed entirely rather than placeholder-replaced.
- **FR-3.** `chat-widget-hide` (default **on**, top-frame only) removes
  live-chat widgets (Intercom, Drift, Zendesk, Crisp, Tawk.to, HubSpot, Olark,
  LiveChat, Freshchat, Zopim). Removed entirely; no in-flow placeholder.
- **FR-4.** `ads-hide` (default **on**) strips display ads and paid/sponsored
  search results. Well-known surfaces (AdSense, GAM, Outbrain, Taboola,
  Google/Bing/Amazon sponsored results) are stripped from the DOM. ~13k
  additional EasyList generic element-hiding selectors are applied as a single
  `display:none` stylesheet
  (`extension/src/rules/easylist-generic.generated.ts`) — refreshed via
  `bun run fetch-easylist` and committed to keep builds deterministic and
  offline-capable.
- **FR-5.** `disguised-ad-flag` (default **on**) hides article-shaped blocks
  that carry a visible disclosure label — "Sponsored", "Promoted",
  "Advertorial", "Paid Post", "Partner Content", "Featured Listing", "From our
  Advertisers", "Marketing Partner", "In partnership with \<Brand>", or
  bracketed variants (`[Ad]`, `(promoted)`, `(sponsored)`). The disclosure label
  must sit inside an article-shaped container (heading carrier — `<h1>`–`<h6>`,
  `[role="heading"]`, or `[class~="headline"]` — plus an image/outbound link and
  body prose). A click-to-reveal placeholder is left in place.
- **FR-6.** `svg-sprite-strip` (default **on**) removes hidden SVG sprite
  containers (only `<symbol>`/`<defs>` definitions) when no `<use>` element on
  the page references their symbols. Referenced sprites are preserved. Unlike
  most strip rules, this one **detaches** the element outright because sprite
  containers are not framework-owned (see
  [ADR-0007](../decisions/0007-scrub-instead-of-detach-for-framework-dom.md)).
- **FR-7.** `irrelevant-sections-redact` (default **off**, top-frame only,
  requires an OpenAI API key) sends a compressed page tree with stable refs to a
  small LLM to classify engagement/exploration rails (related products, "you
  might also like", recommended articles, trending now). Identified rails are
  replaced with click-to-reveal placeholders. Interactive elements (search,
  cart, checkout, login) are labeled protected in the request payload. Re-scans
  on scroll to catch lazy-loaded content. Unavailable until a key is configured
  at build time via `OPENAI_API_KEY` or on the extension's options page.

## Non-functional requirements

- **NFR-P-1.** Selector-only hide rules (`ads-hide`'s EasyList portion,
  `cookie-banner-hide`, `chat-widget-hide`) use a CSS `display:none` stylesheet
  rather than per-element walks — one stylesheet append amortizes across
  thousands of selectors. See
  [ADR-0014](../decisions/0014-css-first-hide-for-selector-only-rules.md).
- **NFR-S-1.** `irrelevant-sections-redact` is the only rule that performs
  outbound network egress. It is off by default and gated on a user-supplied API
  key. The compressed page tree is sent only when the rule is enabled and a key
  is configured. See [ADR-0010](../decisions/0010-no-telemetry.md) and spec
  [0013](./0013-privacy-and-egress.md).
- **NFR-O-1.** EasyList refresh is a manual step (`bun run fetch-easylist`); the
  generated file is committed. Build freshness is not automatically enforced —
  operators decide cadence.

## Current implementation

- FR-1: `extension/src/rules/footer-redact.ts`,
  `extension/src/rules/__tests__/footer-redact.test.ts`.
- FR-2: `extension/src/rules/cookie-banner-hide.ts`,
  `extension/src/rules/__tests__/cookie-banner-hide.test.ts`.
- FR-3: `extension/src/rules/chat-widget-hide.ts`,
  `extension/src/rules/__tests__/chat-widget-hide.test.ts`.
- FR-4: `extension/src/rules/ads-hide.ts`,
  `extension/src/rules/easylist-generic.generated.ts`,
  `scripts/fetch_easylist.py`, `extension/src/rules/__tests__/ads-hide.test.ts`.
- FR-5: `extension/src/rules/disguised-ad-flag.ts`,
  `extension/src/rules/__tests__/disguised-ad-flag.test.ts`.
- FR-6: `extension/src/rules/svg-sprite-strip.ts`,
  `extension/src/rules/__tests__/svg-sprite-strip.test.ts`.
- FR-7: `extension/src/rules/irrelevant-sections-redact.ts`,
  `extension/src/lib/llm-client.ts`, `extension/src/lib/llm-background.ts`,
  `extension/src/lib/page-tree.ts`, `extension/src/lib/api-key-storage.ts`,
  `extension/src/rules/__tests__/irrelevant-sections-redact.test.ts`.

## Future work

- EasyList auto-refresh — manual today (NFR-O-1). No tracking issue yet.
- Multi-provider LLM backend for `irrelevant-sections-redact` — OpenAI is the
  only supported provider; local-model or alternate-vendor support is not on the
  roadmap.
- Per-host budget for `irrelevant-sections-redact` token spend — classification
  cost is bounded by the compressed page tree size; no hard per-tab cap today.

## Related

- ADRs: [ADR-0010](../decisions/0010-no-telemetry.md),
  [ADR-0014](../decisions/0014-css-first-hide-for-selector-only-rules.md).
- Docs: [`docs/src/content/docs/rules.md`](../docs/src/content/docs/rules.md)
  §"Context pollution".
- Specs: [0002](./0002-rule-engine.md), [0013](./0013-privacy-and-egress.md).
