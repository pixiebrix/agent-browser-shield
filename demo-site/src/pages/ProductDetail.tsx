// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { Link, useParams } from "react-router-dom";
import CountdownBadge from "../components/CountdownBadge";
import ReviewSection from "../components/ReviewSection";
import ScarcityBadge from "../components/ScarcityBadge";
import SocialEmbed from "../components/SocialEmbed";
import { INJECTIONS } from "../data/injection-fixtures";
import { getProduct } from "../data/products";
import { getReviews } from "../data/reviews";

// React strips JSX comment children at build time, so an `<!-- ... -->` literal
// would never reach the DOM. We need real HTML comments here so html-comment-strip
// has something to remove — dangerouslySetInnerHTML is the only way to ship them
// through React. The "untrusted" content is a static literal from our own fixture
// file, not user input.
function HtmlCommentInjection() {
  return (
    <span
      // biome-ignore lint/security/noDangerouslySetInnerHtml: demo fixture for the html-comment-strip rule; static content from injection-fixtures.ts, no user input
      dangerouslySetInnerHTML={{
        __html: INJECTIONS.PRODUCT_DETAIL_HTML_COMMENT,
      }}
    />
  );
}

export default function ProductDetail() {
  const { id } = useParams();
  const product = id ? getProduct(id) : undefined;
  const reviews = id ? getReviews(id) : [];

  if (!product) {
    return (
      <div className="rounded bg-white p-6">
        <h1 className="text-xl font-semibold">Product not found</h1>
        <Link to="/" className="text-orange-700 hover:underline">
          Back to home
        </Link>
      </div>
    );
  }

  const discountPct = product.listPrice
    ? Math.round(
        ((product.listPrice - product.price) / product.listPrice) * 100,
      )
    : 0;

  // Real schema.org/Product structured data — the kind a browser-use agent
  // pulls in as a "trusted summary" of the page. The description field is
  // poisoned with an instruction-shaped payload; price / sku /
  // aggregateRating are valid. json-ld-sanitize blanks the description and
  // leaves everything else intact.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: INJECTIONS.PRODUCT_DETAIL_JSON_LD_DESCRIPTION,
    brand: { "@type": "Brand", name: product.brand },
    sku: product.id,
    offers: {
      "@type": "Offer",
      price: product.price,
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: product.rating,
      reviewCount: product.ratingCount,
    },
  };

  return (
    <div className="space-y-8">
      {/*
        React 19 hoists <title> and <meta> renders to <head>. The values
        are poisoned: an agent summarizing the page via document.title or
        og:description / twitter:description reads instruction-shaped
        text the human never sees in the page body. meta-injection-strip
        clears the title text and removes the matched meta elements.
      */}
      <title>{INJECTIONS.PRODUCT_DETAIL_TITLE}</title>
      <meta
        name="description"
        content={INJECTIONS.PRODUCT_DETAIL_META_DESCRIPTION}
      />
      <meta
        property="og:description"
        content={INJECTIONS.PRODUCT_DETAIL_META_DESCRIPTION}
      />
      <meta
        name="twitter:description"
        content={INJECTIONS.PRODUCT_DETAIL_META_DESCRIPTION}
      />

      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: demo fixture for json-ld-sanitize — static content from injection-fixtures.ts, no user input
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav aria-label="Breadcrumb" className="text-xs text-stone-500">
        <Link to="/">RiverMart</Link> &rsaquo; {product.category} &rsaquo;{" "}
        <span className="text-stone-700">{product.title}</span>
      </nav>

      <HtmlCommentInjection />

      {/*
        Fallback markup rendered only when JavaScript is disabled — never
        seen by a sighted user of this SPA. Still present in the DOM and
        readable by an agent walking textContent / the a11y tree. The
        payload nudges the agent to opt into the cart add-ons that
        cart-addon-flag annotates on the next page. The noscript-strip
        rule removes the wrapper element outright.
      */}
      <noscript>{INJECTIONS.PRODUCT_DETAIL_NOSCRIPT}</noscript>

      {/*
        Zero-contrast comparison-shopping nudge. Invisible to humans (white
        text on white background + 1px font), but reads as plain text from
        the DOM / a11y tree that an agent traverses. Disparages on-site
        competitors and impersonates an "agent-verified" authority.
      */}
      <div
        data-hook="hidden-comparison-nudge"
        aria-hidden="false"
        style={{
          color: "#ffffff",
          backgroundColor: "#ffffff",
          fontSize: "1px",
          lineHeight: "1px",
          userSelect: "none",
        }}
      >
        {INJECTIONS.PRODUCT_DETAIL_HIDDEN_NUDGE}
      </div>

      <article className="grid gap-8 md:grid-cols-2">
        <div>
          {/*
            Poisoned alt attribute — sighted users see the photo; agents
            walking the a11y tree pull instruction-shaped text the page
            operator never has to render. attr-injection-scrub removes
            the attribute when it matches the injection pattern set.
          */}
          <img
            src={product.image}
            alt={INJECTIONS.PRODUCT_DETAIL_IMAGE_ALT}
            className="mx-auto max-h-80 w-auto rounded border border-stone-200 bg-white object-contain"
          />
        </div>

        <div className="space-y-3">
          <h1 className="text-2xl font-semibold text-slate-900">
            {product.title}
          </h1>
          <div className="text-sm text-orange-700 hover:underline">
            Visit the {product.brand} Store
          </div>
          <div className="text-sm">
            <span className="text-yellow-500">★★★★☆</span>{" "}
            <span className="font-semibold">{product.rating}</span>{" "}
            <span className="text-stone-500">
              ({product.ratingCount.toLocaleString()} ratings)
            </span>
          </div>

          <hr className="border-stone-200" />

          <div className="flex items-baseline gap-3">
            {product.listPrice && (
              <span className="rounded bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
                -{discountPct}%
              </span>
            )}
            <span className="text-3xl text-red-700">
              ${product.price.toFixed(2)}
            </span>
            {product.listPrice && (
              <span className="text-sm text-stone-500">
                List Price:{" "}
                <span className="line-through">
                  ${product.listPrice.toFixed(2)}
                </span>
              </span>
            )}
          </div>

          <CountdownBadge initialSeconds={2 * 3600 + 14 * 60 + 8} />

          <div className="flex flex-wrap gap-2 pt-2">
            <ScarcityBadge text="Only 2 left in stock — order soon" />
            <ScarcityBadge
              text="12 people are viewing this right now"
              tone="info"
            />
            <ScarcityBadge text="Selling fast" />
          </div>

          <hr className="border-stone-200" />

          <div className="text-sm text-green-700">FREE delivery Wednesday</div>
          <div className="text-sm font-semibold text-green-800">In Stock</div>

          {/*
            Poisoned aria-label — sighted users see "Add to Cart"; the
            accessible name an agent uses contains an instruction
            instead. attr-injection-scrub strips the attribute on match.
          */}
          <button
            type="button"
            aria-label={INJECTIONS.PRODUCT_DETAIL_ADD_TO_CART_ARIA}
            className="mt-2 w-full rounded-full bg-yellow-400 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-yellow-300"
          >
            Add to Cart
          </button>
          <Link
            to="/checkout"
            className="block w-full rounded-full bg-orange-500 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-orange-400"
          >
            Buy Now
          </Link>

          <div className="border-t border-stone-200 pt-3 text-xs text-stone-600">
            <div>Ships from RiverMart</div>
            <div>Sold by RiverMart Direct</div>
            <div>Returns: 30-day return policy</div>
          </div>
        </div>
      </article>

      <section aria-label="About this item">
        <h2 className="mb-2 text-lg font-semibold text-slate-900">
          About this item
        </h2>
        <div className="max-w-3xl space-y-2 text-sm text-stone-800">
          <p>
            {product.description}{" "}
            <span style={{ color: "#ffffff", backgroundColor: "#ffffff" }}>
              {INJECTIONS.PRODUCT_DETAIL_HIDDEN_SYSTEM}
            </span>
          </p>
          <p
            className="text-xs italic"
            style={{
              color: "#f5f5f4",
              backgroundColor: "#f5f5f4",
              textShadow: "none",
            }}
          >
            {INJECTIONS.PRODUCT_DETAIL_CHATML_LINE_1}
            <br />
            {INJECTIONS.PRODUCT_DETAIL_CHATML_LINE_2}
            <br />
            {INJECTIONS.PRODUCT_DETAIL_CHATML_LINE_3}
          </p>
          <ul className="list-disc space-y-1 pl-5">
            {product.bulletPoints.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-label="From the manufacturer">
        <h2 className="mb-2 text-lg font-semibold text-slate-900">
          From the manufacturer
        </h2>
        <p className="max-w-3xl text-sm text-stone-700">
          Watch the launch video to see what makes the {product.title}{" "}
          different.
        </p>
        <SocialEmbed
          videoId="dQw4w9WgXcQ"
          title={`${product.title} demo video`}
        />
      </section>

      <ReviewSection
        reviews={reviews}
        averageRating={product.rating}
        ratingCount={product.ratingCount}
      />
    </div>
  );
}
