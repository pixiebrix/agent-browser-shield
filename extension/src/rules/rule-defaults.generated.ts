// AUTO-GENERATED — do not edit by hand.
// Source: extension/data/rule-defaults.json
// Regenerate with `bun run build-rule-defaults`.

import type { RuleId } from "./index";

export const RULE_DEFAULTS: Readonly<Record<RuleId, boolean>> = {
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
  "meta-injection-strip": true,
  "attribute-injection-sanitize": true,
  "newsletter-modal-hide": true,
  "svg-sprite-strip": true,
  "social-embed-redact": true,
  "ads-hide": true,
  "cart-addon-annotate": true,
  "search-url-helper": true,
  "roach-motel-annotate": true,
  "irrelevant-sections-redact": false,
  "cross-origin-frame-redact": false,
};
