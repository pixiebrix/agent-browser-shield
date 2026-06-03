// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Native advertorial fixture for demoing the `disguised-ad-flag` rule.
// Renders an article-shaped card (heading + image + body prose + read-more
// link) with a visible disclosure label, deliberately *without* the
// network-level markers (`adsbygoogle`, `data-ad-slot`) that `ads-hide`
// would catch. The whole point of the rule is to handle these
// publisher-rendered advertorials that EasyList can't see.

interface AdvertorialCardProps {
  // Label text rendered above the headline. Provide the exact phrasing
  // (case included) so the demo exercises each detection branch:
  //   - "Sponsored"                          standalone form
  //   - "[Ad]"                                bracket form
  //   - "Paid for and presented by <brand>"  suffix form
  label: string;
  headline: string;
  body: string;
  brand: string;
}

export default function AdvertorialCard({
  label,
  headline,
  body,
  brand,
}: AdvertorialCardProps) {
  return (
    <article className="advertorial-card flex flex-col rounded border border-stone-200 bg-white p-4">
      <span className="mb-1 inline-block w-fit text-[10px] font-semibold uppercase tracking-wider text-stone-500">
        {label}
      </span>
      <h3 className="text-base font-semibold text-slate-900">{headline}</h3>
      <img
        src="https://placehold.co/600x320/eef2f7/64748b?text=Article+Hero"
        alt=""
        loading="lazy"
        className="mt-2 aspect-[16/9] w-full rounded object-cover"
      />
      <p className="mt-2 text-sm text-stone-700">{body}</p>
      <a
        href={`https://example.com/partner/${encodeURIComponent(brand)}`}
        className="mt-2 text-sm font-medium text-orange-700 hover:text-orange-800"
      >
        Read more from {brand}
      </a>
    </article>
  );
}
