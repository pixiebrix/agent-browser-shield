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
    // from data/sites/airbnb.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?airbnb.com", pathname: "/rooms/*" }),
    ],
    selectors: [
      "[data-section-id=\"REVIEWS_DEFAULT\"]",
    ],
  },
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
    // from data/sites/autotrader.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?autotrader.com", pathname: "/car-dealers/*/*/*" }),
    ],
    selectors: [
      "#kbb_reviews",
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
    // from data/sites/cars-com.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?cars.com", pathname: "/research/*/consumer-reviews/*" }),
      new URLPattern({ hostname: "{*.}?cars.com", pathname: "/dealers/*/reviews/*" }),
    ],
    selectors: [
      "#vehicle-reviews-section",
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
    // from data/sites/edmunds.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?edmunds.com", pathname: "/*/*/*/consumer-reviews*" }),
    ],
    selectors: [
      ".reviews-list",
    ],
  },
  {
    // from data/sites/expedia.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?expedia.com", pathname: "/*Hotel-Information*" }),
    ],
    selectors: [
      "#Reviews [data-stid=\"carousel-wrapper\"]",
    ],
  },
  {
    // from data/sites/glassdoor.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?glassdoor.com", pathname: "/Reviews/*" }),
      new URLPattern({ hostname: "{*.}?glassdoor.com", pathname: "/Overview/*" }),
    ],
    selectors: [
      "[data-test=\"review-detail\"]",
      "[data-test=\"review-highlight-text\"]",
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
    // from data/sites/hotels.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?hotels.com", pathname: "/ho*" }),
    ],
    selectors: [
      "#Reviews [data-stid=\"carousel-wrapper\"]",
    ],
  },
  {
    // from data/sites/imdb.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?imdb.com", pathname: "/title/*" }),
    ],
    selectors: [
      "[data-testid=\"UserReviews\"]",
    ],
  },
  {
    // from data/sites/indeed.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?indeed.com", pathname: "/cmp/*/reviews" }),
      new URLPattern({ hostname: "{*.}?indeed.com", pathname: "/cmp/*/reviews/*" }),
    ],
    selectors: [
      "[data-testid=\"reviewsList\"]",
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
    // from data/sites/metacritic.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?metacritic.com", pathname: "/game/*/user-reviews*" }),
      new URLPattern({ hostname: "{*.}?metacritic.com", pathname: "/movie/*/user-reviews*" }),
      new URLPattern({ hostname: "{*.}?metacritic.com", pathname: "/tv/*/user-reviews*" }),
      new URLPattern({ hostname: "{*.}?metacritic.com", pathname: "/music/*/user-reviews*" }),
    ],
    selectors: [
      ".c-reviews-container",
    ],
  },
  {
    // from data/sites/newegg.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?newegg.com", pathname: "/*/p/*" }),
    ],
    selectors: [
      ".tab-pane.updated_style",
    ],
  },
  {
    // from data/sites/opentable.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?opentable.com", pathname: "/r/*" }),
    ],
    selectors: [
      "#reviews",
      "[data-test=\"reviews-list\"]",
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
    // from data/sites/rottentomatoes.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?rottentomatoes.com", pathname: "/m/*" }),
      new URLPattern({ hostname: "{*.}?rottentomatoes.com", pathname: "/tv/*" }),
    ],
    selectors: [
      "[data-qa=\"section:audience-reviews\"]",
    ],
  },
  {
    // from data/sites/sephora.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?sephora.com", pathname: "/product/*" }),
    ],
    selectors: [
      "#ratings-reviews-container",
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
    // from data/sites/vrbo.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?vrbo.com" }),
    ],
    selectors: [
      "#Reviews [data-stid=\"carousel-wrapper\"]",
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
    // from data/sites/quora.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?quora.com" }),
    ],
    selectors: [
      "[class*=\"dom_annotate_question_answer_item_\"]",
      "[class*=\"dom_annotate_ad_promoted_answer\"]",
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
    // from data/sites/substack.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?substack.com", pathname: "/p/*" }),
    ],
    selectors: [
      ".comments-section",
    ],
  },
  {
    // from data/sites/theguardian.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?theguardian.com" }),
    ],
    selectors: [
      "#comments",
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
    // from data/sites/airbnb.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?airbnb.com" }),
    ],
    recipe: `abs URL helper for airbnb.com — prefer URL navigation over typing.
Stay search: /s/{Location-slug}/homes?checkin={YYYY-MM-DD}&checkout={YYYY-MM-DD}&adults={n}&children={n}&infants={n}&pets={n}
Location slug uses double-dash between location parts (e.g., /s/Paris--France/homes, /s/New-York--NY--United-States/homes, /s/Antibes--Provence-Alpes-Cote-d'Azur--France/homes). URL-encode spaces as \`-\`, commas as \`--\`.
Map-bounded search: &ne_lat=&ne_lng=&sw_lat=&sw_lng=&zoom={n}&search_by_map=true
Filters (query string): &price_min={USD}&price_max={USD}&min_bedrooms={n}&min_bathrooms={n}&min_beds={n}&room_types[]={Entire home/apt|Private room|Hotel room|Shared room}
Amenities (amenities[]= can repeat): 4 (wifi), 8 (kitchen), 5 (ac), 33 (washer), 34 (dryer), 25 (heating), 16 (pool), 7 (free parking on premises), 30 (smoking allowed), 12 (pets allowed). Probe live to confirm — Airbnb periodically reshuffles ids.
Categories (tab=): a category id (e.g., 5 = Beach, 8 = Amazing pools); also takes &category_tag={Tag:8} form.
Sort (s_tag=): default sort is relevance; explicit price ascending via &order_by=price_ascending (subject to drift).
Pagination: &items_offset={n} (multiples of 18, the default page size).
Direct listing: /rooms/{numericListingId} — single most reliable shape; query params (checkin/checkout/guests) preserved for pricing.
Experiences: /experiences/{id} ; experiences search: /s/experiences?query={location}.
Wishlists: /wishlists/{userId}/{wishlistSlug}-{id}.
`,
  },
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
    // from data/sites/apnews.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?apnews.com" }),
    ],
    recipe: `abs URL helper for apnews.com — prefer URL navigation over typing.
Search: /search?q={query}&s={sort}&p={page}
Sort (s=): 0 (Relevance, default), 3 (Newest), 2 (Oldest).
Pagination (p=): 1-indexed.
Section landing pages (no query): /politics, /us-news, /world-news, /business, /sports, /entertainment, /science, /technology, /health, /climate, /oddities. Sub-sections via additional slug (e.g. /world-news/europe, /business/inflation).
Hub pages (curated topic feeds): /hub/{slug} — many of these now 302-redirect to a section landing page (e.g. /hub/politics → /politics).
Direct article: /article/{slug-headline}-{32-hex-id} (e.g. /article/election-results-2024-abcdef0123456789abcdef0123456789).
Live blog / projects: /projects/, /live/{slug}.
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
    // from data/sites/autotrader.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?autotrader.com" }),
    ],
    recipe: `abs URL helper for autotrader.com — prefer URL navigation over typing.
