// AUTO-GENERATED — do not edit by hand.
// Source: extension/data/sites/*.yaml
// Regenerate with `bun run build-site-data`.

import { URLPattern } from "urlpattern-polyfill";
import type { SiteRule } from "../lib/selector-hide-rule";

export interface SiteRecipe {
  patterns: URLPattern[];
  recipe: string;
}

export const REVIEWS_HIDE_SITE_RULES: readonly SiteRule[] = [
  {
    // from data/sites/amazon.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?amazon.com" }),
    ],
    selectors: [
      "#reviewsMedley",
      "[data-hook=\"review\"]",
    ],
  },
  {
    // from data/sites/rei.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?rei.com" }),
    ],
    selectors: [
      "[data-ui=\"product-reviews\"]",
    ],
  },
  {
    // from data/sites/target.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?target.com" }),
    ],
    selectors: [
      "[data-test=\"ReviewsDashboard\"]",
    ],
  },
  {
    // from data/sites/walmart.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?walmart.com" }),
    ],
    selectors: [
      "#item-review-section",
      "[data-testid=\"seller-ratings-and-reviews\"]",
      "[data-testid=\"enhanced-review-section\"]",
    ],
  },
];

export const COMMENTS_HIDE_SITE_RULES: readonly SiteRule[] = [
  {
    // from data/sites/hackernews.yaml
    patterns: [
      new URLPattern({ hostname: "news.ycombinator.com" }),
    ],
    selectors: [
      ".comment-tree",
    ],
  },
  {
    // from data/sites/hackernews.yaml
    patterns: [
      new URLPattern({ hostname: "news.ycombinator.com", pathname: "/newcomments" }),
    ],
    selectors: [
      "#bigbox",
    ],
  },
  {
    // from data/sites/reddit.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?reddit.com" }),
    ],
    selectors: [
      "shreddit-comment-tree",
      "shreddit-comments-list",
    ],
  },
  {
    // from data/sites/youtube.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?youtube.com" }),
    ],
    selectors: [
      "ytd-comments",
    ],
  },
];

export const FOOTER_HIDE_SITE_RULES: readonly SiteRule[] = [
  {
    // from data/sites/amazon.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?amazon.com" }),
      new URLPattern({ hostname: "{*.}?amazon.co.uk" }),
      new URLPattern({ hostname: "{*.}?amazon.co.jp" }),
      new URLPattern({ hostname: "{*.}?amazon.ca" }),
      new URLPattern({ hostname: "{*.}?amazon.de" }),
    ],
    selectors: [
      "#navFooter",
    ],
  },
];

