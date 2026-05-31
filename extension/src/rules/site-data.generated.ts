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
    // from data/sites/allrecipes.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?allrecipes.com" }),
    ],
    selectors: [
      ".recipe-ugc-threaded-wrapper",
    ],
  },
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
    // from data/sites/booking.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?booking.com", pathname: "/hotel/*" }),
    ],
    selectors: [
      "[data-testid=\"PropertyReviewsRegionBlock\"]",
    ],
  },
  {
    // from data/sites/costco.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?costco.com" }),
    ],
    selectors: [
      "[data-testid=\"Accordion_member_reviews\"]",
    ],
  },
  {
    // from data/sites/ebay.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?ebay.com" }),
    ],
    selectors: [
      "#UserReviews",
      ".x-feedback-detail-list",
    ],
  },
  {
    // from data/sites/goodreads.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?goodreads.com", pathname: "/book/show/*" }),
    ],
    selectors: [
      "article.ReviewCard",
      "#SocialReviews",
    ],
  },
  {
    // from data/sites/lowes.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?lowes.com", pathname: "/pd/*" }),
    ],
    selectors: [
      "[data-testid=\"reviews-accordion\"]",
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
    // from data/sites/trustpilot.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?trustpilot.com", pathname: "/review/*" }),
    ],
    selectors: [
      "[data-reviews-overview-section]",
      "article[data-service-review-card-paper]",
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
  {
    // from data/sites/yelp.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?yelp.com", pathname: "/biz/*" }),
    ],
    selectors: [
      "#reviews",
    ],
  },
];