Vehicle search (path form, preferred — server canonicalizes query-only forms onto this shape):
  /cars-for-sale/all-cars/{make-slug}/{model-slug}/{city-slug}-{ST}?zip={5-digit}
  E.g., /cars-for-sale/all-cars/honda/civic/austin-tx?zip=78701
  Drop /{model-slug} for make-wide search ; drop both for any-make in city.
  Listing type: /cars-for-sale/used-cars/... ; /cars-for-sale/new-cars/... ; /cars-for-sale/certified-cars/... (replaces /all-cars/).
Equivalent query form (legacy, accepted on input — Autotrader rewrites to the path form on redirect): /cars-for-sale/all-cars?makeCodeList={UPPERCASE-MAKE}&modelCodeList={UPPERCASE-MODEL}&zip={zip}&searchRadius={miles}
Filters (query string, append):
  Listing type (when not in path): &listingType=USED|NEW|CERTIFIED
  Price: &priceMin={USD}&priceMax={USD}
  Year: &startYear={yyyy}&endYear={yyyy}
  Mileage: &mileage={maxMiles}
  Body style: &vehicleStyleCodes={SEDAN|SUV|COUPE|HATCHBACK|PICKUP|WAGON|CONVERT|VAN|MINIVAN} (repeat for multi)
  Fuel: &fuelTypeGroup={G|H|E|D|F} (Gas/Hybrid/Electric/Diesel/Flex)
  Transmission: &transmissionCode={AUT|MAN|CVT}
  Drive type: &driveGroup={FWD|RWD|AWD4WD}
  Trim: &trimCodeList={MAKE|MODEL|TRIM} (e.g., HONDA|CIVIC|EX)
  Exterior color: &extColorSimple={BK|WH|SIL|RED|BLU|GRY|...}
  Seller: &dealType={PRIV|DEAL}
  Search radius: &searchRadius={miles|0} (0 = nationwide)
Sort (sortBy=): relevance (default), derivedpriceASC | derivedpriceDESC (price low/high), mileageASC, yearDESC, distanceASC, datelistedDESC (newest first).
Pagination: &firstRecord={offset}&numRecords={25|50|100} (offset is 0-indexed; pageSize default 25).
Direct VDP (vehicle detail): /cars-for-sale/vehicle/{listingId} — listingId is Autotrader's numeric id.
Dealer directory by city: /car-dealers/{city-slug}-{ST} (e.g., /car-dealers/austin-tx).
Dealer profile / reviews: /car-dealers/{city-slug}-{ST}/{dealerId}/{dealer-slug} (e.g., /car-dealers/austin-tx/72359/leif-johnson-ford).
Research pages: /research/{make-slug}/{model-slug}/{year}/ (e.g., /research/honda/civic/2024/).
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
    // from data/sites/bing.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?bing.com" }),
    ],
    recipe: `abs URL helper for bing.com — prefer URL navigation over typing.
Web search: /search?q={query}
Verticals (separate paths, same query param): /news/search?q={query}, /images/search?q={query}, /videos/search?q={query}, /maps?q={query}, /shop?q={query}
Pagination (web): &first={1-indexed offset, default 1; page 2 starts at 11 when count=10}; &count={resultsPerPage, default 10}
Market/region (mkt=): en-US, en-GB, en-CA, en-AU, de-DE, fr-FR, ja-JP, es-ES, etc. ({language}-{country})
Language (setlang=): en, de, fr, es, ja, zh-Hans, etc.
Safe search (safeSearch=): Off, Moderate, Strict
Time filter (qft=): +filterui:age-lt1440 (past day), +filterui:age-lt10080 (past week), +filterui:age-lt43200 (past month), +filterui:age-lt525600 (past year). URL-encode the leading \`+\` as \`%2B\`.
Custom date range (qft=): +filterui:age-custom_lt{YYYY-MM-DD}_gt{YYYY-MM-DD}
Site filter: append to q= — \`q={query}+site:{domain}\`
Direct file type / language operators in q=: \`filetype:pdf\`, \`language:en\`, \`intitle:\`, \`inurl:\`
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
    // from data/sites/brave-search.yaml
    patterns: [
      new URLPattern({ hostname: "search.brave.com" }),
    ],
    recipe: `abs URL helper for search.brave.com — prefer URL navigation over typing.
Web search: /search?q={query}
Verticals (separate paths, same query param): /news?q={query}, /images?q={query}, /videos?q={query}, /goggles?q={query}
Pagination (web): &offset={pageIndex} (0-indexed; page 2 = offset=1)
Country (country=): us, gb, ca, au, de, fr, jp, etc. (ISO two-letter)
Search language (search_lang=): en, de, fr, ja, es, etc.
UI language (ui_lang=): {language}-{country} e.g. en-US, de-DE
Safe search (safesearch=): off, moderate, strict
Time filter (tf=): pd (past day), pw (past week), pm (past month), py (past year), {YYYY-MM-DDtoYYYY-MM-DD} (custom)
Site filter / operators in q=: \`site:{domain}\`, \`filetype:pdf\`, \`intitle:\`, \`inurl:\`, prefix \`-\` to exclude
Goggles (re-rankers, no login required to use): &goggles_id={publicGoggleUrlOrId} appended to /search
AI Answer: anonymous users get summarizer cards inline on /search; no separate URL
`,
  },
  {
    // from data/sites/cars-com.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?cars.com" }),
    ],
    recipe: `abs URL helper for cars.com — prefer URL navigation over typing.
Vehicle search (used/new/cpo): /shopping/results/?stock_type={used|new|cpo}&makes[]={make-slug}&models[]={make-model-slug}&zip={5-digit}&maximum_distance={miles|all}
makes[]/models[] are slug-form (e.g., makes[]=honda&models[]=honda-civic). Multiple repeat the param. \`maximum_distance=all\` removes the radius cap; numeric values are miles.
Filters (query string, append):
  Price: &list_price_min={USD}&list_price_max={USD}
  Year: &year_min={yyyy}&year_max={yyyy}
  Mileage: &mileage_max={miles}
  Body style: &body_style_slugs[]={sedan|suv|coupe|hatchback|truck|wagon|convertible|van|minivan}
  Fuel: &fuel_slugs[]={gasoline|hybrid|electric|diesel|plug-in-hybrid|hydrogen}
  Transmission: &transmission_slugs[]={automatic|manual|cvt}
  Drivetrain: &drivetrain_slugs[]={fwd|rwd|awd|4wd}
  Trim: &trim_slugs[]={trim-slug}
  Exterior color: &exterior_color_slugs[]={black|white|silver|red|blue|gray|...}
  Features (multi): &feature_slugs[]={apple-carplay|android-auto|sunroof-moonroof|backup-camera|leather-seats|heated-seats|navigation-system|third-row-seating}
  Seller: &seller_type[]={dealership|private}
  Listing freshness: &days_on_market_max={1|3|7|14|30}
  Photos required: &photo_only=true
Sort (sort=): best_match_desc (default), list_price (low→high) or list_price_desc, mileage (low→high), year_desc, distance, listed_at_desc (newest first).
Pagination: &page={n} (1-indexed) ; page size via &page_size={20|50|100}.
Direct VDP (vehicle detail): /vehicledetail/{listingId}/ — listingId is cars.com's numeric id.
Research / specs / pricing: /research/{make-model}/ ; year-specific: /research/{make-model-{year}}/ (e.g., /research/honda-civic-2024/).
Consumer reviews: /research/{make-model-{year}}/consumer-reviews/.
Dealer profile / reviews: /dealers/{ST}/{city-slug}/{dealer-slug}-{dealerId}/ ; reviews tab: /dealers/{ST}/{city-slug}/{dealer-slug}-{dealerId}/reviews/.
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
    // from data/sites/edmunds.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?edmunds.com" }),
    ],
    recipe: `abs URL helper for edmunds.com — prefer URL navigation over typing.
