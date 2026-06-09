---
status: Current
last_reviewed: 2026-06-09
---

# Cross-origin and shadow-DOM coverage

## Purpose

Establish where the rule engine can and cannot reach, and surface the gaps back
to the agent so it isn't silently reading content the shield never saw. Covers
shadow-DOM attachment paths (open vs closed), cross-origin embedded frames, and
AI-targeted cloaking signals.

## Problem

A defense system that silently doesn't cover part of a page is worse than no
defense — the user assumes protection where there is none. Closed shadow roots,
cross-origin iframes, declarative shadow DOM, and AI-targeted cloaking all
surface content the rule engine cannot read or rewrite. Without explicit
landmarks naming those blind spots, agents act on partial information believing
the shield ran, and humans don't know to look closer at the regions the shield
couldn't see.

## User stories

### Human users

- As a **person browsing a page with a closed-shadow-root chat widget**, I want
  the agent warned that there's a blind spot, so that I don't assume the shield
  covers the whole page when it can't.
- As a **person on a page with cross-origin iframes (payment, video, third-party
  comments)**, I want a way to keep the agent from ingesting embedded-origin
  content, so that an attacker can't smuggle instructions in via an iframe the
  parent page doesn't control.

### AI agents

- As a **browser-use agent reading the page**, I want every open shadow root
  walked the same way the light DOM is, so that defenses apply regardless of
  which framework's component model the page uses.
- As a **browser-use agent reading the page**, I want a screen-reader-only
  landmark when the page attaches closed shadow roots or reads
  `navigator.webdriver`, so that I can warn the user that the shield has a known
  coverage gap on this page or that the site can distinguish agent traffic from
  human traffic.

## Functional requirements

### Open shadow-root coverage

- **FR-1.** The engine walks every **open** shadow root the page builds. Three
  attachment paths are covered:
  1. Imperative — `element.attachShadow({ mode: "open" })`. Handles most chat
     widgets, consent banners, ad SDKs, and custom elements.
  2. Declarative shadow DOM at parse time — `<template shadowrootmode="open">`
     in the initial HTML. The browser materializes the shadow before the content
     script runs; the extension's startup walk finds it.
  3. Declarative shadow DOM post-parse — `Element.setHTMLUnsafe` and
     `ShadowRoot.setHTMLUnsafe`. The extension wraps both so a host that gains a
     shadow via this path is added to the registry.
- **FR-2.** Placeholder styling is adopted into every open shadow root via
  `adoptedStyleSheets` so a placeholder rendered inside a web-component shadow
  tree renders with the same stripes, border, and reveal-button chrome as the
  light DOM. Document stylesheets don't cross shadow boundaries; the
  `adoptedStyleSheets` primitive does.

### Closed shadow-root posture

- **FR-3.** **Closed** shadow roots (`{ mode: "closed" }`) are not reached,
  regardless of attachment path. The Web Components spec makes closed mode opt
  out of all external JS access (`host.shadowRoot` is `null`,
  `document.adoptedStyleSheets` and `MutationObserver` do not cross the
  boundary). Any content rendered inside a closed shadow root — ads, chat
  widgets, hidden text, prompt-injection payloads — is invisible to every rule
  and is passed through to the agent untouched. This is documented as a known
  gap. See [ADR-0008](../decisions/0008-shadow-dom-coverage.md).
- **FR-4.** `closed-shadow-root-annotate` (default **off**, experimental,
  top-frame only) detects closed-shadow-root attachments and prepends a
  screen-reader-only landmark noting that the extension cannot see inside. Two
  detection paths feed the landmark:
  1. **Main-world probe (primary).** A page-world wrap over
     `Element.prototype.attachShadow` runs at `document_start`. Any call with
     `mode: "closed"` dispatches a binary signal — no shadow contents are
     exposed; only the binary "attachment happened" signal crosses worlds,
     preserving the spec-mandated encapsulation of closed mode.
  2. **Structural heuristic (fallback).** Looks for an upgraded custom element
     (hyphenated tag name, defined in `customElements`) with no light-DOM
     children, no `host.shadowRoot`, and a non-zero rendered box. Built-in
     elements with UA shadow roots (`<input>`, `<details>`, `<video>`) are
     filtered out — their tag names contain no hyphen.
- **FR-5.** The heuristic path has a known false positive: a custom element that
  renders via canvas, WebGL, or `::before` background-image with no actual
  shadow root will trip it. The landmark text is calibrated to that uncertainty
  — it tells the reader that closed shadow content "is invisible to this
  extension and may include text, controls, or instructions that are not
  reflected in the rest of the page's accessible content," rather than asserting
  a closed shadow root is definitely present. The main-world probe is definitive
  when both signals are available.
- **FR-6.** Declarative shadow DOM with `shadowrootmode="closed"` is not
  surfaced by either path — the parser materializes the shadow without going
  through `attachShadow`, so the probe doesn't see it; and the materialized
  closed root is indistinguishable from "no shadow" from outside JS.

### Cross-origin frames

- **FR-7.** `cross-origin-frame-redact` (default **off**, experimental) replaces
  cross-origin embedded frame-like elements with a click-to-reveal placeholder
  so the parent-page agent doesn't ingest embedded-origin content. Three
  carriers are covered:
  - `<iframe>` whose `src` resolves to a different web origin,
  - `<object data="…">` and `<embed src="…">` pointing at a different web
    origin.
