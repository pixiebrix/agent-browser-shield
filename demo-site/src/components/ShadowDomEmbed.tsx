// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { useEffect, useRef } from "react";

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
// actually reaching the content.

export default function ShadowDomEmbed() {
  const hostRef = useRef<HTMLDivElement>(null);

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

    return () => {
      // React StrictMode runs effects twice in dev. Leaving the shadow
      // root behind on unmount would let it accumulate across reloads;
      // clearing children lets the next mount rebuild cleanly. The
      // shadow root itself can't be detached once attached, so we
      // settle for emptying it.
      shadow.replaceChildren();
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
        The two items below are appended into <code>this.attachShadow()</code> —
        the same way modern chat, consent, and ad SDKs ship their UI to keep
        their styles isolated from the host page. Without the shadow-aware
        subtree watcher the extension's rules would walk right past them; with
        it, the chat launcher should be removed and the sponsored block
        replaced.
      </p>
      <div
        ref={hostRef}
        className="shadow-host mt-3 rounded border border-dashed border-slate-300 p-3"
      />
    </section>
  );
}