Inventory search (used/new/cpo): /inventory/srp.html?make={make-slug}&model={model-slug}&zip={5-digit}&radius={miles}
  Listing condition: &inventoryType={used|new|used-cpo} (omit for both)
  Trim: &trim={trim-slug}
  Year: &year={yyyy} ; range: &year[]={yyyy}&year[]={yyyy} (multi)
  Price: &priceRange[]={min}&priceRange[]={max} ; or &maxPrice={USD}
  Mileage: &mileage={maxMiles}
  Body style: &bodyType={sedan|suv|coupe|hatchback|pickup|wagon|convertible|van|minivan} (repeat for multi)
  Fuel: &fuelType={gas|hybrid|electric|diesel|flex-fuel|plug-in-hybrid}
  Transmission: &transmission={automatic|manual|cvt}
  Drivetrain: &drivetrain={fwd|rwd|awd|4wd}
  Color: &color={black|white|silver|red|blue|gray|...}
  Features: &features[]={apple-carplay|android-auto|sunroof|backup-camera|leather-seats|heated-seats|navigation|third-row-seating}
  Seller: &sellerType={dealer|fsbo}
Sort (sort=): bestmatch (default), priceasc | pricedesc, mileageasc, yeardesc, distance, listdatedesc (newest first).
Pagination: &pagenumber={n} (1-indexed) ; &pagesize={20|50|100}.
Direct VDP (vehicle detail): /inventory/vin.html?vin={VIN}&radius=200 (lookup by VIN) ; from SRP cards: /{make}/{model}/{year}/vin/{17-char-VIN}/ (canonical permalink).
Research / specs / pricing: /{make}/{model}/{year}/ (e.g., /honda/civic/2024/). Drop year for all-years overview.
Editorial Edmunds review: /{make}/{model}/{year}/review/ — written by Edmunds editors (not UGC).
Consumer (owner) reviews: /{make}/{model}/{year}/consumer-reviews/ — UGC; the page also exposes &style={style-slug} and &aspect={performance|comfort|interior|reliability|safety|technology|value} filters.
True Market Value / appraisal: /appraisal/ ; new-car deals: /best-deals/.
Dealership pages: /dealerships/{ST}/{city-slug}/{dealer-slug}/ (informational).
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
    // from data/sites/expedia.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?expedia.com" }),
    ],
    recipe: `abs URL helper for expedia.com — prefer URL navigation over typing.
Hotels search: /Hotel-Search?destination={location}&startDate={YYYY-MM-DD}&endDate={YYYY-MM-DD}&adults={n}&children={ages|empty}&rooms={n}
Children: &children=2:5,8 means two children aged 5 and 8 (comma-separated ages); &rooms=1 ; &rm1=a2:c5,c8 also accepted as the older per-room shape.
Filters (Hotel-Search query): &star={3,4,5} ; &price={min}-{max} (per night, USD) ; &amenities={POOL,FREE_WIFI,RESTAURANT_IN_HOTEL,SPA,GYM,PARKING_FREE} ; &lodging={HOTEL,VACATION_RENTAL,CONDO,HOSTEL,APARTMENT,VILLA} ; &neighborhood={regionId} ; &chain={CHAIN_NAME} ; &reviewScore={7,8,9} (minimum guest score).
Sort (sort=): RECOMMENDED, PRICE_LOW_TO_HIGH, PRICE_HIGH_TO_LOW, DISTANCE, REVIEW, PROPERTY_CLASS.
Pagination: &p={pageIndex} (0-indexed). Top-N picks per page is server-controlled.
Direct hotel: /{Slug}.h{hotelId}.Hotel-Information (e.g., /Paris-Hotels-La-Maison-Favart.h2521440.Hotel-Information). Slug is hyphenated, no diacritics. \`chkin\`/\`chkout\` query params preserve pricing context.
Flights search: /Flights-Search?leg1=from:{origin},to:{dest},departure:{YYYY-MM-DD}TANYT&leg2=from:{dest},to:{origin},departure:{YYYY-MM-DD}TANYT&passengers=adults:{n},children:{n},seniors:{n},infantinlap:N&trip=roundtrip&mode=search
One-way flights: same but trip=oneway and only leg1.
Cars search: /Cars-Search?date1={M/D/YYYY}&time1={HHMM}&date2={M/D/YYYY}&time2={HHMM}&loc1={origin}&loc2={dropoff}
Packages (Bundle and Save): /Flights-Hotel-Search?flightAttributes=…&hotelAttributes=… (best constructed via the UI; the URL state is brittle).
Things to do / activities: /things-to-do/search?location={location}&startDate={YYYY-MM-DD}&endDate={YYYY-MM-DD}
Destination guides: /{Slug}.dx{destinationId}.Destination-Travel-Guides (read-only browsing).
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
    // from data/sites/glassdoor.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?glassdoor.com" }),
    ],
    recipe: `abs URL helper for glassdoor.com — prefer URL navigation over typing.
Free-text search (companies/jobs/salaries blended): /Search/results.htm?keyword={query}
Employer reviews: /Reviews/{Slug}-Reviews-E{employerId}.htm (e.g., /Reviews/Google-Reviews-E9079.htm). Slug is hyphenated company name; employerId is Glassdoor's numeric "E" id (visible in URLs after the first lookup via /Search).
Employer overview / salaries / interviews / benefits (same E-id): /Overview/Working-at-{Slug}-EI_IE{employerId}.htm ; /Salary/{Slug}-Salaries-E{employerId}.htm ; /Interview/{Slug}-Interview-Questions-E{employerId}.htm ; /Benefits/{Slug}-Benefits-E{employerId}.htm
Jobs search (simple form, will redirect to slug-URL):
  /Job/jobs.htm?sc.keyword={query}&locKeyword={cityOrZip}&locT={locType}&locId={locId}
  locT values: C (city), N (country), S (state). locId is Glassdoor's numeric id for that location.
  Best practice: do one /Search/results.htm lookup to discover locId, then construct the canonical jobs URL.
Review filters on /Reviews/ pages (query string, comma-joined where applicable):
  filter.iso3Language={en|es|fr|de|...} ; filter.employmentStatus=REGULAR,PART_TIME,INTERN,CONTRACT,FREELANCE
  filter.jobTitleFTS={title text} ; filter.defaultLocation={City, ST}
  sort.sortType={DATE|RELEVANCE|RATING_OVERALL_HIGH_TO_LOW|RATING_OVERALL_LOW_TO_HIGH} ; sort.ascending=false
