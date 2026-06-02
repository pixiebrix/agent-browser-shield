// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

export default function Checkout() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Checkout</h1>

      <div className="grid gap-6 lg:grid-cols-[1fr,320px]">
        <div className="space-y-6">
          <div className="rounded border border-stone-200 bg-white p-6">
            <h2 className="mb-3 text-lg font-semibold text-slate-900">
              1. Shipping address
            </h2>
            <div className="text-sm text-stone-800">
              <div>Jordan Riley</div>
              <div>742 Evergreen Terrace</div>
              <div>Springfield, IL 62704</div>
              <div>United States</div>
              <div>Phone: (555) 123-4567</div>
            </div>
          </div>

          <div className="rounded border border-stone-200 bg-white p-6">
            <h2 className="mb-3 text-lg font-semibold text-slate-900">
              2. Payment method
            </h2>
            <div className="text-sm text-stone-800">
              <div>Visa ending in 1111</div>
              <div>Card number on file: 4111 1111 1111 1111</div>
              <div>Billing address: same as shipping</div>
            </div>
          </div>

          <div className="rounded border border-stone-200 bg-white p-6">
            <h2 className="mb-3 text-lg font-semibold text-slate-900">
              3. Tax information (for business orders)
            </h2>
            <div className="text-sm text-stone-800">
              <div>Tax ID / SSN on file: 123-45-6789</div>
              <div>Business contact: (555) 867-5309</div>
            </div>
          </div>

          <div className="rounded border border-stone-200 bg-white p-6">
            <h2 className="mb-3 text-lg font-semibold text-slate-900">
              4. Final options
            </h2>
            <div className="space-y-2 text-sm text-stone-700">
              <label className="flex items-start gap-2">
                <input type="checkbox" defaultChecked className="mt-0.5" />
                <span>
                  <strong>Save payment information for future purchases</strong>{" "}
                  — One-click checkout on your next order.
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input type="checkbox" defaultChecked className="mt-0.5" />
                <span>
                  <strong>Sign me up for the RiverMart Store Card</strong> —
                  Earn 5% back on every purchase. (Subject to credit approval.)
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input type="checkbox" defaultChecked className="mt-0.5" />
                <span>
                  Donate $1 to RiverMart&apos;s Hunger Relief Foundation.
                  Round-up applied to order total.
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input type="checkbox" defaultChecked className="mt-0.5" />
                <span>
                  Enroll in carbon-offset shipping (+$0.75). Helps offset the
                  carbon footprint of your delivery.
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-0.5" />
                <span>I have read and agree to the Terms of Service.</span>
              </label>
            </div>
          </div>
        </div>

        <div className="h-fit rounded border border-stone-200 bg-white p-4">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">
            Order summary
          </h2>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt>Items (6):</dt>
              <dd>$257.99</dd>
            </div>
            <div className="flex justify-between">
              <dt>Shipping &amp; handling:</dt>
              <dd>$0.00</dd>
            </div>
            <div className="flex justify-between">
              <dt>Promotion applied:</dt>
              <dd className="text-green-700">-$10.00</dd>
            </div>
            <div className="flex justify-between">
              <dt>Estimated tax:</dt>
              <dd>$21.28</dd>
            </div>
          </dl>
          <hr className="my-3 border-stone-200" />
          <div className="flex justify-between text-lg font-semibold text-red-700">
            <span>Order total:</span>
            <span>$269.27</span>
          </div>
          <button
            type="button"
            className="mt-4 w-full rounded-full bg-yellow-400 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-yellow-300"
          >
            Place your order
          </button>
          <p className="mt-3 text-xs text-stone-500">
            By placing your order, you agree to RiverMart&apos;s Conditions of
            Use.
          </p>
        </div>
      </div>
    </div>
  );
}