export const SEARCH_URL_HELPER_RECIPES: readonly SiteRecipe[] = [
  {
    // from data/sites/amazon.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?amazon.com" }),
    ],
    recipe: `abs URL helper for amazon.com — prefer URL navigation over typing.
Search: /s?k={query}&s={sort}&rh={facets}
Sort (s=): relevanceblender (default), price-asc-rank, price-desc-rank, review-rank, review-count-rank, date-desc-rank
Facets (rh=): comma-joined key:value pairs, URL-encoded (\`:\`→%3A, \`,\`→%2C). Common keys: n:{nodeId} (category), p_89:{brandName}, p_72:{ratingBin}, p_85:{primeBin}
Price range: low-price={cents}&high-price={cents} (USD cents)
Pagination: page=N (1-indexed, capped at 20)
Direct product: /dp/{ASIN} ; reviews: /product-reviews/{ASIN}?sortBy=recent&reviewerType=avp_only_reviews
`,
  },
  {
    // from data/sites/arxiv.yaml
    patterns: [
      new URLPattern({ hostname: "arxiv.org" }),
    ],
    recipe: `abs URL helper for arxiv.org — prefer URL navigation over typing.
Recent submissions in an archive: /list/{archive}/recent (e.g., /list/cs.AI/recent, /list/stat.ML/recent)
Search: /search/?searchtype=all&query={query}&start={offset} ; searchtype values: all, title, author, abstract, comments, journal_ref, acm_class, msc_class, report_num, paper_id, doi, orcid, license
Direct paper: /abs/{paperId} (HTML abstract) ; PDF: /pdf/{paperId}
Paper IDs use the YYMM.NNNNN form (e.g., 2401.12345).
`,
  },
  {
    // from data/sites/bbc.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?bbc.com" }),
    ],
    recipe: `abs URL helper for bbc.com — prefer URL navigation over typing.
Search: /search?q={query}&filter={news|sport|...}&page={n}
News sections: /news, /news/world, /news/business, /news/technology, /news/science_and_environment, /news/health, /news/entertainment_and_arts
Article URL form: /news/{slug}-{numericId} (e.g., /news/world-us-canada-12345678) ; live pages: /news/live/{slug}-{id}
`,
  },
  {
    // from data/sites/bestbuy.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?bestbuy.com" }),
    ],
    recipe: `abs URL helper for bestbuy.com — prefer URL navigation over typing.
Search: /site/searchpage.jsp?st={query}&id=pcat17071&sp={sort}&cp={page}&intl=nosplash
Sort (sp=): '+currentprice skuidsaas' (low→high), '-currentprice skuidsaas' (high→low), '-customertopratedcount skuidsaas' (top rated), '-customerreviewcount skuidsaas' (most reviewed), '-startdate skuidsaas' (newest)
Category scope: &browsedCategory={abcat...orPcmcat...Id}
Add intl=nosplash to skip the country-selection interstitial.
Direct product: /site/{slug}/{productId}.p?skuId={sku}
`,
  },
  {
    // from data/sites/etsy.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?etsy.com" }),
    ],
    recipe: `abs URL helper for etsy.com — prefer URL navigation over typing.
Search: /search?q={query}&order={sort}&min={min}&max={max}&color={color}&marketplace={handmade|vintage|craft_supplies}&free_shipping=true&page={n}
Sort (order=): most_relevant (default), price_asc, price_desc, date_desc
Category browse: /c/{slug-path} (e.g., /c/jewelry/necklaces/pendants) — accepts the same query params as /search.
Shop home: /shop/{shopName} ; shop reviews: /shop/{shopName}/reviews
Listing detail: /listing/{listingId}
`,
  },
  {
    // from data/sites/github.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?github.com" }),
    ],
    recipe: `abs URL helper for github.com — prefer URL navigation over typing.
Global search: /search?q={query}&type={repositories|issues|code|users|commits|discussions}&sort={best-match|stars|forks|updated}&order={asc|desc}
Repo issue list: /{owner}/{repo}/issues?q={query}&sort={created|updated|comments}&direction={asc|desc}
Repo PR list: /{owner}/{repo}/pulls?q={query}&sort={created|updated|popularity|long-running}&direction={asc|desc}
Issue/PR query syntax (in q=): is:open, is:closed, is:issue, is:pr, is:draft, is:merged, label:{name}, author:{login}, assignee:{login}, milestone:{title}, no:label, sort:{field}-{asc|desc} — combine with + (URL-encoded space).
Trending: /trending or /trending/{language}?since={daily|weekly|monthly} (e.g., /trending/python?since=weekly).
Direct repo: /{owner}/{repo} ; file at ref: /{owner}/{repo}/blob/{branch}/{path}
`,
  },
  {
    // from data/sites/hackernews.yaml
    patterns: [
      new URLPattern({ hostname: "news.ycombinator.com" }),
    ],
    recipe: `abs URL helper for news.ycombinator.com — prefer URL navigation over typing.
Front page: / ; newest: /newest ; best: /best ; ask: /ask ; show: /show ; jobs: /jobs
Item / comment thread: /item?id={itemId}
User profile: /user?id={username}
Score threshold: /over?points={n}
Full-text search is delegated to https://hn.algolia.com/?q={query}&sort={byPopularity|byDate}&type={story|comment|show_hn|ask_hn|front_page|poll}&dateRange={pastWeek|pastMonth|pastYear|last24h|forever|custom}&page={0-indexed}
`,
  },
  {
    // from data/sites/hn-algolia.yaml
    patterns: [
      new URLPattern({ hostname: "hn.algolia.com" }),
    ],
    recipe: `abs URL helper for hn.algolia.com (Hacker News search) — prefer URL navigation over typing.
Search: /?q={query}&sort={byPopularity|byDate}&type={story|comment|show_hn|ask_hn|front_page|poll}&dateRange={pastWeek|pastMonth|pastYear|last24h|forever|custom}&page={n}
Pagination is 0-indexed (page=0 is the first page).
Custom date window: dateRange=custom&dateStart={epochSec}&dateEnd={epochSec}
Prefix (autocomplete-style) match: &prefix=true
`,
  },
  {
    // from data/sites/homedepot.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?homedepot.com" }),
    ],
    recipe: `abs URL helper for homedepot.com — prefer URL navigation over typing.
Search: /s/{query}?sortby={field}&sortorder={asc|desc}&Nao={offset}
Sort fields: topsellers (default), price, customerrating, mostpopular, newest
Pagination uses 0-based offset Nao= in multiples of 24 (page 1=0, page 2=24, …).
Category browse: /b/{slug}/N-{taxonomyId} (taxonomyId starts with \`5yc1vZ\`; accepts the same query params as /s/)
Direct product: /p/{slug-or-dash}/{omsId} (omsId is the 9-10 digit Internet number)
`,
  },
  {
    // from data/sites/ikea.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?ikea.com" }),
    ],
    recipe: `abs URL helper for ikea.com — prefer URL navigation over typing.
Locale prefix is required: /{country}/{language}/... (US English = /us/en/).
Search: /{country}/{lang}/search/?q={query}&sort={sort}&page={n}
Category browse: /{country}/{lang}/cat/{slug}-{categoryCode}/?sort={sort} (e.g., /us/en/cat/bookcases-st002/)
Sort: RELEVANCE (default), PRICE_LOW_HIGH, PRICE_HIGH_LOW, NEW_PRODUCTS, RATING, MOST_POPULAR
Direct product: /{country}/{lang}/p/{slug}-{8digitArticle}/ (article number is global; slug may be \`-\`)
Article numbers are 8 digits — the dotted form on receipts (e.g., 604.169.25) with dots removed (60416925).
`,
  },
  {
    // from data/sites/mdn.yaml
    patterns: [
      new URLPattern({ hostname: "developer.mozilla.org" }),
    ],
    recipe: `abs URL helper for developer.mozilla.org — prefer URL navigation over typing.
Search: /{locale}/search?q={query} (locale default en-US, e.g., /en-US/search?q=Array.map)
Direct doc: /{locale}/docs/{Path/With/Slashes}
Examples: /en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map, /en-US/docs/Web/API/fetch
Browser compat tables are anchored at #browser_compatibility on the method's page.
`,
  },
  {
    // from data/sites/npm.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?npmjs.com" }),
    ],
    recipe: `abs URL helper for npmjs.com — prefer URL navigation over typing.
Search: /search?q={query} ; query supports qualifiers like \`keywords:graph\`, \`author:sindresorhus\`, \`not:deprecated\`.
Direct package: /package/{name} (scoped: /package/@scope/name, e.g., /package/@types/node)
Tabs on a package page: ?activeTab=readme (default) | versions | dependencies | dependents | code
Versions page exposes the full release history and is the canonical place to read 'latest published version'.
`,
  },
  {
    // from data/sites/python-docs.yaml
    patterns: [
      new URLPattern({ hostname: "docs.python.org" }),
    ],
    recipe: `abs URL helper for docs.python.org — prefer URL navigation over typing.
Search: /3/search.html?q={query} (replace \`3\` with another series like \`3.12\` to pin a minor version)
Direct library page: /3/library/{module}.html (e.g., /3/library/functions.html for builtins, /3/library/os.path.html)
Symbol anchor: append #{symbol} to the library URL (e.g., /3/library/functions.html#len, /3/library/os.path.html#os.path.join)
Genindex: /3/genindex-all.html ; tutorial: /3/tutorial/
`,
  },
  {
    // from data/sites/rei.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?rei.com" }),
    ],
    recipe: `abs URL helper for rei.com — prefer URL navigation over typing.
Search: /search?q={query}&page={n}&sort={sort}
Sort: relevance (default), price-low-to-high, price-high-to-low, best-seller, top-rated, newest
Category browse: /c/{slug} (e.g., /c/backpacking-tents)
Faceted filters on /c/ and /search use r={facet}%3A{value} repeated for each, e.g., r=brand%3AREI+Co-op, r=minTrailWeight%3A0-4, r=capacity%3A2-person
Direct product: /product/{productId}/{slug}
`,
  },
  {
    // from data/sites/weather-gov.yaml
    patterns: [
      new URLPattern({ hostname: "forecast.weather.gov" }),
    ],
    recipe: `abs URL helper for forecast.weather.gov — prefer URL navigation over typing.
Point forecast: /MapClick.php?lat={lat}&lon={lon} (decimal degrees, west longitude is negative)
Examples: New York NY lat=40.7142&lon=-74.0064 ; Los Angeles CA lat=34.0537&lon=-118.2428 ; Chicago IL lat=41.8843&lon=-87.6324
The same page renders the 7-day day-by-day forecast cards (skip overnight cards for daytime highs).
There is no keyword search — lat/lon is the primary key. If only a city is known, look up coordinates first.
`,
  },
  {
    // from data/sites/wikipedia.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?wikipedia.org" }),
      new URLPattern({ hostname: "{*.}?wiktionary.org" }),
    ],
    recipe: `abs URL helper for wikipedia.org — prefer URL navigation over typing.
Direct article: /wiki/{Title_With_Underscores} (spaces → \`_\`, first letter auto-capitalized).
Examples: /wiki/Albert_Einstein, /wiki/Python_(programming_language)
Full-text search: /w/index.php?title=Special:Search&search={query}&fulltext=1
Without fulltext=1, an exact title match auto-redirects to the article (the search box 'Go' behavior).
Specific revision: /wiki/{Title}?oldid={revId} ; diff: ?diff=prev&oldid={revId}
Section anchors: /wiki/{Title}#{Section_heading_with_underscores}
Language editions live on lang subdomains (en, de, ja, simple, …); the path contract is identical.
`,
  },
];
