---
name: agent-browser-shield-site-rules
description: How to add a new host to `extension/data/sites/*.yaml` using the Playwright MCP — per-rule extraction recipe, selector signal hierarchy, false-positive checks, validation, and one-PR-per-host workflow. Use when the user wants to extend site coverage for `reviews-hide`, `comments-hide`, `footer-hide`, or `search-url-helper`, or when extracting/refreshing selectors for an existing host.
---

# Authoring per-site rule data

Site-specific selectors and search-URL recipes live in
`extension/data/sites/<slug>.yaml` (one file per host or host family). The
codegen in `extension/scripts/build-site-data.ts` validates each YAML against
the zod schema in `extension/data/site-rules.schema.ts` and emits
`extension/src/rules/site-data.generated.ts`, which the rule files import.

Existing files (e.g. `extension/data/sites/amazon.yaml`,
`extension/data/sites/walmart.yaml`) are the style reference — read one before
writing a new one.

## Rule types

Only these four keys are valid in a site YAML:

- **`reviews-hide`** — selectors for the UGC review section on product/place
  detail pages. Keep aggregate ratings near the product title visible; only hide
  containers whose subtree is user-written review text. Amazon's
  `#reviewsMedley` / Walmart's `[data-testid="enhanced-review-section"]`
  pattern: the medley contains UGC, the aggregate badge lives elsewhere.

- **`comments-hide`** — selectors for discussion threads / comment sections.
  Like reviews-hide, prefer the container that holds the comment list while
  leaving the count/header/sort controls visible.

- **`footer-hide`** — only needed when the page footer is *not* a semantic
  `<footer>` and *not* `[role="contentinfo"]`. The generic always-on selectors
  in `extension/src/rules/footer-hide.ts` already catch both; ~95% of hosts
  don't need a site entry. Amazon's `<div id="navFooter">` is the canonical
  exception.

- **`search-url-helper`** — a free-text recipe (not a selector) describing the
  host's URL contract: search path, query/sort/filter params, pagination,
  direct-lookup URL shapes. Phrase it so an agent can construct URLs without
  typing into search boxes.

## The Playwright MCP workflow

`.mcp.json` at the repo root registers `@playwright/mcp` so any Claude Code
session opened in this directory can drive a Chromium browser. On first run,
Chrome for Testing downloads (~170 MB) — let it complete before continuing.

### 1. Branch off main

Per CLAUDE.md GitHub flow: one branch per host (or one bundled branch if you're
sweeping many hosts at once).

```bash
git checkout main
git checkout -b crawl/<slug>-rules
```

### 2. Probe each rule type

For each rule the host is getting:

- **reviews-hide / comments-hide**: navigate to a representative detail page
  (product, place, article, question), then probe candidate selectors using
  `mcp__playwright__browser_evaluate`. Prefer signals that decay slowly:

  1. **Schema.org microdata** — `[itemtype*="Review"]`, `[itemscope][itemtype]`.
  2. **ARIA landmarks/roles** — `[role="contentinfo"]` (footer);
     `[role="region"][aria-label*="review" i]`.
  3. **Semantic HTML** — `<footer>`, `<article>`, sectioning elements.
  4. **Stable ids and data attributes** — `#reviewsMedley`,
     `[data-testid="PropertyReviewsRegionBlock"]`,
     `[data-testid="Accordion_member_reviews"]`. These rarely break unless the
     host ships a redesign.
  5. **Class names** — last resort. Most likely to drift.

  After picking a candidate, **validate against the primary content node**: the
  selector must not, when removed, also remove `<main>`, `<article>`, the
  product title, or the page's primary information. Walk the candidate's
  ancestry to find the tightest container that wraps the UGC without enveloping
  the aggregate rating chip.

- **footer-hide**: usually skip. Quick check: does the page footer match
  `<footer>` (top-level, not nested inside `article`/`section`/`aside`/`nav`) or
  `[role="contentinfo"]`? If yes, the generic always-on selector already catches
  it — don't author a site entry. If the footer is a plain `<div>` with an id or
  class (Amazon-style), author the selector.

