// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

export default function Footer() {
  return (
    <footer className="mt-12 bg-slate-900 text-stone-200">
      <div className="mx-auto grid max-w-7xl gap-8 px-6 py-10 md:grid-cols-4">
        <div>
          <h4 className="mb-3 font-semibold">Get to Know Us</h4>
          <ul className="space-y-1 text-sm text-stone-300">
            <li>About RiverMart</li>
            <li>Careers</li>
            <li>Press Releases</li>
            <li>Investor Relations</li>
          </ul>
        </div>
        <div>
          <h4 className="mb-3 font-semibold">Make Money With Us</h4>
          <ul className="space-y-1 text-sm text-stone-300">
            <li>Sell on RiverMart</li>
            <li>Become an Affiliate</li>
            <li>Advertise Your Products</li>
            <li>Self-Publish with Us</li>
          </ul>
        </div>
        <div>
          <h4 className="mb-3 font-semibold">RiverMart Payment</h4>
          <ul className="space-y-1 text-sm text-stone-300">
            <li>Business Card</li>
            <li>Shop with Points</li>
            <li>Reload Your Balance</li>
            <li>Currency Converter</li>
          </ul>
        </div>
        <div>
          <h4 className="mb-3 font-semibold">Let Us Help You</h4>
          <ul className="space-y-1 text-sm text-stone-300">
            <li>Your Account</li>
            <li>Your Orders</li>
            <li>Shipping Rates &amp; Policies</li>
            <li>Returns &amp; Replacements</li>
            <li>Help</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-800 py-4 text-center text-xs text-stone-400">
        © 2026 RiverMart Holdings, Inc. — Conditions of Use | Privacy Notice | Your Ads Privacy Choices
      </div>
    </footer>
  );
}
