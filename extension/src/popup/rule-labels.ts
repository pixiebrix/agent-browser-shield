// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// User-facing labels for each rule, looked up by RuleId. Lives under
// `popup/` (not `lib/`) so the strings stay out of the background bundle
// — `check-background-purity.ts` uses each rule's label as a canary to
// detect rule files leaking into the service worker. The popup is a
// separate bundle, so importing this here is safe.
//
// Maintained by hand and verified against `RULE_IDS` in
// `rules/__tests__/catalog.test.ts`: adding a rule without adding its
// label here fails the suite.

import type { RuleId } from "../rules/rule-defaults.generated";

// Exported as `Record<RuleId, string>` (rather than the narrow literal-
// keyed `as const` shape) so callers can look up via any `RuleId` value
// without a cast. The object literal stays `as const satisfies …` below
// so adding a rule without a label still fails to type-check here.
export const RULE_LABELS: Readonly<Record<RuleId, string>> = {
  "pii-redact": "Mask PII",
  "secrets-redact": "Mask Secrets",
  "reviews-redact": "Hide Reviews",
  "comments-redact": "Hide Comments",
  "prompt-injection-redact": "Hide Prompt Injection",
  "countdown-timer-redact": "Hide Countdown Timers",
  "scarcity-redact": "Hide Scarcity Warnings",
  "confirmshame-sanitize": "Neutralize Confirmshame Buttons",
  "footer-redact": "Hide Page Footer",
  "checkout-checkbox-sanitize": "Clear Checkout Checkboxes",
  "cookie-banner-hide": "Remove Cookie Banners",
  "chat-widget-hide": "Remove Chat Widgets",
  "html-comment-strip": "Strip HTML Comments",
  "hidden-text-strip": "Strip Hidden Text",
  "unicode-invisibles-strip": "Strip Unicode Invisibles",
  "noscript-strip": "Strip Noscript",
  "json-ld-sanitize": "Sanitize JSON-LD",
  "attribute-injection-sanitize": "Scrub Attribute Injection",
  "meta-injection-strip": "Strip Meta Injection",
  "newsletter-modal-hide": "Remove Newsletter Modals",
  "svg-sprite-strip": "Remove Unused SVG Sprites",
  "svg-text-strip": "Strip SVG Injection",
  "social-embed-redact": "Hide Social Embeds",
  "ads-hide": "Hide Ads & Sponsored Results",
  "cart-addon-annotate": "Flag Cart Add-Ons (Sneak-Into-Basket)",
  "link-spoof-annotate": "Flag Spoofed Links",
  "search-url-helper": "Embed Search URL Recipes",
  "roach-motel-annotate": "Flag Roach-Motel Sign-Ups",
  "irrelevant-sections-redact": "Hide Irrelevant Sections (AI)",
  "cross-origin-frame-redact": "Hide Cross-Origin Frames (Experimental)",
  "schema-trust-sanitize": "Sanitize Schema Trust Claims (Experimental)",
  "trust-badge-annotate": "Flag Trust Badges (Experimental)",
  "disguised-ad-flag": "Hide Disguised Ads (Native Advertorials)",
  "encoded-payload-redact": "Redact Encoded Payloads",
  "webdriver-probe-annotate": "Flag navigator.webdriver Reads",
  "closed-shadow-root-annotate": "Flag Closed Shadow Roots",
  "hidden-fee-annotate": "Annotate Drip-Pricing Fees (Experimental)",
  "form-prefill-annotate": "Annotate Form Prefills (Experimental)",
  "hidden-affiliate-sanitize": "Scrub Hidden Affiliate Metadata",
} as const satisfies Record<RuleId, string>;
