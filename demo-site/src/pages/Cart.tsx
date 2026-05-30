// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { Link } from "react-router-dom";
import { products } from "../data/products";
import ScarcityBadge from "../components/ScarcityBadge";

interface LineItem {
  title: string;
  detail?: string;
  price: number;
  quantity: number;
  sneaky?: boolean;
  image?: string;
}

const lines: LineItem[] = [
  {
    title: products[0].title,
    detail: "Color: Charcoal",
    price: products[0].price,
    quantity: 1,
    image: products[0].image,
  },
  {
    title: "Allstate 2-Year Protection Plan",
    detail: "Accidental damage, drops, and spills",
    price: 24.99,
    quantity: 1,
    sneaky: true,
  },
  {
    title: products[3].title,
    detail: "Band size: M/L",
    price: products[3].price,
    quantity: 1,
    image: products[3].image,
  },
  {
    title: "Shipping Protection by Route",
    detail: "Covers lost, stolen, or damaged packages in transit",
    price: 3.45,
    quantity: 1,
    sneaky: true,
  },
  {
    title: "Gift wrapping",
    detail: "Premium recyclable kraft paper, ribbon, and gift tag",
    price: 4.99,
    quantity: 1,
    sneaky: true,
  },
  {
    title: "Round-up donation to Hunger Relief",
    detail: "Round your order total up to the nearest dollar",
    price: 0.57,
    quantity: 1,
    sneaky: true,
  },
];

const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);

export default function Cart() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Shopping Cart</h1>

      <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
        <ScarcityBadge
          text="5 other people have this in their cart — checkout soon to avoid losing items"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr,300px]">
        <div className="rounded border border-stone-200 bg-white">
          <ul>
            {lines.map((line, idx) => (
              <li
                key={idx}
                className="flex gap-4 border-b border-stone-200 px-4 py-4 last:border-b-0"
              >
                {line.image ? (
                  <img
                    src={line.image}
                    alt=""
                    className="h-20 w-20 rounded object-cover"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded bg-stone-100 text-2xl text-stone-400">
                    +
                  </div>
                )}
                <div className="flex-1">
                  <div className="font-medium text-slate-900">{line.title}</div>
                  {line.detail && (
                    <div className="text-xs text-stone-600">{line.detail}</div>
                  )}
                  <div className="mt-1 text-xs text-green-700">In Stock</div>
                  <div className="mt-2 flex gap-3 text-xs text-orange-700">
                    <button type="button" className="hover:underline">
                      Delete
                    </button>
                    <button type="button" className="hover:underline">
                      Save for later
                    </button>
                  </div>
                </div>
                <div className="text-right font-semibold text-slate-900">
                  ${(line.price * line.quantity).toFixed(2)}
                </div>
              </li>
            ))}
          </ul>

          <div className="space-y-2 border-t border-stone-200 bg-stone-50 px-4 py-4">
            <label className="flex items-start gap-2 text-sm text-stone-700">
              <input type="checkbox" defaultChecked className="mt-0.5" />
              <span>
                <strong>Add gift wrap</strong> (+$4.99) — Make this order feel like a
                gift.
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-stone-700">
              <input type="checkbox" defaultChecked className="mt-0.5" />
              <span>
                <strong>Add 2-year protection</strong> (+$12.00) — Covers accidental
                damage and mechanical failure.
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-stone-700">
              <input type="checkbox" defaultChecked className="mt-0.5" />
              <span>
                Subscribe to RiverMart deals emails — Get exclusive deals and 10% off
                your next order.
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-stone-700">
              <input type="checkbox" className="mt-0.5" />
              <span>I have read and agree to the Terms of Service.</span>
            </label>
          </div>
        </div>

        <aside className="rounded border border-stone-200 bg-white p-4">
          <div className="flex justify-between text-sm">
            <span>Subtotal ({lines.length} items):</span>
            <span className="font-semibold">${subtotal.toFixed(2)}</span>
          </div>
          <div className="mt-1 flex justify-between text-sm">
            <span>Estimated tax:</span>
            <span>${(subtotal * 0.0825).toFixed(2)}</span>
          </div>
          <hr className="my-3 border-stone-200" />
          <div className="flex justify-between text-lg font-semibold text-red-700">
            <span>Order total:</span>
            <span>${(subtotal * 1.0825).toFixed(2)}</span>
          </div>
          <Link
            to="/checkout"
            className="mt-4 block w-full rounded-full bg-yellow-400 px-4 py-2 text-center text-sm font-semibold text-slate-900 hover:bg-yellow-300"
          >
            Proceed to checkout
          </Link>
        </aside>
      </div>
    </div>
  );
}