Pagination: append _P{n}.htm before query string on slug URLs (e.g., -Reviews-E9079_P2.htm).
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
    // from data/sites/google-search.yaml
    patterns: [
      new URLPattern({ hostname: "www.google.com", pathname: "/search" }),
    ],
    recipe: `abs URL helper for google.com/search — prefer URL navigation over typing.
Web search: /search?q={query}
Verticals (tbm=): isch (images), vid (videos), nws (news), shop (shopping), bks (books). Maps and Flights live at /maps and /travel/flights (separate entries).
Pagination: &start={offset} (0-indexed, multiples of 10). Page 2 = start=10.
Time filter (tbs=qdr:): qdr:h (past hour), qdr:d (24h), qdr:w (week), qdr:m (month), qdr:y (year). Custom range: tbs=cdr:1,cd_min:{M/D/YYYY},cd_max:{M/D/YYYY}.
Sort (tbs=): li:1 (verbatim/no auto-fixes), sbd:1 (sort by date — pair with qdr: for "recent first").
Language / region: hl={lang ISO} (UI language), lr=lang_{lang} (results language), gl={countryISO2} (country bias), cr=country{countryISO2} (restrict to country).
Safe search (safe=): active, off (default depends on account/region).
Result count: num={1-100}. Google often ignores num>10 on modern result pages — treat as best-effort.
In-query operators (append to q=): \`site:{domain}\`, \`-site:{domain}\`, \`intitle:\`, \`inurl:\`, \`filetype:pdf\`, \`before:{YYYY-MM-DD}\`, \`after:{YYYY-MM-DD}\`, exact phrase in quotes, \`OR\`, \`|\`.
Knowledge / direct lookups: q={query} alone surfaces knowledge panel, definition, calculator, weather, currency conversion — no special path needed.
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
    // from data/sites/hotels.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?hotels.com" }),
    ],
    recipe: `abs URL helper for hotels.com — prefer URL navigation over typing.
Hotels search: /Hotel-Search?destination={location}&startDate={YYYY-MM-DD}&endDate={YYYY-MM-DD}&adults={n}&rooms={n}
Hotels.com normalizes the destination and assigns &regionId={id} on the resolved URL — capture it from the redirect and reuse for follow-up queries to skip ambiguity.
Children: append &children={ages-comma-list} (e.g., &children=5,8 for two kids aged 5 and 8). Per-room legacy form \`&rm1=a2:c5,c8\` is also accepted.
Sort (sort=): RECOMMENDED, PRICE_LOW_TO_HIGH, PRICE_HIGH_TO_LOW, DISTANCE, REVIEW, PROPERTY_CLASS.
Filters: &star={3,4,5} ; &price={min}-{max} (per night, USD; Hotels.com sometimes splits into repeated &price= params on redirect — both shapes work on the inbound URL); &amenities={POOL,FREE_WIFI,RESTAURANT_IN_HOTEL,SPA,GYM,PARKING_FREE} ; &lodging={HOTEL,VACATION_RENTAL,CONDO,HOSTEL,APARTMENT,VILLA} ; &neighborhood={regionId} ; &reviewScore={7,8,9} (minimum guest score).
Pagination: &p={pageIndex} (0-indexed).
Direct property: /ho{propertyId}/{slug}/ (e.g., /ho170687/la-maison-favart-paris-france/). The Hotels.com propertyId is distinct from Expedia's; do not reuse Expedia ids here. \`chkin\`/\`chkout\` query params preserve pricing context (also accepted as \`startDate\`/\`endDate\`).
Things to do / activities: /things-to-do/search?location={location}&startDate={YYYY-MM-DD}&endDate={YYYY-MM-DD}
Rewards (Hotels.com One Key): append &useRewards=true to apply rewards pricing.
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
    // from data/sites/imdb.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?imdb.com" }),
    ],
    recipe: `abs URL helper for imdb.com — prefer URL navigation over typing.
Free-text search (all categories): /find/?q={query}&s={tt|nm|co|kw|ch} (titles, names, companies, keywords, characters)
Direct lookup: /title/{ttId} (movie/TV), /name/{nmId} (person), /company/{coId}
Title detail subpages: /title/{ttId}/reviews/ (user reviews — review list is sign-in-walled for anonymous), /title/{ttId}/fullcredits/, /title/{ttId}/plotsummary/, /title/{ttId}/parentalguide/, /title/{ttId}/awards/, /title/{ttId}/news/
Advanced title search: /search/title/?title={query}&title_type={feature|tv_series|tv_movie|short|documentary}&release_date={YYYY-MM-DD,YYYY-MM-DD}&user_rating={low,high}&genres={action,drama,...}&countries={us,gb,...}&languages={en,...}&sort={moviemeter,asc|user_rating,desc|release_date,desc|num_votes,desc|alpha,asc|runtime,asc}&count={50|100|250}&start={1-indexed offset}
Advanced name search: /search/name/?name={query}&birth_date={YYYY-MM-DD,YYYY-MM-DD}&death_date={YYYY-MM-DD,YYYY-MM-DD}&gender={male|female|non_binary}&sort={starmeter,asc|birth_date,desc}
Charts (no query): /chart/top/ (top 250), /chart/moviemeter/, /chart/tvmeter/, /chart/boxoffice/
`,
  },
  {
    // from data/sites/indeed.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?indeed.com" }),
    ],
    recipe: `abs URL helper for indeed.com — prefer URL navigation over typing.
