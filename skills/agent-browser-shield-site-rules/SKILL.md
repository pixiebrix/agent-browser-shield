---
name: agent-browser-shield-site-rules
description: How to add a new host to `extension/data/sites/*.yaml` using the Playwright MCP — per-rule extraction recipe, selector signal hierarchy, false-positive checks, validation, and one-PR-per-host workflow. Use when the user wants to extend site coverage for `reviews-redact`, `comments-redact`, `footer-redact`, or `search-url-helper`, or when extracting/refreshing selectors for an existing host.
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

- **`reviews-redact`** — selectors for the UGC review section on product/place
  detail pages. Keep aggregate ratings near the product title visible; only hide
  containers whose subtree is user-written review text. Amazon's
  `#reviewsMedley` / Walmart's `[data-testid="enhanced-review-section"]`
  pattern: the medley contains UGC, the aggregate badge lives elsewhere.

- **`comments-redact`** — selectors for discussion threads / comment sections.
  Like reviews-redact, prefer the container that holds the comment list while
  leaving the count/header/sort controls visible.

- **`footer-redact`** — only needed when the page footer is *not* a semantic
  `<footer>` and *not* `[role="contentinfo"]`. The generic always-on selectors
  in `extension/src/rules/footer-redact.ts` already catch both; ~95% of hosts
  don't need a site entry. Amazon's `<div id="navFooter">` is the canonical
  exception.

- **`search-url-helper`** — a free-text recipe (not a selector) describing the
  host's URL contract: search path, query/sort/filter params, pagination,
  direct-lookup URL shapes. Phrase it so an agent can construct URLs without
  typing into search boxes. Subject to the composability rule below — do not
  include a template the agent can't fill from data it actually has.

## The Playwright MCP workflow

`.mcp.json` at the repo root registers `@playwright/mcp` so any Claude Code
session opened in this directory can drive a Chromium browser. On first run,
Chrome for Testing downloads (~170 MB) — let it complete before continuing.

### 1. Branch off main

Per AGENTS.md GitHub flow: one branch per host (or one bundled branch if you're
sweeping many hosts at once).

```bash
git checkout main
git checkout -b crawl/<slug>-rules
```

### 2. Probe each rule type

For each rule the host is getting:

- **reviews-redact / comments-redact**: navigate to a representative detail page
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

- **footer-redact**: usually skip. Quick check: does the page footer match
  `<footer>` (top-level, not nested inside `article`/`section`/`aside`/`nav`) or
  `[role="contentinfo"]`? If yes, the generic always-on selector already catches
  it — don't author a site entry. If the footer is a plain `<div>` with an id or
  class (Amazon-style), author the selector.

- **search-url-helper**: navigate to the host's search-bearing page, submit a
  sample query, and observe the resulting URL. Capture the base path, query
  param name, sort/filter param vocabulary (probe the sort dropdown links if
  present), pagination shape, and any direct-lookup URL conventions for the
  host's primary content type (product, hotel, article, question). Apply the
  composability rule (next subsection) to every template before adding it.

#### Composability rule for `search-url-helper` templates

Site rules describe a host's URL contract for **any** agent performing
reasonable, general-purpose tasks on it — finding a product, reading an article,
looking up a hotel, opening a thread. They must not be tuned to any specific
benchmark task. **Do not open `benchmark/tasks.csv` while authoring or reviewing
a recipe.** If you do, you'll end up shipping templates that work because you
encoded ground-truth identifiers from the benchmark, not because the recipe is
general — that's cheating and it won't survive on tasks we haven't yet thought
of.

Frame each template by imagining the universe of things a real user would
plausibly type into the host's own search box or address bar, then ask whether
the template is fillable from data that universe produces.

Every `{variable}` in a template must be derivable from one of these sources
alone:

1. **The agent's runtime intent** — content a user might naturally state when
   directing the agent (a search query, a product name, a city, a date, an ISBN,
   a SKU printed on a physical item). Roughly: what a human would type into the
   host's own search box, written as a variable.
2. **The current page tree** the agent is looking at on this host (an article
   number visible in a link, a username in a header, a breadcrumb slug rendered
   as DOM text).
3. **A finite, fully-enumerated vocabulary you list inline in the recipe** —
   sort values, locale codes, currency codes, status codes.

If a template requires an opaque host-internal identifier the agent cannot
plausibly read or be told (category codes, internal SKUs not shown on the page,
slug suffixes that aren't the page title), **do not include it**. The agent will
invent a plausible-looking value, the URL will resolve to the wrong page or 404,
and the agent will spend extra steps recovering — usually ending up doing the
same search-query workflow it could have started with.

Worked example of the failure mode (observed in the wild on `ikea.com`, June
2026): the IKEA recipe shipped a
`Category browse: /{country}/{lang}/cat/{slug}-{categoryCode}/?sort={sort}`
template with an example (`/us/en/cat/bookcases-st002/`). `{categoryCode}` is a
host-internal 5-digit code the agent has no way to be told and no way to read
without first browsing to the category page. Agents guessed values like
`billy-bookcases-18732` and `billy-bookcases-16282`; both redirected to
unrelated category pages and the agent then had to fall back to the search box.
Dropping the `Category browse` line eliminated the failure mode without
affecting wins driven by the `Search:` template (which fills cleanly from any
runtime query).

Quick checklist when reviewing a recipe:

- For each `{variable}` in each template, point to its source — runtime intent,
  page-tree node text, or the enumerated vocabulary in the recipe. Be honest
  about whether a user could realistically supply it.
- If any variable's source is "the agent will probably know this" or "from
  training data," drop the template. Agent priors over host-specific identifiers
  are exactly the case that produces hallucinated codes.
- Prefer redundancy over breadth: it's better to ship one composable
  search/direct-lookup template than three templates the agent can only use
  one-third of the time.
- Resist the urge to peek at any benchmark task to validate a recipe. Validate
  against general agent intents instead — the recipe must pay off on tasks
  nobody has written yet.

### 3. Write the YAML

Schema is in `extension/data/site-rules.schema.ts`. Minimum: a top-level
`hostnames` array (URLPattern hostname strings) and a `rules` object with at
least one key. Per-rule `hostnames`/`pathnames` arrays narrow further when
needed (e.g. only apply `reviews-redact` on `/biz/*` for Yelp). Both the single-
entry and array-of-entries forms are valid for `*-hide` rules.

Add a header comment explaining what's hidden and what's preserved. Reference
the surviving aggregate/header that the user sees — future readers and review
comments rely on understanding that decision.

### 4. Validate via codegen

```bash
bun run build-site-data
```

The script regenerates `extension/src/rules/site-data.generated.ts`. Per
AGENTS.md, the generated file is committed alongside the YAML.

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
  homepage first (lighter detection), or defer reviews-redact and ship
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
