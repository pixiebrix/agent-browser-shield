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
              4. Shipping & contact
            </h2>
            <form className="space-y-3 text-sm text-stone-700">
              {/* Hidden affiliate / UTM / promo metadata — exercises
                  hidden-affiliate-sanitize. The csrf_token must be
                  preserved; everything else is cleared. */}
              <input
                type="hidden"
                name="utm_source"
                defaultValue="email-newsletter"
              />
              <input
                type="hidden"
                name="utm_campaign"
                defaultValue="winter25"
              />
              <input type="hidden" name="aff_id" defaultValue="affsite-42" />
              <input type="hidden" name="coupon_code" defaultValue="SAVE10" />
              <input
                type="hidden"
                name="csrf_token"
                defaultValue="9f7d3c2a-CSRF"
              />
              <label className="block">
                <span className="block font-medium text-stone-800">
                  Marketing email
                </span>
                {/* `autocomplete="off"` so browsers don't paper over this
                    server-prefilled value; the rule should chip it. */}
                <input
                  type="email"
                  name="marketing_email"
                  autoComplete="off"
                  defaultValue="jordan@example.com"
                  className="mt-1 w-full rounded border border-stone-300 px-2 py-1"
                />
              </label>
              <label className="block">
                <span className="block font-medium text-stone-800">
                  SMS contact
                </span>
                <input
                  type="tel"
                  name="sms_contact"
                  autoComplete="off"
                  defaultValue="555-867-5309"
                  className="mt-1 w-full rounded border border-stone-300 px-2 py-1"
                />
              </label>
              <label className="block">
                <span className="block font-medium text-stone-800">
                  Shipping speed
                </span>
                {/* Default is the costliest option — annotate, don't reset. */}
                <select
                  name="shipping_speed"
                  defaultValue="overnight"
                  className="mt-1 w-full rounded border border-stone-300 px-2 py-1"
                >
                  <option value="standard">Standard — Free</option>
                  <option value="express">Express — $9.99</option>
                  <option value="overnight">Overnight — $24.99</option>
                </select>
              </label>
              <label className="block">
                <span className="block font-medium text-stone-800">
                  Shipping country
                </span>
                {/* Geo select — geo-IP defaults are legitimate, rule skips. */}
                <select
                  name="country"
                  defaultValue="US"
                  className="mt-1 w-full rounded border border-stone-300 px-2 py-1"
                >
                  <option value="US">United States</option>
                  <option value="CA">Canada</option>
                  <option value="MX">Mexico</option>
                </select>
              </label>
              <fieldset className="rounded border border-stone-200 p-2">
                <legend className="px-1 text-stone-800">Driver tip</legend>
                <label className="mr-3 inline-flex items-center gap-1">
                  <input type="radio" name="driver_tip" value="18" /> 18%
                </label>
                <label className="mr-3 inline-flex items-center gap-1">
                  <input type="radio" name="driver_tip" value="20" /> 20%
                </label>
                <label className="mr-3 inline-flex items-center gap-1">
                  <input
                    type="radio"
                    name="driver_tip"
                    value="22"
                    defaultChecked
                  />{" "}
                  22%
                </label>
                <label className="mr-3 inline-flex items-center gap-1">
                  <input type="radio" name="driver_tip" value="0" /> No tip
                </label>
              </fieldset>
            </form>
          </div>

          <div className="rounded border border-stone-200 bg-white p-6">
            <h2 className="mb-3 text-lg font-semibold text-slate-900">
              5. Final options
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