Job search: /jobs?q={query}&l={locationOrZip}&start={offset}
Pagination (start=): 0-indexed by 10 (page 2 = start=10).
Sort (sort=): relevance (default), date.
Date posted (fromage=): 1, 3, 7, 14 (days ago).
Job type (jt=): fulltime, parttime, contract, temporary, internship.
Radius (radius=): miles around the location (default 25; 0 means exact location).
Salary estimate (salary=): "$70,000" style — URL-encode the dollar sign and comma.
Remote (sc=): 0kf%3Aattr(DSQF7)%7C (remote-only filter; built from \`attr(...)\` opaque ids that Indeed surfaces on filter pills).
Company pages: /cmp/{Company-Name} (Pascal-cased slug, hyphen-separated for multi-word names; e.g. /cmp/Google, /cmp/Stripe-Inc, /cmp/Pwc).
Company subtabs: /cmp/{Company}/reviews, /cmp/{Company}/jobs, /cmp/{Company}/salaries, /cmp/{Company}/benefits, /cmp/{Company}/faq, /cmp/{Company}/about, /cmp/{Company}/locations.
Review list sort/filter (review page): &fcountry=US&floc={city}&ftopic={wlbalance|paybenefits|jobsecadv|mgmt|culture}&fjobtitle={role}&sort=helpful (default) or sort=date.
Direct job: /viewjob?jk={16-hex-jobKey}
Salary explorer: /career/{role-slug}/salaries, /career/{role-slug}/salaries/{city}
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
    // from data/sites/medium.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?medium.com" }),
    ],
    recipe: `abs URL helper for medium.com — prefer URL navigation over typing.
Free-text search: /search?q={query}
Vertical search: /search/posts?q={query} (stories) ; /search/people?q={query} (writers) ; /search/publications?q={query} ; /search/tags?q={query} ; /search/lists?q={query}
Tag feed: /tag/{slug} (e.g., /tag/programming, /tag/machine-learning) — slug is lowercased, hyphenated.
Tag verticals: /tag/{slug}/recommended ; /tag/{slug}/archive/{YYYY}/{MM}/{DD}
User profile / story index: /@{username} ; /@{username}/about ; /@{username}/lists ; /@{username}/followers
User-subdomain profile (newer scheme, equivalent to /@{username}): https://{username}.medium.com/
Direct story: /@{username}/{slug}-{12-hex-id} or https://{username}.medium.com/{slug}-{12-hex-id} ; trailing hex id alone resolves: medium.com/p/{12-hex-id}
Publication: /{publication-slug} (top-level path with no @) ; archive: /{publication-slug}/archive/{YYYY}/{MM}/{DD}
Reading list: /@{username}/list/{listSlug}-{8-hex-id}
Friend link (bypass member paywall for one read): append ?sk={token} to a story URL — only works if the author or a member shared it; do not fabricate tokens.
`,
  },
  {
    // from data/sites/metacritic.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?metacritic.com" }),
    ],
    recipe: `abs URL helper for metacritic.com — prefer URL navigation over typing.
Free-text search: /search/{query}/ (trailing slash matters; URL-encode spaces as %20).
Vertical search (filter by content type): /search/{query}/?category={game|movie|tv|music} (also accepts &page={n}).
Browse listings (preferred for ranked/filterable discovery):
  Games: /browse/game/{platform|all}/{genre|all}/{releaseDateFilter}/{sortKey}/?platform={platform}
    platforms: all, ps5, ps4, xbox-series-x, xbox-one, switch, nintendo-switch-2, pc, ios, android, stadia
    releaseDateFilter: all-time, current-year, last-year, last-90-days, last-30-days, last-7-days, coming-soon
    sortKey: new (most recent first), score (highest critic score), userscore, name-asc, name-desc, release-date
    E.g., /browse/game/ps5/all/all-time/score/?platform=ps5
  Movies: /browse/movie/{genre|all}/{year|all}/{sortKey}/
  TV: /browse/tv/{genre|all}/{year|all}/{sortKey}/
  Music: /browse/album/{genre|all}/{year|all}/{sortKey}/
Coming-soon games: /browse/game/?releaseType=coming-soon
Direct title pages: /{game|movie|tv|music}/{slug}/ (e.g., /game/the-legend-of-zelda-breath-of-the-wild/).
Critic reviews subpage: /{game|movie|tv|music}/{slug}/critic-reviews/ — editorial, not UGC.
User reviews subpage: /{game|movie|tv|music}/{slug}/user-reviews/ — UGC.
Platform-scoped game subpage: /game/{slug}/?platform={platform} (separates scores per platform on multi-platform games).
Pagination on browse/user-reviews: append ?page={n} (1-indexed). On user-reviews pages, &filterBy={positive|mixed|negative} narrows the sentiment.
`,
  },
  {
    // from data/sites/newegg.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?newegg.com" }),
    ],
    recipe: `abs URL helper for newegg.com — prefer URL navigation over typing.
Keyword search: /p/pl?d={query} (URL-encode spaces; Newegg's search lands on /p/pl which is the product-listing handler).
Combined keyword + category: /p/pl?d={query}&N={categoryId}
Direct category browse: /p/pl?N={categoryId} (categoryId is Newegg's numeric \`N=\` token; multiple categories can be combined as space-separated values, e.g. \`N=100006519%204016\`).
Filters: most filters are appended as space-separated values to the \`N=\` param (each facet has its own numeric id Newegg's search rewrites into the same param). For typed query refinement use:
  Price: &LeftPriceRange={min}+{max} (note: \`+\` between min/max, not a hyphen) ; or use the per-category &PriceRange={min}+{max}.
  Order (sort): &Order={3|BESTMATCH|FEATURED|REVIEWS|PRICE|PRICEDESC|RATING|LAUNCHDATE} (3 = best match default; PRICE is ascending; PRICEDESC is descending; REVIEWS sorts by review count; RATING sorts by avg rating).
  Page size: &PageSize={36|60|96} (default 36).
  In stock only: &Tid=12108 (Newegg uses Tid for the in-stock toggle).
  Free shipping: &Tid=12107
  Combo/bundle deals: &Tid=12109
Pagination: &page={n} (1-indexed).
Direct PDP (product detail): two equivalent URL shapes exist for the same item:
  /{kebab-slug}/p/{itemNumber} — e.g., /samsung-1tb-990-pro-w-heatsink-normal-package-nvme-2-0/p/N82E16820147862 (preferred canonical form)
  /{kebab-slug}/p/{marketplaceItemNumber} — e.g., /SAMSUNG-1TB-990-PRO-w-Heatsink/p/9SIBFJRJYT9873 (Newegg Marketplace seller listings, redirect to the canonical N82E… id where one exists)
itemNumber starts with \`N82E…\` (Newegg-fulfilled) or \`9SI…\` (Marketplace). Preserve the slug for SEO; the path can be hand-built from any itemNumber but Newegg will normalize.
Reviews-only deep link: append \`#scrollFullInfo\` to the PDP URL to scroll the product-detail tab into view; the reviews tab requires a JS click (no stable URL fragment for the reviews pane alone).
Combo deals: /Combo.aspx (deprecated public path, may redirect) ; current home is /tnt/today (Today's Best Deals).
Newegg Business (B2B): /BusinessSection (separate experience, similar URL contract).
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
    // from data/sites/npr.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?npr.org" }),
    ],
    recipe: `abs URL helper for npr.org — prefer URL navigation over typing.
Search: /search/?query={query}&page={page}
Pagination (page=): 1-indexed.
Sort (sort=): relevance (default), date.
Date filter (dateRange=): today, past+7+days, past+30+days, past+90+days, past+year, all (default). URL-encode the \`+\` as \`%20\` or \`+\`.
Program filter (programName=): "Morning Edition", "All Things Considered", "Weekend Edition Sunday", "Weekend Edition Saturday", "Fresh Air", "Talk of the Nation", etc. URL-encode spaces.
Section / topic landing pages (no query): /sections/news/, /sections/politics/, /sections/business/, /sections/health/, /sections/science/, /sections/world/, /sections/national/, /sections/climate/, /sections/technology/, /sections/education/, /sections/arts/, /sections/music/, /sections/books/, /sections/pop-culture/. NPR podcast pages live at /podcasts/{podcastId}/{slug}/.
Direct article: /{YYYY}/{MM}/{DD}/{nprStoryId}/{slug} (e.g. /2024/05/30/1198765432/ai-news).
Author page: /people/{personId}/{first-last}.
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
    // from data/sites/openstreetmap.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?openstreetmap.org" }),
    ],
    recipe: `abs URL helper for openstreetmap.org — prefer URL navigation over typing.
Geocode search (Nominatim-backed): /search?query={freeText} — site auto-pans to the first match and appends \`#map={zoom}/{lat}/{lon}\` to the URL.
Map view (no query): /#map={zoom}/{lat}/{lon} ; layers via &layers={M|C|T|H|O|N} (M Mapnik default, C Cycle, T Transport, H Humanitarian, O OpenTopo, N Notes overlay).
Direct element URLs: /node/{id}, /way/{id}, /relation/{id} (each has /history and /full subpaths). Edit URL: /edit?{node|way|relation}={id}.
Directions: /directions?engine={engine}&route={lat1},{lon1};{lat2},{lon2} where {engine} = fossgis_osrm_car, fossgis_osrm_bike, fossgis_osrm_foot, graphhopper_car, graphhopper_bike, graphhopper_foot, fossgis_valhalla_car.
User pages: /user/{username}, /user/{username}/notes, /user/{username}/traces, /user/{username}/history.
Changeset: /changeset/{id}. Note: /note/{id}.
Raw Nominatim API (separate host, no key, polite-use rate limit): https://nominatim.openstreetmap.org/search?q={query}&format={jsonv2|geojson|xml}&limit={n}&countrycodes={iso2list}&addressdetails=1 ; reverse: https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lon}&format=jsonv2.
Tiles (separate host): https://tile.openstreetmap.org/{z}/{x}/{y}.png.
`,
  },
  {
    // from data/sites/opentable.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?opentable.com" }),
    ],
    recipe: `abs URL helper for opentable.com — prefer URL navigation over typing.
Search: /s?term={query}&dateTime={YYYY-MM-DDTHH:MM}&covers={n}&metroId={metroId}
Free-text geo search (no metroId): /s?term={query}&covers={n}&dateTime={YYYY-MM-DDTHH:MM}&prices=2&latitude={lat}&longitude={lng}
metroId discovery: hit /s?term={cityName} once and read \`metroId\` from the resolved URL — OpenTable assigns numeric ids per metro (e.g., 8 = New York metro).
Pagination: &page={n} (1-indexed); page size is server-controlled.
Sort (sortBy=): web_conversion (default mixed-relevance), distance, rating, price_low_to_high, price_high_to_low, name, recommended, newest.
Filters: &cuisineIds={id}[,{id}…] ; &priceRanges={1|2|3|4} (1=$ to 4=$$$$) ; &neighborhoodIds={id} ; &restrictTo={open|all} ; &diningStyles={CasualDining|FineDining|Cafe|...} ; &features={Outdoor|GoodForGroups|...}
Map mode: &showMap=true&boundsLat1=&boundsLng1=&boundsLat2=&boundsLng2= (NE/SW corners).
Direct restaurant: /r/{slug} (slug includes city, e.g., /r/nobu-downtown-new-york). Reviews anchor: /r/{slug}#reviews. Menu: /r/{slug}/menu. Photos: /r/{slug}/photos. Private dining: /r/{slug}/private-dining.
Reservation flow (numeric rid): /restref/client/?rid={restaurantId}&restref={ref}&datetime={YYYY-MM-DDTHH:MM}&covers={n} — restaurantId is OpenTable's internal numeric id, surfaced on the /r/ page's booking widget.
Cities / metros browse: /cities/{city-slug} ; /neighborhoods/{slug} ; /cuisine/{slug} (e.g., /cuisine/japanese).
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
    // from data/sites/realtor.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?realtor.com" }),
    ],
    recipe: `abs URL helper for realtor.com — prefer URL navigation over typing.
City listings (for sale): /realestateandhomes-search/{City-Name}_{ST} (e.g., /realestateandhomes-search/Austin_TX)
ZIP listings: /realestateandhomes-search/{zip} (e.g., /realestateandhomes-search/78701)
County listings: /realestateandhomes-search/{County-Name}-County_{ST}
Neighborhood listings: /realestateandhomes-search/{Neighborhood-Name}_{City-Name}_{ST}
In-path filters (comma- or slash-joined under the area path; multi-value filters take precedence over query params):
  Price: /price-na-{max} ; /price-{min}-{max} ; /price-{min}-na ; suffixes: k (thousands), M (millions). Use \`na\` for unbounded.
  Beds/baths: /beds-{n} (n+ minimum) ; /baths-{n}
  Property type: /type-single-family-home ; /type-condo-townhome-row-home-co-op ; /type-multi-family-home-farm ; /type-mfd-mobile-home ; /type-land
  Sqft: /sqft-{min}-{max}
  Lot size: /lot-{min}-{max}-acres
  Year built: /built-{min}-{max}
  Days on market: /dom-{1|3|7|14|30}
  New construction: /new-construction
  Open houses: /show-open-house-only
  Price reduced: /show-recently-reduced
  Pending/contingent: /show-hide-pending-contingent (hides pending) ; /show-pending-only
  Sort: /sort-newest ; /sort-price-high ; /sort-price-low ; /sort-largest-sqft ; /sort-price-reduced-date ; /sort-sqft (largest first)
Pagination: /pg-{n} (1-indexed) appended after filter segments.
Rentals (for rent): /apartments/{City-Name}_{ST} (e.g., /apartments/Austin_TX) — filter syntax mirrors for-sale (price-/beds-/baths-/type-/sort-).
Recently sold: /realestateandhomes-detail/.../sold (per property) ; market view: /realestateandhomes-search/{City-Name}_{ST}/show-recently-sold
Direct property: /realestateandhomes-detail/{Street-Address}_{City-Name}_{ST}_{zip}_{propertyId} (e.g., /realestateandhomes-detail/5321-Del-Dios-Way_Austin_TX_78738_M81608-96049). propertyId is Realtor.com's \`M{prefix}-{suffix}\` id; do not invent ids — discover via the city search SRP.
Agent profile / reviews: /realestateagents/{agent-slug}_{agentId} (city directory: /realestateagents/{city-st})
School pages (read-only neighborhood research): /local/schools/{ST}/{City-Name}/{School-Name}_{schoolId}
`,
  },
  {
    // from data/sites/redfin.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?redfin.com" }),
    ],
    recipe: `abs URL helper for redfin.com — prefer URL navigation over typing.
City listings (for sale): /city/{cityId}/{ST}/{City-Name}
ZIP listings: /zipcode/{zip}
Neighborhood listings: /neighborhood/{neighborhoodId}/{ST}/{City-Name}/{Neighborhood-Name}
County listings: /county/{countyId}/{ST}/{County-Name}-County
School-zone listings: /school/{schoolId}/{ST}/{City-Name}/{School-Name}
cityId / neighborhoodId / countyId / schoolId discovery: hit /stingray/do/location-autocomplete?location={query}&v=2 (returns JSON with each candidate's \`id\` and \`url_path\`). Or do one /city URL guess and read the canonical id from the redirected URL.
Rentals: /city/{cityId}/{ST}/{City-Name}/apartments-for-rent ; /zipcode/{zip}/apartments-for-rent
Recently sold: /city/{cityId}/{ST}/{City-Name}/recently-sold
Open houses: /city/{cityId}/{ST}/{City-Name}/open-houses
In-path filters (comma-joined under /filter/): /filter/min-price={value},max-price={value},min-beds={n},max-beds={n},min-baths={n},property-type={house|condo|townhouse|multifamily|land|other},status={active|coming-soon|under-contract},min-sqft={n},max-sqft={n},min-year-built={yyyy},max-year-built={yyyy},min-lot-size={n},max-lot-size={n},has-3d-tour,has-view,fireplace,pool,is-furnished,hoa={max-USD-monthly},days-on-market={1|3|7|14|30}
  Price/lot/sqft suffixes: k (thousands), M (millions). E.g., min-price=500k,max-price=1M.
  Sort: /filter/...,sort={lo-days|hi-days|lo-price|hi-price|hi-sale-date|lo-dollarsqft|hi-dollarsqft}
Pagination: append \`/page-{n}\` after the /filter/… segment (e.g., /city/30794/TX/Dallas/filter/min-price=500k/page-2). 1-indexed.
Map-bound search (alternative to /city): /map-search?north={lat}&south={lat}&east={lng}&west={lng}&min-price=…
Direct property: /{ST}/{City-Name}/{Street-Addr}-{zip}/home/{propertyId} (e.g., /TX/Dallas/3624-Normandy-Ave-75205/home/32091629). propertyId is Redfin's numeric id.
Agent profile: /real-estate-agents/{agent-slug}-{agentId}
Mortgage / payment helper: append \`?mortgage-rate={pct}&down-payment={USD}\` to any property URL to seed the payment calculator.
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
    // from data/sites/reuters.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?reuters.com" }),
    ],
    recipe: `abs URL helper for reuters.com — prefer URL navigation over typing.
Search: /site-search/?query={query}&offset={offset}
Pagination (offset=): 0-indexed by 20 (page 2 = offset=20).
Sort (sort=): newest, oldest, relevance (default).
Date filter (date=): past_24h, past_week, past_month, past_year, any_time (default). Custom range: from={YYYY-MM-DD}&to={YYYY-MM-DD}.
Section filter (section=): world, business, markets, technology, sustainability, legal, sports, lifestyle, etc.
Section landing pages (no query): /world/, /business/, /markets/, /technology/, /sustainability/, /legal/, /sports/, /lifestyle/. Sub-sections via additional slug, e.g. /world/europe/, /markets/currencies/, /business/finance/, /technology/artificial-intelligence/.
Direct article: /{section}/{slug}-{YYYY-MM-DD}/ (kebab-cased slug; date suffix is part of the canonical URL).
Author pages: /authors/{first-last}/
`,
  },
  {
    // from data/sites/rottentomatoes.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?rottentomatoes.com" }),
    ],
    recipe: `abs URL helper for rottentomatoes.com — prefer URL navigation over typing.
Search: /search?search={query}
Direct lookup: /m/{slug} (movies), /tv/{slug} (TV series), /tv/{slug}/s{NN} (season), /tv/{slug}/s{NN}/e{NN} (episode), /celebrity/{slug} (person)
Slugs use lowercase letters, digits, and underscores (e.g. /m/shawshank_redemption, /tv/breaking_bad).
Reviews subpages: /m/{slug}/reviews (critics), /m/{slug}/reviews?type=user (audience), /m/{slug}/reviews?type=top_critics
Curated browse pages (no query): /browse/movies_in_theaters/, /browse/movies_at_home/, /browse/tv_series_browse/, /top/bestofrt/ (annual best lists)
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
    // from data/sites/sephora.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?sephora.com" }),
    ],
    recipe: `abs URL helper for sephora.com — prefer URL navigation over typing.
Keyword search: /search?keyword={query} (Sephora canonicalizes some queries to category pages on redirect — capture the resolved URL).
Category browse (preferred when applicable, has richer filters): /shop/{category-slug} (e.g., /shop/lipstick, /shop/moisturizers, /shop/foundation, /shop/perfume, /shop/shampoo, /shop/mens, /shop/tools-brushes-makeup, /shop/mini-size, /shop/sephora-collection-makeup).
Filters (query string, append; multi-value filters repeat the param):
  Brand: &brand={Brand+Name} (URL-encode spaces as +) or &brand_facet={brandSlug}
  Price tier: &price={under-25|25-50|50-100|over-100} (semantic buckets) or &priceRange={min}-{max}
  Rating: &rating={4-and-up|3-and-up}
  Skin/Hair: &skinType={normal|dry|oily|combination|sensitive} ; &skinConcerns={acne|aging|darkSpots|dullness|pores|redness|dryness} ; &hairType={straight|wavy|curly|coily} ; &hairConcerns={frizz|damage|dandruff|thinning|colorTreated}
  Formulation: &formulation={cream|gel|liquid|powder|stick|spray|oil}
  Coverage: &coverage={sheer|light|medium|full}
  Finish: &finish={matte|satin|dewy|natural|shimmer}
  Free of: &freeOf={parabens|sulfates|phthalates|fragrance|silicones|mineralOil}
  Best for: &bestFor={anti-aging|brightening|hydration|sensitive-skin}
  New arrivals: &isNew=true ; Exclusive: &exclusive=true ; Online only: &onlineOnly=true ; Limited Edition: &limitedEdition=true
Sort (sortBy=): BEST_SELLING (default), TRENDING, NEW_PRODUCTS, TOP_RATED, PRICE_LOW_TO_HIGH, PRICE_HIGH_TO_LOW, NAME_AZ.
Pagination: &currentPage={n} (1-indexed) ; &pageSize={60|120|180} (caps around 300).
Direct product (PDP): /product/{kebab-slug}-P{productId} (e.g., /product/mac-cosmetics-m-a-cximal-silky-matte-lipstick-P510799). productId is the \`P{6-digit}\` token; preserve it. SKU-specific deep link: append ?skuId={skuId} to land on a particular shade/size.
Brand page: /brand/{brand-slug} (e.g., /brand/fenty-beauty).
Reviews-only deep link is not supported as a separate URL — reviews mount inside the PDP.
Store locator (read-only): /happening/stores ; specific store: /happening/stores/{slug}.
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
    // from data/sites/steam.yaml
    patterns: [
      new URLPattern({ hostname: "store.steampowered.com" }),
    ],
    recipe: `abs URL helper for store.steampowered.com — prefer URL navigation over typing.
