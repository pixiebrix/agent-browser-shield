// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import AdSlot from "../components/AdSlot";
import AdvertorialCard from "../components/AdvertorialCard";
import CountdownBadge from "../components/CountdownBadge";
import ProductCard from "../components/ProductCard";
import { products } from "../data/products";

export default function Home() {
  const featured = products.slice(0, 3);
  const grid = products;

  return (
    <div className="space-y-8">
      <section
        aria-label="Spring Refresh Sale"
        className="overflow-hidden rounded bg-gradient-to-r from-slate-800 to-slate-700 p-8 text-stone-100"
      >
        <h1 className="text-3xl font-bold">Spring Refresh Sale</h1>
        <p className="mt-2 max-w-2xl text-stone-300">
          Up to 40% off home, kitchen, and electronics. Members get free 2-day
          shipping on every order.
        </p>
        <div className="mt-4">
          <CountdownBadge
            initialSeconds={3 * 3600 + 17 * 60 + 42}
            label="Sale ends in"
          />
        </div>
      </section>

      <AdSlot variant="banner" label="Sponsored" />

      <section aria-label="Today's deals">
        <h2 className="mb-3 text-xl font-semibold text-slate-900">
          Today&apos;s Deals
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((product, index) => (
            <ProductCard
              key={product.id}
              product={product}
              scarcity={
                index === 0
                  ? "Only 4 left in stock"
                  : index === 1
                    ? "Selling fast"
                    : "23 people are viewing this right now"
              }
            />
          ))}
        </div>
      </section>

      <aside
        id="div-gpt-ad-sidebar-1"
        aria-label="Sponsored offer"
        className="rounded border border-dashed border-amber-400 bg-amber-50 p-4 text-center text-sm text-stone-600"
        data-ad-slot="sidebar-1"
      >
        <div className="text-[10px] uppercase tracking-widest text-amber-700">
          Advertisement
        </div>
        <div className="mt-1">
          Refinance your mortgage with Mortimer Loans — rates from 5.99% APR
        </div>
      </aside>

      <section aria-label="Recommended for you">
        <h2 className="mb-3 text-xl font-semibold text-slate-900">
          Recommended for you
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {grid.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      <section aria-label="From our partners">
        <h2 className="mb-3 text-xl font-semibold text-slate-900">
          From Our Partners
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AdvertorialCard
            label="Sponsored"
            headline="Why this commuter e-bike is the upgrade your morning needs"
            body="Northwind's new urban e-bike combines a torque-sensing motor with a removable battery so you can charge it at your desk. Riders in city pilots report cutting their commute by 22 minutes on average."
            brand="Northwind Cycles"
          />
          <AdvertorialCard
            label="[Ad]"
            headline="The five-minute breakfast that's quietly taking over Brooklyn"
            body="Made with overnight oats, fresh stone fruit, and a single-origin cold brew, Vellichor's grab-and-go cups have a cult following in coffee shops from Greenpoint to Park Slope."
            brand="Vellichor Foods"
          />
          <AdvertorialCard
            label="Paid for and presented by Aperture Home"
            headline="Renovating a kitchen on a weekend timeline: it's possible"
            body="Aperture's modular cabinet system installs without a contractor, ships flat-packed, and includes a guided AR planner so you can confirm fit before the truck arrives."
            brand="Aperture Home"
          />
        </div>
      </section>

      <article
        aria-label="Editorial article — should remain visible"
        className="editorial-card rounded border border-stone-200 bg-white p-4"
      >
        <h2 className="text-base font-semibold text-slate-900">
          Local roads team takes silver in regional championship
        </h2>
        <p className="mt-2 text-sm text-stone-700">
          The Riverside cycling club placed second overall this weekend. The
          team is sponsored by Adidas this season under a three-year
          partnership, but the win was earned on the strength of a late-stage
          breakaway by junior rider Mia Chen.
        </p>
        <a
          href="https://example.com/news/riverside-silver"
          className="mt-2 inline-block text-sm font-medium text-orange-700 hover:text-orange-800"
        >
          Read the full recap
        </a>
      </article>
    </div>
  );
}