export const COMMENTS_HIDE_SITE_RULES: readonly SiteRule[] = [
  {
    // from data/sites/allrecipes.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?allrecipes.com" }),
    ],
    selectors: [
      ".recipe-ugc-qanda-wrapper",
    ],
  },
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
    // from data/sites/lowes.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?lowes.com", pathname: "/pd/*" }),
    ],
    selectors: [
      "[data-testid=\"communityQandA-accordion\"]",
    ],
  },
  {
    // from data/sites/nytimes.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?nytimes.com" }),
    ],
    selectors: [
      "#comments-panel",
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
    // from data/sites/stackoverflow.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?stackoverflow.com" }),
    ],
    selectors: [
      ".js-comments-container",
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
    // from data/sites/allrecipes.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?allrecipes.com" }),
    ],
    recipe: `abs URL helper for allrecipes.com — prefer URL navigation over typing.
Search: /search?q={query}
Direct recipe: /recipe/{recipeId}/{slug}/ (recipeId is a 4-6 digit integer; trailing slug is informational and forgiving)
Category browse: /recipes/{categoryId}/{slug}/ (e.g., /recipes/77/drinks/, /recipes/96/everyday-cooking/vegetarian/)
Ingredient hub: /ingredients/{slug}/ (e.g., /ingredients/chicken/)
Cuisine hub: /cuisine-a-z-1947/ index page, then /recipes/{categoryId}/cuisine/{slug}/
Collections: /recipes/{categoryId}/{slug}/ also covers seasonal hubs (e.g., thanksgiving, super-bowl).
Pagination on search/category pages: ?page={n} (1-indexed; on /search/ also as path segment in some hubs).
Recipe data (for parsing without rendering): /recipe/{id}/ pages embed schema.org/Recipe JSON-LD in a \`<script type="application/ld+json">\` block — read it directly instead of scraping the rendered DOM.
`,
  },
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
    // from data/sites/booking.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?booking.com" }),
    ],
    recipe: `abs URL helper for booking.com — prefer URL navigation over typing.
Search: /searchresults.html?ss={location}&checkin={YYYY-MM-DD}&checkout={YYYY-MM-DD}&group_adults={n}&no_rooms={n}&group_children={n}
Guest mix: group_adults=2&no_rooms=1&group_children=0 (defaults); per-child age: age={n}&age={n}
Sort (order=): popularity (default), price, bayesian_review_score, review_score_and_price, distance_from_search, class (star rating), class_asc
Pagination: offset={n} (multiples of 25)
Currency / language: selected_currency=USD ; lang=en-us
Filters (nflt= ; semicolon-joined): pri=1,2,3 (price band), class=4,5 (stars), ht_id=204 (hotels), review_score=80, hotelfacility=2 (parking), popular_activities=24 (spa)
Direct property: /hotel/{cc}/{slug}.html (cc = 2-letter country code; e.g. /hotel/us/the-plaza.html)
`,
  },
  {
    // from data/sites/costco.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?costco.com" }),
    ],
    recipe: `abs URL helper for costco.com — prefer URL navigation over typing.
Search: /s?keyword={query} (legacy /CatalogSearch?keyword= redirects to /s)
Department-scoped search: /s?keyword={query}&dept={departmentSlug}
Pagination: /s?keyword={query}&from={offset} (offset is multiples of 24)
Sort (sortBy=): item_relevance (default), item_price_low_to_high, item_price_high_to_low, member_rating, item_newest
Common filter facets (refine= ; ampersand-joined): brand_name-{Dell}, customer_rating-{4-up}, price_range-{500-1000}, item_location-{InWarehouse}
Direct product (canonical): /p/-/{product-slug}/{itemId} (older \`.product.{itemId}.html\` URLs 301-redirect)
Category page: /{slug}.html (e.g. /laptops.html)
Warehouse locator: /warehouse-locations
`,
  },
  {
    // from data/sites/duckduckgo.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?duckduckgo.com" }),
    ],
    recipe: `abs URL helper for duckduckgo.com — prefer URL navigation over typing.
Search: /?q={query}&ia={web|news|images|videos|maps|shopping}
Time filter (df=): d (past day), w (past week), m (past month), y (past year), {YYYY-MM-DD..YYYY-MM-DD} (custom range)
Region (kl=): wt-wt (worldwide, default), us-en, uk-en, ca-en, au-en, de-de, fr-fr, jp-jp, etc. (ISO {country}-{language})
SafeSearch (kp=): -2 (off), -1 (moderate), 1 (strict)
Lite/HTML-only (no JS): https://html.duckduckgo.com/html/?q={query}
Pagination (HTML mode): &s={offset} (multiples of ~30)
Bangs in q=: prefix \`!\` to redirect to a target site's search — \`!w\` (Wikipedia), \`!gh\` (GitHub), \`!so\` (Stack Overflow), \`!yt\` (YouTube), \`!gi\` (Google Images), \`!a\` (Amazon). Full list at duckduckgo.com/bangs.
AI-assist answer (web vertical): the result page surfaces an "AI Assist" box for natural-language queries — no separate URL.
`,
  },
  {
    // from data/sites/ebay.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?ebay.com" }),
    ],
    recipe: `abs URL helper for ebay.com — prefer URL navigation over typing.
Search: /sch/i.html?_nkw={query}&_sacat={categoryId}&_sop={sort}&_pgn={page}
Sort (_sop=): 12 (Best Match, default), 1 (Ending soonest), 10 (Newly listed), 15 (Price+Shipping low→high), 16 (Price+Shipping high→low), 7 (Distance nearest)
Filters (append): LH_BIN=1 (Buy It Now only), LH_Auction=1 (Auctions only), LH_PrefLoc=1 (US only), LH_PrefLoc=2 (North America), LH_PrefLoc=98 (Worldwide), LH_FS=1 (Free shipping), LH_ItemCondition={3000=Used,1000=New}
Category: _sacat={categoryId} (0 = all)
Direct listing: /itm/{itemId}
Seller's store: /str/{sellerName}
Catalog product page: /p/{epid} (epid from the listing's URL query)
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
    // from data/sites/goodreads.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?goodreads.com" }),
    ],
    recipe: `abs URL helper for goodreads.com — prefer URL navigation over typing.
