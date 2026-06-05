// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { useEffect, useRef } from "react";
import { INJECTIONS } from "../data/injection-fixtures";

// Mounts third-party-style widget markup INSIDE an open shadow root so
// reviewers can confirm the extension's rules see past the shadow
// boundary. Without the shadow-aware subtree watcher every rule would
// be light-DOM only — chat widget, ad slot, and any other marker
// rendered here would survive untouched.
//
// The shadow contents intentionally use the same vendor ids/classes the
// matching rules already target in the light tree (`#intercom-frame`,
// `ins.adsbygoogle`) so the demo doesn't depend on any per-shadow
// special-casing in the rules themselves — only on the dispatcher
// actually reaching the content. The injection paragraph exercises
// the Tier 2 shadow-piercing text walker (prompt-injection-redact /
// pii-redact / secrets-redact). The EasyList-style class on the
// second card exercises the Tier 3 adopted-stylesheet path: that
// class only matches via the EasyList generic CSS sheet, which now
// adopts into open shadow roots so the hide applies here too.
//
// A second host below mounts a custom element with a CLOSED shadow root
// to exercise `closed-shadow-root-annotate`. By spec the rules cannot
// see inside; the heuristic only confirms it's there.

const CLOSED_TAG = "abs-closed-widget";

if (typeof customElements !== "undefined" && !customElements.get(CLOSED_TAG)) {
  customElements.define(
    CLOSED_TAG,
    class extends HTMLElement {
      constructor() {
        super();
        const shadow = this.attachShadow({ mode: "closed" });
        const inner = document.createElement("div");
        inner.style.cssText =
          "padding:6px 10px;border:1px solid #7c3aed;background:#f5f3ff;color:#4c1d95;font:13px system-ui;border-radius:4px;";
        inner.textContent =
          "Closed-shadow widget — contents are invisible to ABS by spec.";
        shadow.append(inner);
      }
    },
  );
}

export default function ShadowDomEmbed() {
  const hostRef = useRef<HTMLDivElement>(null);
  const closedHostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || host.shadowRoot) {
      return;
    }
    const shadow = host.attachShadow({ mode: "open" });

    // Match chat-widget-hide's `#intercom-frame` selector. The rule
    // hides the wrapper outright when found in the light tree; with the
    // shadow-aware watcher it should reach this one too.
    const chat = document.createElement("div");
    chat.id = "intercom-frame";
    chat.style.cssText =
      "display:inline-block;margin-right:8px;padding:6px 10px;border:1px solid #2563eb;background:#eff6ff;color:#1e3a8a;border-radius:4px;font:13px system-ui;";
    chat.textContent = "Live chat — open to talk to support";
    shadow.append(chat);

    // Match ads-hide's `ins.adsbygoogle` selector. EasyList's CSS-only
    // path can't reach shadow trees, but the curated-selector path goes
    // through the watcher dispatch and should hide this one.
    const ad = document.createElement("ins");
    ad.className = "adsbygoogle";
    ad.setAttribute("data-ad-client", "ca-pub-0000000000000000");
    ad.setAttribute("data-ad-slot", "shadow-demo");
    ad.style.cssText =
      "display:inline-block;padding:6px 10px;border:1px dashed #d97706;background:#fffbeb;color:#92400e;font:13px system-ui;";
    ad.textContent = "Sponsored — limited-time offer from a partner brand";
    shadow.append(ad);

    // Injection-shaped paragraph for the text-walk rules. The fixture
    // is reused from the product detail page so we don't ship a new
    // plaintext payload in source — the existing base64 encoding in
    // `injection-fixtures.ts` is the convention. Wrapped in a <p>
    // because `prompt-injection-redact` looks for a block-level
    // ancestor (`p, li, blockquote, …`) to scope the placeholder.
    const injection = document.createElement("p");
    injection.style.cssText =
      "margin:8px 0 0;padding:6px 10px;border:1px solid #b91c1c;background:#fef2f2;color:#7f1d1d;font:13px system-ui;";
    injection.textContent = INJECTIONS.PRODUCT_DETAIL_HIDDEN_SYSTEM;
    shadow.append(injection);

    return () => {
      // React StrictMode runs effects twice in dev. Leaving the shadow
      // root behind on unmount would let it accumulate across reloads;
      // clearing children lets the next mount rebuild cleanly. The
      // shadow root itself can't be detached once attached, so we
      // settle for emptying it.
      shadow.replaceChildren();
    };
  }, []);

  useEffect(() => {
    const host = closedHostRef.current;
    if (!host || host.querySelector(CLOSED_TAG)) {
      return;
    }
    const widget = document.createElement(CLOSED_TAG);
    host.append(widget);
    return () => {
      widget.remove();
    };
  }, []);

  return (
    <section
      aria-label="Shadow-DOM third-party widgets"
      className="rounded border border-slate-300 bg-white p-4"
    >
      <h2 className="text-base font-semibold text-slate-900">
        Third-party widgets mounted inside an open shadow root
      </h2>
      <p className="mt-2 text-sm text-stone-700">
        The items below are appended into <code>this.attachShadow()</code> — the
        same way modern chat, consent, and ad SDKs ship their UI to keep their
        styles isolated from the host page. With shadow-aware rules enabled, the
        chat launcher should be removed (selector dispatch reaches into the
        shadow), the sponsored block replaced (curated ads-hide selector +
        EasyList stylesheet now adopted into shadow roots), and the
        prompt-injection paragraph hidden behind a reveal placeholder (text
        walker descends through open shadows). Without shadow piercing every
        item would survive untouched.
      </p>
      <div
        ref={hostRef}
        className="shadow-host mt-3 rounded border border-dashed border-slate-300 p-3"
      />
      <p className="mt-4 text-sm text-stone-700">
        The widget below mounts inside a <em>closed</em> shadow root. ABS cannot
        reach inside by spec — every rule passes its contents through untouched.
        With <code>closed-shadow-root-annotate</code> enabled, a
        screen-reader-only landmark is prepended to the document noting that the
        page is using closed shadow roots and content here is invisible to the
        extension.
      </p>
      <div
        ref={closedHostRef}
        className="closed-shadow-host mt-3 rounded border border-dashed border-slate-300 p-3"
      />
    </section>
  );
}
