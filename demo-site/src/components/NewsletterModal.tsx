// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { useEffect, useState } from "react";

export default function NewsletterModal() {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (dismissed) {
      return;
    }
    const id = setTimeout(() => setOpen(true), 6000);
    return () => clearTimeout(id);
  }, [dismissed]);

  if (!open || dismissed) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Newsletter signup"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      style={{ position: "fixed" }}
    >
      <div className="w-full max-w-lg rounded-lg bg-white p-8 shadow-2xl">
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="close"
          className="float-right text-2xl leading-none text-stone-500 hover:text-stone-800"
        >
          ×
        </button>
        <h2 className="mb-1 text-2xl font-bold text-slate-900">
          Don&apos;t miss our weekly deals
        </h2>
        <p className="mb-4 text-sm text-stone-600">
          Subscribe to the RiverMart newsletter and get 10% off your next order.
          Stay in the loop on flash sales, new arrivals, and members-only
          events.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setDismissed(true);
          }}
          className="flex gap-2"
        >
          <input
            type="email"
            required
            placeholder="you@example.com"
            className="flex-1 rounded border border-stone-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-400"
          >
            Sign up
          </button>
        </form>
        <p className="mt-3 text-xs text-stone-500">
          By signing up, you agree to receive marketing emails from RiverMart.
          You can unsubscribe at any time.
        </p>
      </div>
    </div>
  );
}
