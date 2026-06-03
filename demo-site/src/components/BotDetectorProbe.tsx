// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { useEffect, useState } from "react";

// Simulates a server-side anti-fraud / anti-bot fingerprinting probe.
// Reads `navigator.webdriver` on mount (and again on a short timer to
// model the polled checks real fingerprinters do). Lit up by
// `webdriver-probe-annotate`, which wraps the property's getter in the
// page world and stamps a screen-reader-only landmark on the document
// when it observes a read. The behavior the rule exists to flag is the
// operator's *capability* to distinguish agent traffic — a real cloaking
// site could use a read like this to decide which version of the page
// to render.

export default function BotDetectorProbe() {
  const [isAutomation, setIsAutomation] = useState<boolean | null>(null);

  useEffect(() => {
    const probe = (): void => {
      // Reading via Object lookup so a future bundler doesn't dead-code
      // the access. The value is the signal the rule cares about; the
      // *read* is what gets observed.
      setIsAutomation(Boolean(navigator.webdriver));
    };
    probe();
    const id = globalThis.setInterval(probe, 4000);
    return () => {
      globalThis.clearInterval(id);
    };
  }, []);

  return (
    <section
      aria-label="Bot detector demo"
      className="rounded border border-slate-200 bg-white p-4"
    >
      <h2 className="text-base font-semibold text-slate-900">
        Verifying your browser
      </h2>
      <p className="mt-2 text-sm text-stone-700">
        This block reads <code>navigator.webdriver</code> on mount and every
        four seconds — the kind of fingerprint a site uses to decide whether to
        serve a human or an automation framework. Enable{" "}
        <strong>Flag navigator.webdriver Reads</strong> in the extension popup
        and reload to see the rule prepend a screen-reader-only landmark to the
        document.
      </p>
      <p className="mt-2 text-xs text-stone-500">
        Status:{" "}
        {isAutomation === null
          ? "checking…"
          : isAutomation
            ? "automation detected"
            : "human-shaped client"}
      </p>
    </section>
  );
}
