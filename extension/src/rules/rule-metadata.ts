// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Source of truth for `RuleId`, `RULE_IDS`, and ship-default state.
// Hand-edited. Adding a rule: append an entry here AND register the
// runtime in `rules/index.ts`. The catalog test in
// `rules/__tests__/catalog.test.ts` enforces that the two stay in sync.
//
// Kept out of `rules/index.ts` so service-worker code (`lib/storage.ts`,
// `background.ts`) can import id metadata without pulling rule files'
// DOM access into the worker bundle (guarded by
// `scripts/check-background-purity.ts`).

export const RULE_DEFAULTS = {
  "pii-redact": true,
  "secrets-redact": true,
  "reviews-redact": true,
  "comments-redact": true,
  "prompt-injection-redact": true,
  "countdown-timer-redact": true,
  "scarcity-redact": true,
  "confirmshame-sanitize": true,
  "footer-redact": true,
  "checkout-checkbox-sanitize": true,
  "cookie-banner-hide": true,
  "chat-widget-hide": true,
  "html-comment-strip": true,
  "hidden-text-strip": true,
  "unicode-invisibles-strip": true,
  "noscript-strip": true,
  "json-ld-sanitize": true,
  "attribute-injection-sanitize": true,
  "meta-injection-strip": true,
  "newsletter-modal-hide": true,
  "svg-sprite-strip": true,
  "svg-text-strip": true,
  "social-embed-redact": true,
  "ads-hide": true,
  "cart-addon-annotate": true,
  "link-spoof-annotate": true,
  "search-url-helper": true,
  "roach-motel-annotate": true,
  "irrelevant-sections-redact": false,
  "cross-origin-frame-redact": false,
  "schema-trust-sanitize": false,
  "trust-badge-annotate": false,
  "disguised-ad-flag": true,
  "encoded-payload-redact": true,
  "webdriver-probe-annotate": false,
  "closed-shadow-root-annotate": false,
  "hidden-fee-annotate": true,
  "form-prefill-annotate": true,
  "hidden-affiliate-sanitize": true,
} as const satisfies Readonly<Record<string, boolean>>;

export type RuleId = keyof typeof RULE_DEFAULTS;

export const RULE_IDS = Object.keys(RULE_DEFAULTS) as readonly RuleId[];