Search: /search?q={query}&search_type=books (default) | people | groups | author
Field-restricted search (search%5Bfield%5D=): all (default), title, author, genre
Pagination: page={n} (1-indexed)
Direct book: /book/show/{bookId} or /book/show/{bookId}-{slug}
Author profile: /author/show/{authorId} or /author/show/{authorId}.{slug}
User profile: /user/show/{userId} or /user/show/{userId}-{slug}
Lists: /list/show/{listId} ; user shelves: /review/list/{userId}?shelf={shelfName}
Shelves with sort: /review/list/{userId}?shelf=read&sort=date_read&order=d
`,
  },
  {
    // from data/sites/google-flights.yaml
    patterns: [
      new URLPattern({ hostname: "www.google.com", pathname: "/travel/flights" }),
      new URLPattern({ hostname: "www.google.com", pathname: "/travel/flights/*" }),
    ],
    recipe: `abs URL helper for google.com/travel/flights — prefer natural-language q= over Google's binary tfs= state.
Search by natural language: /travel/flights?q={NL prompt}
  Prompt shapes Google parses reliably:
    "Flights from {origin} to {dest}"
    "Flights from {origin} to {dest} on {YYYY-MM-DD}"
    "Round trip flights from {origin} to {dest} {YYYY-MM-DD} to {YYYY-MM-DD}"
    "One way flights from {origin} to {dest} on {date}"
    "Flights from {origin} to {dest} {date} nonstop"
    "Business class flights from {origin} to {dest} on {date}"
  {origin}/{dest} may be IATA codes (SFO), city names (San Francisco), or "anywhere".
Internal state URL (/travel/flights/search?tfs={base64-protobuf}) encodes the search graph as a protobuf. Treat it as opaque — do not construct or mutate tfs= manually; use the q= form instead.
Currency / region (optional): &curr={ISO} ; &hl={lang} ; &gl={countryISO2}
Date inputs accept ISO \`YYYY-MM-DD\`; relative phrases like "next Friday" parse but are non-deterministic — prefer absolute dates.
Related Google products (separate hostnames/paths, not covered here):
  Hotels:   /travel/hotels/{destination}?q=…
  Things to do: /travel/things-to-do?q=…
`,
  },
  {
    // from data/sites/google-maps.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?google.com", pathname: "/maps/*" }),
    ],
    recipe: `abs URL helper for google.com/maps — prefer URL navigation over typing.
Search: /maps/search/{queryEncoded} or /maps/search/?api=1&query={query}
Search near a point: /maps/search/{query}/@{lat},{lng},{zoom}z
Direct place by name: /maps/place/{nameEncoded} — Maps resolves to the canonical place panel
Direct place by Plus Code or CID: /maps/place/?q=place_id:{placeId}
Directions: /maps/dir/{origin}/{destination}/ ; with mode and waypoints: /maps/dir/?api=1&origin={a}&destination={b}&travelmode={driving|walking|bicycling|transit}&waypoints={c|d|e}
Reviews tab on a place: append /@{lat},{lng},{zoom}z/data=!4m... (data segment is opaque — use search/place URL instead)
Coordinate viewport: /maps/@{lat},{lng},{zoom}z
Spaces in queries should be URL-encoded as \`+\` or \`%20\`.
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
    // from data/sites/kayak.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?kayak.com" }),
    ],
    recipe: `abs URL helper for kayak.com — prefer URL navigation over typing.
Flights (round trip): /flights/{ORIGIN}-{DEST}/{depart}/{return}[/{pax}adults][/{cls}]
  Codes: IATA airport/city codes uppercase (SFO, JFK, NYC, LON). Multi-airport metro: "/SFO,SJC-JFK"
  Dates: YYYY-MM-DD. One-way drops the {return} segment: /flights/SFO-JFK/2026-07-15
  Pax: "1adults" through "9adults" ; add "-{n}children" / "-{n}seniors" / "-{n}youth" / "-{n}infantinlap" / "-{n}infantonseat"
  Class: economy (default), premiumeconomy, business, first
  Stops via query: ?stops=0 (nonstop) | ~1 (≤1 stop) ; sort: ?sort={best|price_a|duration_a|depart_a}
  Nearby airports: append /nearbya for origin, /nearbyb for dest (e.g. /flights/SFO-JFK/2026-07-15/nearbya)
Hotels / stays: /hotels/{Location}/{checkin}/{checkout}/{n}adults
  Location: "City,ST" or full slug ("Seattle,WA", "Paris,France", "London-United-Kingdom-c17")
  Pax: "2adults" ; rooms: "/2adults/1room" ; kids: append "/2adults-2children-12-9" (ages comma-joined per child)
  Sort: ?sort={rank|price_a|distance_a|reviews_d|stars_d}
  Star filter: ?stars=4-5 ; price band: ?price=0-200
