// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { Link, NavLink } from "react-router-dom";

export default function Header() {
  return (
    <header className="bg-slate-900 text-stone-100">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <Link to="/" className="text-xl font-bold tracking-tight">
          <span className="text-orange-400">River</span>Mart
        </Link>
        <div className="flex flex-1 items-center">
          <select className="rounded-l-md border border-slate-700 bg-stone-200 px-2 py-2 text-sm text-slate-900">
            <option>All</option>
            <option>Electronics</option>
            <option>Kitchen</option>
            <option>Fitness</option>
            <option>Home Office</option>
          </select>
          <input
            type="search"
            placeholder="Search RiverMart"
            className="flex-1 border border-slate-700 bg-white px-3 py-2 text-sm text-slate-900"
          />
          <button
            type="button"
            className="rounded-r-md border border-orange-500 bg-orange-400 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-orange-300"
          >
            Search
          </button>
        </div>
        <NavLink to="/cart" className="text-sm hover:text-orange-300">
          Cart
        </NavLink>
      </div>
      <nav className="bg-slate-800 px-4 py-2 text-xs text-stone-200">
        <div className="mx-auto flex max-w-7xl gap-5">
          <span>Today&apos;s Deals</span>
          <span>Customer Service</span>
          <span>Gift Cards</span>
          <span>Sell on RiverMart</span>
        </div>
      </nav>
    </header>
  );
}
