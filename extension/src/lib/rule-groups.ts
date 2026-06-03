// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import type { RuleId } from "../rules";

// Top-level categories used by the popup and options page to organize the
// rule list. They mirror the H2 headings in `docs/src/content/docs/rules.md`
// — when adding a rule, append its id to whichever group matches the doc
// section it lives under. The catalog invariant test enforces that every
// rule belongs to exactly one group.
export type RuleGroupId =
  | "indirect-prompt-injection"
  | "dark-patterns"
  | "sensitive-data-masking"
  | "context-pollution"
  | "agent-shortcuts";

export interface RuleGroup {
  id: RuleGroupId;
  label: string;
  ruleIds: readonly RuleId[];
}

export const RULE_GROUPS: readonly RuleGroup[] = [
  {
    id: "indirect-prompt-injection",
    label: "Indirect prompt injection",
    ruleIds: [
      "prompt-injection-redact",
      "comments-redact",
      "reviews-redact",
      "social-embed-redact",
      "html-comment-strip",
      "noscript-strip",
      "hidden-text-strip",
      "unicode-invisibles-strip",
      "meta-injection-strip",
      "attribute-injection-sanitize",
      "json-ld-sanitize",
      "svg-text-strip",
      "schema-trust-sanitize",
      "cross-origin-frame-redact",
      "link-spoof-annotate",
      "trust-badge-annotate",
    ],
  },
  {
    id: "dark-patterns",
    label: "Dark patterns",
    ruleIds: [
      "countdown-timer-redact",
      "scarcity-redact",
      "cart-addon-annotate",
      "checkout-checkbox-sanitize",
      "confirmshame-sanitize",
      "roach-motel-annotate",
      "newsletter-modal-hide",
    ],
  },
  {
    id: "sensitive-data-masking",
    label: "Sensitive-data masking",
    ruleIds: ["pii-redact", "secrets-redact"],
  },
  {
    id: "context-pollution",
    label: "Context pollution",
    ruleIds: [
      "footer-redact",
      "cookie-banner-hide",
      "chat-widget-hide",
      "ads-hide",
      "disguised-ad-flag",
      "svg-sprite-strip",
      "irrelevant-sections-redact",
    ],
  },
  {
    id: "agent-shortcuts",
    label: "Agent shortcuts",
    ruleIds: ["search-url-helper"],
  },
];