Cars: /cars/{Location}/{checkin}-{HH}h/{checkout}-{HH}h
  Location: airport IATA or city slug. Different pickup/dropoff: /cars/{PICKUP}/{DROPOFF}/{checkin}-{HH}h/{checkout}-{HH}h
Packages (flight+hotel): /packages/{ORIGIN}-{DEST,YYYY-MM-DD}/{return}/{n}adults
Trains: /trains/{ORIGIN}-{DEST}/{depart}
Sort knob across verticals: ?sort=… ; results URLs are stable once Kayak finishes polling — wait for the URL to settle before constructing follow-ups.
Currency / locale: ?currency=USD ; site mirror: kayak.{co.uk|de|fr|es|com.au} (URL grammar identical).
`,
  },
  {
    // from data/sites/lowes.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?lowes.com" }),
    ],
    recipe: `abs URL helper for lowes.com — prefer URL navigation over typing.
Free-text search: /search?searchTerm={query}
Narrow search to a Lowe's catalog node: /search?searchTerm={query}&catalog={catalogId} (catalogId is the 10-digit \`taxonomy\` node; read it off facet links on a result page)
Sort (sortMethod=): mostRelevant (default), priceLowToHigh, priceHighToLow, customerRating, mostReviewed, newest
Pagination: &page={n} (1-indexed); page size knob is \`pageSize=24\` (max ~48).
Category browse (canonical, no search term): /pl/{slug}/{plpNumber} (e.g., /pl/Drills-Drill-drivers-Power-tools-Tools/4294607722). Accepts the same sort/page params as /search.
Direct product (PDP): /pd/{slug}/{productId} — productId (a.k.a. "Item #") is 9-10 digits and is also exposed in the schema.org/Product JSON-LD on the page.
Reviews tab on a PDP: anchor \`#reviews\` (or \`#community-q-a\` for Q&A) — Lowe's accordion auto-expands when scrolled into view.
Local-store filter (defines availability + price): cookies set during /store/{storeNumber} navigation persist; many URLs accept \`&storeNumber={n}\` as an override.
Schema-rich product data: PDPs embed schema.org/Product JSON-LD with aggregate rating, brand, SKU, and price — prefer parsing it over scraping the rendered DOM.
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
    // from data/sites/nytimes.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?nytimes.com" }),
    ],
    recipe: `abs URL helper for nytimes.com — prefer URL navigation over typing.
Search: /search?query={query}&sort={newest|best|oldest}&startDate={YYYYMMDD}&endDate={YYYYMMDD}
Section filter (sections=): comma-joined section slugs (us, world, business, technology, opinion, science, health, sports, arts, books, movies, theater, food, travel, magazine, fashion)
Document type (types=): article (default), interactive, video, recipe, audio, multimedia
Pagination: page={n} (1-indexed)
Direct article URL: /{YYYY}/{MM}/{DD}/{section}/{slug}.html
Section landing: /section/{sectionSlug} ; topic landing: /topic/{topicSlug}
Wirecutter (reviews vertical): https://www.nytimes.com/wirecutter/search/?s={query}
Cooking (separate subdomain): https://cooking.nytimes.com/search?q={query}
`,
  },
  {
    // from data/sites/pubmed.yaml
    patterns: [
      new URLPattern({ hostname: "pubmed.ncbi.nlm.nih.gov" }),
    ],
    recipe: `abs URL helper for pubmed.ncbi.nlm.nih.gov — prefer URL navigation over typing.