- **FR-8.** Same-origin iframes/objects/embeds, `srcdoc` iframes, and inert
  `about:` / `javascript:` / `data:` / `blob:` resources are left alone. Each
  frame in the page processes its own direct children, so a cross-origin frame
  nested inside a same-origin frame is also caught (the same-origin parent's
  content script handles the redact).

### AI-targeted cloaking signal

- **FR-9.** `webdriver-probe-annotate` (default **off**, experimental, top-frame
  only) injects a main-world probe that wraps `navigator.webdriver`'s getter on
  the top-level document and listens for reads. If the page reads the property,
  the rule prepends a screen-reader-only landmark noting that the site can
  distinguish AI-agent traffic from human traffic and may serve different
  content to agents than to people.
- **FR-10.** Two complementary delivery paths run the same wrap-and-dispatch
  logic in the page world:
  1. **Primary, document_start.** On toggle-on, the background service worker
     registers a standalone main-world bundle (`webdriver-probe.js`) via
     `chrome.scripting.registerContentScripts` with `world: "MAIN"` and
     `runAt: "document_start"`. Subsequent navigations run the probe before the
     page's first script.
  2. **Fallback, document_idle.** The rule's own `apply` inline-injects the same
     probe via `<script>` `textContent`. Covers the tab the user was already
     viewing when they toggled the rule on. Misses early-parse reads on that tab
     but catches `DOMContentLoaded` / `load` handlers, polled fingerprinters,
     and interaction-driven checks. Pages with a strict `script-src` CSP block
     the inline `<script>`; future navigations are still covered by the
     registered bundle.
- **FR-11.** The annotation flags **capability**, not measured cloaking — a
  `navigator.webdriver` read by itself is consistent with legitimate anti-fraud
  fingerprinting on banking, payments, and checkout flows. The landmark text
  never uses the unqualified word "cloaking".

### Extension presence is observable

- **FR-12.** The rules leave rendered artifacts on the page — click-to-reveal
  placeholders, screen-reader-only landmarks, inline annotation chips,
  neutralized button labels. A sophisticated site that fingerprints for those
  artifacts can detect ABS and serve a different DOM under that fingerprint. The
  rule engine only sees what the page renders, so any content shaped by such
  adaptation is read by the rules as legitimate page content. **Counter-cloaking
  from a content script is structurally out of scope.**

## Non-functional requirements

- **NFR-S-1.** Main-world probes (`webdriver-probe`, `shadow-root-probe`,
  `checkout-checkbox-defense`, `dump-trace-bridge`) are registered as standalone
  bundles via `chrome.scripting.registerContentScripts` with `world: "MAIN"`,
  scoped to the rule's effective state. Toggling the rule off unregisters the
  script for future navigations; the wrap on already-loaded pages stays in place
  for the document's lifetime.
- **NFR-S-2.** No closed-shadow-root contents are exfiltrated by the detection
  path (FR-4(1)) — only the binary attach event crosses worlds.
- **NFR-O-1.** Roach-motel, webdriver-probe, and closed-shadow-root detections
  surface in the popup's *Heads up* card section in addition to the per-rule
  activity counts. See spec [0010](./0010-extension-ui-and-controls.md).

## Current implementation

- FR-1: `extension/src/lib/shadow-roots.ts`,
  `extension/src/lib/shadow-root-probe-source.ts`,
  `extension/src/lib/shadow-root-probe-registration.ts`,
  `extension/src/shadow-root-probe.ts`.
- FR-2: `extension/src/lib/shadow-stylesheets.ts`.
- FR-3, FR-4, FR-5, FR-6: `extension/src/rules/closed-shadow-root-annotate.ts`,
  `extension/src/rules/__tests__/closed-shadow-root-annotate.test.ts`.
- FR-7, FR-8: `extension/src/rules/cross-origin-frame-redact.ts`,
  `extension/src/rules/__tests__/cross-origin-frame-redact.test.ts`,
  `extension/src/rules/__tests__/cross-origin-frame-redact.property.test.ts`.
- FR-9, FR-10, FR-11: `extension/src/rules/webdriver-probe-annotate.ts`,
  `extension/src/lib/webdriver-probe-source.ts`,
  `extension/src/lib/webdriver-probe-registration.ts`,
  `extension/src/webdriver-probe.ts`,
  `extension/src/rules/__tests__/webdriver-probe-annotate.test.ts`.

## Future work

- Closed declarative shadow DOM detection — not surfaced by either path today
  (FR-6); fundamental limitation given parser-materialized closed roots are
  indistinguishable from "no shadow" from outside JS.
- Cross-origin `<frame>` (legacy frameset) coverage —
  `cross-origin-frame-redact` covers `<iframe>`/`<object>`/`<embed>` only.
- Beyond `navigator.webdriver` — IP-based, UA-based, and other cloaking signals
  are not detected client-side. Caspi & Tugendhaft document the full taxonomy;
  this rule covers the JS-property arm only.

## Related

- ADRs: [ADR-0003](../decisions/0003-run-rule-engine-in-all-frames.md),
  [ADR-0008](../decisions/0008-shadow-dom-coverage.md).
- Docs: [`docs/src/content/docs/rules.md`](../docs/src/content/docs/rules.md)
  §"Coverage scope", §"Cross-origin surface".
- Specs: [0002](./0002-rule-engine.md),
  [0010](./0010-extension-ui-and-controls.md).