Keyword search: /search/?term={query} (URL-encode spaces; Steam preserves the raw term in the URL).
Filters (query string, append; multi-value tag filters use & or comma — both accepted):
  Price (USD cents): &maxprice={cents} ; presets accepted: &maxprice=free|5|10|15|20|25|30|35|40|45|50 (the integer values are the USD price tier, not cents).
  Free to play: &maxprice=free or &category2=11
  On sale / specials: &specials=1
  Show DLC alongside games: &ignore_preferences=1 (otherwise excluded by default).
  OS: &os={win|mac|linux} (repeatable). Steam Deck Verified: &deck_compatibility=3 ; Playable: &deck_compatibility=2.
  Controller support: &category2=28 (Full Controller Support).
  VR: &vrsupport=101 (HTC Vive) ; 102 (Oculus Rift) ; 104 (Valve Index) ; 401 (Windows MR).
  Multiplayer / co-op: &category1=998 ; Online PvP: &category2=49 ; Co-op: &category2=9 ; LAN Co-op: &category2=48.
  Language interface (UI): &supportedlang={english|french|spanish|german|japanese|schinese|tchinese|koreana|russian|...} (Steam's language code).
  Tags: &tags={tagId1},{tagId2},… (tag ids are Steam's numeric ids; discover via the storesearch API or by reading a category page URL).
  Genre: &category1={26 = Adventure | 25 = Action | 23 = Indie | 28 = Simulation | 9 = RPG | 18 = Sports | 2 = Strategy} (rough mapping; Steam blurs genre and "Type" under category1).
  Reviews / rating: &review_score={6|7|8|9} (minimum positive %: 6=70%, 7=80%, 8=85%, 9=90%) and &review_type={positive|mixed|negative|all}.
  Release date: &category1={998} (Coming Soon) ; &untagged_yes=1 (hide tags) ; &hidef2p=1 (hide F2P).
Sort (sort_by=): _ASC (default, "relevance") ; Released_DESC (newest first) ; Price_ASC | Price_DESC ; Reviews_DESC (best reviewed) ; Name_ASC.
Pagination: &start={offset}&count={pageSize} (offset is 0-indexed; pageSize default 25, caps near 50).
Direct PDP (app page): /app/{appId}/{Url_Slug}/ — e.g., /app/1145360/Hades/. The \`Url_Slug\` portion is informational; /app/{appId}/ alone redirects to the canonical slug. Append \`?snr=\` to preserve referral context (Steam adds it on outbound links).
Bundle: /bundle/{bundleId}/{slug}/ ; DLC list: /app/{appId}/{slug}/#app_reviews_hash (hash anchors are JS-only; treat them as scroll targets, not deep links).
Top sellers / new releases / specials: /search/?category1=998&filter={topsellers|newreleases|specials|comingsoon}.
Wishlist (requires sign-in): /wishlist/profiles/{steamId64}/
Curator pages (curated editorial recommendations, not UGC reviews): /curator/{curatorId}-{slug}/
`,
  },
  {
    // from data/sites/substack.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?substack.com" }),
    ],
    recipe: `abs URL helper for substack.com — prefer URL navigation over typing.
Free-text search (central index): /search/{query} (URL-encode spaces; trailing slash optional).
Search within a publication: https://{publication-slug}.substack.com/search?query={query} (per-publication; vanity-domain publications use https://{custom-domain}/search?query={query}).
Discover / Notes feed: /discover ; /notes ; /home (signed-in feed).
Direct post (canonical): /p/{post-slug} on the publication host (e.g., https://noahpinion.substack.com/p/the-way-we-treat-pigs-is-a-sin or https://www.noahpinion.blog/p/the-way-we-treat-pigs-is-a-sin). Substack accepts the same \`/p/{slug}\` path on the central host as well, but redirects to the publication's host.
Comments subpage for a post: /p/{post-slug}/comments (UGC; the same DOM contract as the post page).
Cross-post / restack: /p/{post-slug}?utm_source=publication-search&utm_medium=email — utm tags are informational and may appear on resolved URLs.
Publication home: https://{publication-slug}.substack.com/ (also: subdirectories /archive, /podcast, /people, /about).
Author profile (on central host): /@{username}
Section archive: https://{publication-slug}.substack.com/s/{section-slug} (sub-feed within a publication, e.g., interviews, audio).
Podcast RSS: https://{publication-slug}.substack.com/feed (Atom/JSON variants also exposed at /feed.json and /feed.rss).
Paywall: posts marked "paid" return a truncated body to anonymous fetches. A friend link (\`?token={uuid}\`) sometimes unlocks one read — only works if the author shared it; do not fabricate tokens.
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
    // from data/sites/vrbo.yaml
    patterns: [
      new URLPattern({ hostname: "{*.}?vrbo.com" }),
    ],
    recipe: `abs URL helper for vrbo.com — prefer URL navigation over typing.
Property search: /search?destination={location}&startDate={YYYY-MM-DD}&endDate={YYYY-MM-DD}&adults={n}
Vrbo normalizes the destination and assigns &regionId={id} on the resolved URL — capture it from the redirect and reuse to skip ambiguity. Resolved URL also gains &destType={MARKET|CITY|NEIGHBORHOOD} and &latLong={lat}%2C{lng}.
Children: append &children={ages-comma-list} (e.g., &children=5,8). Pets: &petIncluded=true.
Sort (sort=): RECOMMENDED, PRICE_LOW_TO_HIGH, PRICE_HIGH_TO_LOW, REVIEW, DISTANCE.
Filters: &price={min}-{max} (per night, USD) ; &bedrooms={n} ; &bathrooms={n} ; &sleeps={n} ; &amenities={POOL,HOT_TUB,KITCHEN,WIFI,PARKING_FREE,AIR_CONDITIONING,WASHING_MACHINE,PET_FRIENDLY} ; &propertyTypes={HOUSE,APARTMENT,CONDO,VILLA,CABIN,COTTAGE,BUNGALOW,CHALET}.
Pagination: &p={pageIndex} (0-indexed).
Direct property (three equivalent shapes seen in the wild):
  /{propertyId} (e.g., /4975035) — legacy numeric id
  /{propertyId}ha (e.g., /3720511ha) — legacy with \`ha\` suffix
  /pdp/lo/{listingId} (e.g., /pdp/lo/102228252) — newer PDP path
\`chkin\`/\`chkout\` (or \`startDate\`/\`endDate\`) on the URL preserve pricing context. \`expediaPropertyId\` may appear on resolved links — it is Vrbo's internal mapping back to the Expedia Group property id and is informational.
Rewards (Vrbo One Key): append &useRewards=true to apply rewards pricing.
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
      new URLPattern({ hostname: "www.weather.gov" }),
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
    // from data/sites/yahoo-finance.yaml
    patterns: [
      new URLPattern({ hostname: "finance.yahoo.com" }),
    ],
    recipe: `abs URL helper for finance.yahoo.com — prefer URL navigation over typing.
Symbol lookup: /lookup?s={query} (returns equities, ETFs, mutual funds, indices, futures, options, currencies, crypto matching the query)
Filtered lookup: /lookup/{kind}?s={query} where {kind} = equity, mutualfund, etf, index, future, currency, cryptocurrency
Quote pages: /quote/{TICKER}/ (e.g. /quote/AAPL/, /quote/BTC-USD/, /quote/^GSPC/ for S&P 500)
Quote subtabs (replace trailing slug): /quote/{TICKER}/{tab}/ where {tab} = chart, history, profile, financials, balance-sheet, cash-flow, analysis, options, holders, sustainability, community (forum), news, key-statistics
Historical prices: /quote/{TICKER}/history?period1={unixSeconds}&period2={unixSeconds}&frequency={1d|1wk|1mo}
Options chain: /quote/{TICKER}/options?date={unixSecondsExpiry}
Sector / industry pages: /sectors/, /sectors/{slug}/, /screener/predefined/{screenerSlug} (e.g. day_gainers, most_actives, undervalued_growth_stocks)
News search: /topic/{slug}/ for curated feeds (e.g. /topic/stock-market-news/, /topic/crypto/, /topic/earnings/). Site-wide news listing: /news/.
Calendar pages: /calendar/earnings?day={YYYY-MM-DD}, /calendar/economic?day={YYYY-MM-DD}, /calendar/ipo?day={YYYY-MM-DD}, /calendar/splits?day={YYYY-MM-DD}.
Currency cross: /quote/{FROM}{TO}=X/ (e.g. EURUSD=X). Crypto: /quote/{COIN}-{QUOTE}/ (e.g. BTC-USD).
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
