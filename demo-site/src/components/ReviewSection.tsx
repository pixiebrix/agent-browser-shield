// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import type { Review } from "../data/reviews";

interface ReviewSectionProps {
  reviews: Review[];
  averageRating: number;
  ratingCount: number;
}

function stars(n: number): string {
  return "★★★★★☆☆☆☆☆".slice(5 - Math.round(n), 10 - Math.round(n));
}

export default function ReviewSection({
  reviews,
  averageRating,
  ratingCount,
}: ReviewSectionProps) {
  return (
    <section
      id="reviewsMedley"
      className="rounded border border-stone-200 bg-white p-6"
    >
      <h2 className="text-xl font-semibold text-slate-900">Customer reviews</h2>
      <div className="mt-2 flex items-baseline gap-3 text-sm">
        <span className="text-yellow-500">{stars(averageRating)}</span>
        <span className="font-semibold">
          {averageRating.toFixed(1)} out of 5
        </span>
        <span className="text-stone-500">
          {ratingCount.toLocaleString()} global ratings
        </span>
      </div>
      <div className="mt-6 space-y-6">
        {reviews.map((review) => (
          <article
            key={`${review.author}-${review.date}-${review.title}`}
            itemScope
            itemType="https://schema.org/Review"
            className="border-t border-stone-200 pt-4"
            data-hook="review"
          >
            <header className="mb-1">
              <span className="font-semibold text-slate-900" itemProp="author">
                {review.author}
              </span>
            </header>
            <div className="text-sm text-yellow-500" itemProp="reviewRating">
              {stars(review.stars)}
              <span className="ml-2 font-semibold text-slate-900">
                {review.title}
              </span>
            </div>
            <div className="text-xs text-stone-500">
              Reviewed in the United States on{" "}
              <time itemProp="datePublished">{review.date}</time>
            </div>
            <p className="mt-2 text-sm text-stone-800" itemProp="reviewBody">
              {review.body}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
