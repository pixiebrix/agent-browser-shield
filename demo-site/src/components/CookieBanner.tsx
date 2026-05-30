// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { useState } from "react";

export default function CookieBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div
      id="onetrust-banner-sdk"
      role="dialog"
      aria-label="cookie consent"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-300 bg-white shadow-lg"
      style={{ position: "fixed" }}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-4 md:flex-row md:items-center md:justify-between">
        <div className="max-w-3xl text-sm text-stone-700">
          <strong className="block text-base text-slate-900">We value your privacy</strong>
          We and our 847 advertising partners store and access cookies on your device to
          personalize ads, measure ad performance, develop audience insights, and improve
          our products. By clicking "Accept All" you consent to this use of cookies. You
          can manage your preferences at any time in our Cookie Settings.
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="rounded border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:bg-stone-100"
          >
            Cookie Settings
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="rounded bg-orange-400 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-orange-300"
          >
            Accept All
          </button>
        </div>
      </div>
    </div>
  );
}
