// AUTO-GENERATED — do not edit by hand.
// Source: extension/data/rule-defaults.json
// Regenerate with `bun run build-rule-defaults`.

// Source of truth for `RuleId` and `RULE_IDS`. Lives outside `rules/index.ts`
// so service-worker code (`lib/storage.ts`, `background.ts`) can import the
// id set without pulling in any rule file's top-level DOM access.

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
} as const satisfies Readonly<Record<string, boolean>>;

export type RuleId = keyof typeof RULE_DEFAULTS;

export const RULE_IDS = Object.keys(RULE_DEFAULTS) as readonly RuleId[];