- **search-url-helper**: navigate to the host's search-bearing page, submit a
  sample query, and observe the resulting URL. Capture the base path, query
  param name, sort/filter param vocabulary (probe the sort dropdown links if
  present), pagination shape, and any direct-lookup URL conventions for the
  host's primary content type (product, hotel, article, question).

### 3. Write the YAML

Schema is in `extension/data/site-rules.schema.ts`. Minimum: a top-level
`hostnames` array (URLPattern hostname strings) and a `rules` object with at
least one key. Per-rule `hostnames`/`pathnames` arrays narrow further when
needed (e.g. only apply `reviews-hide` on `/biz/*` for Yelp). Both the single-
entry and array-of-entries forms are valid for `*-hide` rules.

Add a header comment explaining what's hidden and what's preserved. Reference
the surviving aggregate/header that the user sees — future readers and review
comments rely on understanding that decision.

### 4. Validate via codegen

```bash
bun run build-site-data
```

The script regenerates `extension/src/rules/site-data.generated.ts`. Per
CLAUDE.md, the generated file is committed alongside the YAML.

### 5. Commit and open the PR

```bash
git add extension/data/sites/<slug>.yaml extension/src/rules/site-data.generated.ts
git commit -m "Add <Host> site rules"
git push -u origin crawl/<slug>-rules
gh pr create --base main --head crawl/<slug>-rules --title "Add <Host> site rules"
```

If the change also affects the rule registry (`extension/src/rules/index.ts`) or
adds a brand-new rule id, update `skills/agent-browser-shield-config/SKILL.md`
so its rule ID list stays current.

## Known traps

- **DataDome / Akamai / Cloudflare bot challenges** — Yelp, Tripadvisor, Costco
  PDPs, and many shopping detail pages serve a JS interstitial to headless
  Chromium. Symptoms: `document.title === "<host>"`, body length under ~2 KB,
  body text starts with `var dd={...` or contains `geo.captcha-delivery.com`.
  Workarounds: retry after a few seconds (some clear automatically), try the
  homepage first (lighter detection), or defer reviews-hide and ship
  search-url-helper only with a comment in the YAML explaining the deferral.

- **Heavy SPAs with obfuscated class names** — Google Maps, Booking's embedded
  widgets, modern e-commerce React apps. Class names rotate per session and
  won't survive deployment. Prefer `data-testid` / `data-component` if the host
  ships them; otherwise rely on stable ids or defer the rule.

- **Paywall / sign-in gateways** — NYTimes, Bloomberg, WSJ may serve partial
  content to anonymous probes, and interactive clicks (e.g. "Read N comments")
  can mount a sign-in dialog instead of the target panel. Use `aria-controls` on
  the trigger button to find the panel id without having to click.

- **Lazy-loaded / collapsed content** — Costco's Material UI accordion ships the
  reviews collapsed; the DOM is still present, so the accordion-level
  `data-testid` is a valid hide target. Don't click to expand just to find a
  selector — the collapsed container is fine.

- **`form.submit()` strips event handlers** — some hosts attach JS to the search
  input that constructs additional query params. If a programmatic submit
  produces a partial URL, fall back to `mcp__playwright__browser_type` with
  `submit: true` to trigger the host's own submit path.

## When to commit the generated file vs not

Always commit `extension/src/rules/site-data.generated.ts` in the same PR as the
YAML edit. The build step regenerates it, but landing the YAML without the
regenerated artifact means `bun run build` becomes dirty for the next
contributor.

## Coordination with other skills

- Changing the registered rule list (adding a new rule id) → update
  `skills/agent-browser-shield-config/SKILL.md`.
- Changing the DOM markers / required agent behavior → update
  `skills/agent-browser-shield/SKILL.md`.
- This skill stays in sync with the schema; if you extend `SITE_DATA_RULE_IDS`
  in `site-rules.schema.ts`, update the Rule Types section above.