Search: /?term={query}
Query syntax accepts PubMed field tags: term=crispr[Title]+AND+smith+jr[Author]+AND+2024[PDAT] (URL-encode brackets as %5B / %5D). Common tags: [Title], [TIAB] title/abstract, [Author], [Affiliation], [Journal], [MeSH Terms], [PDAT] publication date, [Substance].
Sort (sort=): relevance (default "Best match"), date (most recent indexed), pubdate (publication date), fauth (first author), jour (journal).
Page size: size={10|20|50|100|200} (default 10).
Pagination: page={n} (1-indexed).
Filters (filter=, repeatable):
  Date range: filter=years.{from}-{to} (e.g., years.2020-2024)
  Article type: filter=pubt.{type} — review, clinicaltrial, meta-analysis, systematicreview, randomizedcontrolledtrial, casereports, comparativestudy.
  Text availability: filter=simsearch1.fha (Free full text), filter=simsearch2.ffrft (Full text), filter=simsearch3.fft (Abstract).
  Species: filter=hum_ani.humans | hum_ani.animals
  Languages: filter=lang.english (and other ISO English-name slugs)
  Age groups: filter=age.infant | age.child | age.adult | age.aged
Direct article: /{PMID}/ (e.g., /38123456/). Abstract page; the JSON-LD / Dublin Core meta tags carry full citation data.
Linked surfaces (separate NCBI hostnames, not covered here):
  Full text via PubMed Central: pmc.ncbi.nlm.nih.gov/articles/PMC{PMCID}/
  NCBI taxonomy: ncbi.nlm.nih.gov/Taxonomy/Browser/wwwtax.cgi?id={TaxID}
  E-utilities API (programmatic): eutils.ncbi.nlm.nih.gov/entrez/eutils/{esearch|efetch|esummary}.fcgi
Advanced search builder: /advanced (UI only; constructs the same term= string under the hood — prefer direct term construction over the builder).
`,
  },
  {
    // from data/sites/pypi.yaml
    patterns: [
      new URLPattern({ hostname: "pypi.org" }),
    ],
    recipe: `abs URL helper for pypi.org — prefer URL navigation over typing.
Search: /search/?q={query}&o={sort}&c={classifier}&page={n}
Sort (o=): empty / omit = Relevance (default) ; -created = Date last updated
Pagination: page={n} (1-indexed)
Classifier filter (c=): exact trove classifier string, URL-encoded with literal " :: " between segments. Examples: c=Programming%20Language%20%3A%3A%20Python%20%3A%3A%203.12 ; c=Framework%20%3A%3A%20FastAPI ; c=License%20%3A%3A%20OSI%20Approved%20%3A%3A%20MIT%20License
Multiple classifiers: repeat &c= per filter (AND-combined).
Direct project: /project/{name}/ (latest release) ; specific version: /project/{name}/{version}/
Project sub-pages: /project/{name}/#description (default), /history (release timeline), /files (sdist/wheels), /#data (raw metadata)
User profile: /user/{username}/ ; organization: /org/{slug}/
JSON metadata (read-only API surface, no auth):
  /pypi/{name}/json — latest release manifest
  /pypi/{name}/{version}/json — specific release
  /simple/{name}/ — PEP 503 plaintext index of all files
Stats dashboard: /project/{name}/#data ; external Libraries.io / pypistats.org for download counts.
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
    // from data/sites/scholar.yaml
    patterns: [
      new URLPattern({ hostname: "scholar.google.com" }),
      new URLPattern({ hostname: "scholar.google.{*}" }),
    ],
    recipe: `abs URL helper for scholar.google.com — prefer URL navigation over typing.
Search: /scholar?q={query}&hl=en&as_sdt={collections}
Phrase / boolean syntax in q=: "exact phrase", -exclude, OR, intitle:{term}, author:"Name", source:"Journal"
Collections (as_sdt=): 0,5 = articles incl. case law (default web search) ; 0 = articles only ; 2006 = include patents ; 4 = case law only ; 7 = articles + patents
Date filter: as_ylo={year} (from), as_yhi={year} (to) — e.g., as_ylo=2020&as_yhi=2024
Sort by date: scisbd=1 (recency, no relevance ranking)
Pagination: start={offset} (multiples of 10; page 2 = start=10)
Language filter: lr=lang_{iso} (e.g., lang_en, lang_de, lang_zh-CN)
My Library (signed-in only): scilib=1
Cited-by / related (per result): /scholar?cites={clusterId} ; /scholar?q=related:{docId}:scholar.google.com/
Direct cluster page: /scholar?cluster={clusterId} (shows all versions of one paper)
Advanced search form: /scholar?as_q={all}&as_epq={phrase}&as_oq={any}&as_eq={none}&as_occt={any|title}&as_sauthors={author}&as_publication={venue}
`,
  },
  {
    // from data/sites/stackoverflow.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?stackoverflow.com" }),
    ],
    recipe: `abs URL helper for stackoverflow.com — prefer URL navigation over typing.
Search: /search?q={query}&tab={Newest|Relevance|Votes|Active}
Search operators (in q=): [tag] (tag filter), is:question, is:answer, user:{id}, score:{n}, answers:{n}, isaccepted:{yes|no}, hasaccepted:{yes|no}, created:YYYY-MM-DD..YYYY-MM-DD, lastactive:YYYY-MM-DD, title:{phrase}, body:{phrase}, url:{phrase}
Question list: /questions?tab={Newest|Active|Bountied|Frequent|Votes|Hot|Week|Month}&pagesize={15|30|50}&page={n}
Tag-filtered list: /questions/tagged/{tag}?tab={tab}&pagesize={n}
Direct question: /questions/{questionId} or /questions/{questionId}/{slug}
Direct answer: /a/{answerId}
User profile: /users/{userId} or /users/{userId}/{slug}
Tag page: /tags/{tagName} ; tag wiki: /tags/{tagName}/info
`,
  },
  {
    // from data/sites/tripadvisor.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?tripadvisor.com" }),
    ],
    recipe: `abs URL helper for tripadvisor.com — prefer URL navigation over typing.
Search: /Search?q={query}&searchSessionId=&searchNearby=false
Free-form search (across hotels, restaurants, attractions, vacation rentals): /Search?q={query}
Geo-prefixed location/category pages follow a slug+id contract:
  Hotels in a city:        /Hotels-g{geoId}-{slug}-Hotels.html
  Restaurants in a city:   /Restaurants-g{geoId}-{slug}.html
  Attractions in a city:   /Attractions-g{geoId}-{slug}-Activities.html
  Vacation rentals:        /VacationRentals-g{geoId}-Reviews-{slug}.html
Direct property URLs (slug+two ids):
  Hotel:        /Hotel_Review-g{geoId}-d{locationId}-Reviews-{slug}.html
  Restaurant:   /Restaurant_Review-g{geoId}-d{locationId}-Reviews-{slug}.html
  Attraction:   /Attraction_Review-g{geoId}-d{locationId}-Reviews-{slug}.html
Pagination (review list on a property page): -or{offset} segment inserted before "-Reviews", offset is 0-indexed by 10 (page 2 = \`-or10-\`).
Sort (hotel list, oa={offset}, ar=<rating>): /Hotels-g{geoId}-oa{offset}-{slug}-Hotels.html ; review-sort knob is \`sortOrder=\` with values RECENT, POPULAR, RATING_HIGH, RATING_LOW (appended as a query string).
`,
  },
  {
    // from data/sites/trustpilot.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?trustpilot.com" }),
    ],
    recipe: `abs URL helper for trustpilot.com — prefer URL navigation over typing.
Free-text search (businesses): /search?query={query}
Category browse: /categories/{category_slug} (snake_case, e.g., electronics_store, online_pharmacy, travel_agency)
  Category pagination: /categories/{slug}?page={n} (1-indexed)
Direct business reviews: /review/{domain} (host without scheme; e.g. /review/www.amazon.com, /review/booking.com)
  Sort (sort=): mostrecent | recency (newest first) | usefulness (default ranking) | rating (highest first) — vocabulary varies; recency is the reliable knob
  Star filter: stars={1|2|3|4|5} (repeat or comma-join for multiple)
  Language filter: languages={ISO2} (e.g., languages=en, languages=de)
  Date filter: date={last30days|last3months|last6months|last12months}
  Pagination: page={n} (1-indexed)
Direct individual review: /reviews/{reviewId} (24-char hex id from a review card link)
Business profile JSON-ish surface (use only as a sanity check; not a stable API):
  /api/businessunit-search/v1/profile-name/{domain}
`,
  },
  {
    // from data/sites/wayfair.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?wayfair.com" }),
    ],
    recipe: `abs URL helper for wayfair.com — prefer URL navigation over typing.
Free-text search: /keyword.php?keyword={query} — Wayfair redirects this to the closest matching category browse page (/furniture/sb0/{slug}-c{categoryId}.html?redir={query}).
Category browse (direct): /{department}/sb0/{slug}-c{categoryId}.html
  Common departments: furniture, decor-pillows, rugs, kitchen-tabletop, bed-bath, outdoor, baby-kids, lighting, storage-organization, home-improvement, appliances, holiday-decor.
  Pagination: ?curpage={n} (1-indexed)
  Sort (filterids syntax, on category URLs): ?sortby={topreviews|topsellers|recommended|pricelowtohigh|pricehightolow|recentlyadded}
  Price range: ?prc_pricerange_min={dollars}&prc_pricerange_max={dollars}
  Customer rating min: ?prc_customerrating_avgcustomerreview={stars} (4 = "4+ Stars")
  Free shipping: ?prc_freeshipping=true
  Generic facet filter: filterids appears as \`?{facet}={value}\` pairs derived from the on-page chips — read the active filter URLs off the chip elements before constructing.
Direct product (PDP): /{department}/pdp/{slug}-w{productId}.html — productId starts with \`w\` followed by 9 digits (e.g., w005059629).
  Variant: ?piid={piidNumber[,piidNumber]} (comma-joined integer ids; each piid selects one option from a variant axis).
Reviews tab on a PDP: append #section-customer-reviews (in-page anchor; the actual review list is fetched lazily).
Sales / deals hub: /deals-and-sales/ ; daily sale slug: /sale/{event-slug}.
Idea boards (signed-in only): /myideaboards (out of scope without auth).
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
  {
    // from data/sites/yelp.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?yelp.com" }),
    ],
    recipe: `abs URL helper for yelp.com — prefer URL navigation over typing.
Search: /search?find_desc={query}&find_loc={cityOrZip}&start={offset}
Sort (sortby=): recommended (default), rating_asc, rating_desc, review_count_desc, date_desc, distance_asc
Pagination: start={offset} (0-indexed by 10; page 2 = start=10)
Attribute filters (attrs=): comma-joined keys — RestaurantsTakeOut, RestaurantsDelivery, OpenNow, RestaurantsReservations, GoodForKids, OutdoorSeating, WheelchairAccessible, BusinessAcceptsCreditCards, BikeParking, DogsAllowed
Price filter: attrs=RestaurantsPriceRange2.{1|2|3|4} ($/$$/$$$/$$$$)
Hours filter: open_now=1 ; specific time: open_time={HHMM}
Direct business: /biz/{slug} (slug includes city, e.g. /biz/the-french-laundry-yountville)
User profile: /user_details?userid={userId}
`,
  },
  {
    // from data/sites/zillow.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?zillow.com" }),
    ],
    recipe: `abs URL helper for zillow.com — prefer URL navigation over typing.
Search by location (for sale): /homes/for_sale/{Location-State}/
Other listing types: /homes/for_rent/{Location-State}/ ; /homes/recently_sold/{Location-State}/
Location slug: "{City-State}" or "{City-State}_rb" (e.g., Seattle-WA, Seattle-WA_rb, Boston-MA, 98103). ZIP codes work bare.
In-path filters (append segments before the trailing slash):
  Beds: /{n}-_beds/ (min) or /{n}-{m}_beds/ (range) ; same shape for /{n}-_baths/
  Price: /{min}-{max}_price/ (USD; use 0 for unbounded; e.g. /500000-750000_price/)
  Home type: /houses/ /condos/ /apartments/ /townhomes/ /manufactured/ /lots/
  Days on Zillow: /1_days/ /7_days/ /14_days/ /30_days/ /90_days/ /6m_days/
  Has 3D tour: /3dtour_lt/ ; open houses only: /open_houses_lt/
  Pagination: /{n}_p/ (page n, 1-indexed)
Map / advanced filters: searchQueryState={url-encoded JSON} carries map bounds, filterState, regionSelection, isMapVisible. Prefer in-path filters for simple queries.
Direct property: /homedetails/{slug}/{zpid}_zpid/ (zpid is Zillow's numeric property id)
Agent / builder profile: /profile/{username}/
`,
  },
];
