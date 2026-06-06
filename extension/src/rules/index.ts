// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { adsHideRule } from "./ads-hide";
import { attributeInjectionSanitizeRule } from "./attribute-injection-sanitize";
import { cartAddonAnnotateRule } from "./cart-addon-annotate";
import { chatWidgetHideRule } from "./chat-widget-hide";
import { checkoutCheckboxSanitizeRule } from "./checkout-checkbox-sanitize";
import { closedShadowRootAnnotateRule } from "./closed-shadow-root-annotate";
import { commentsRedactRule } from "./comments-redact";
import { confirmshameSanitizeRule } from "./confirmshame-sanitize";
import { cookieBannerHideRule } from "./cookie-banner-hide";
import { countdownTimerRedactRule } from "./countdown-timer-redact";
import { crossOriginFrameRedactRule } from "./cross-origin-frame-redact";
import { disguisedAdFlagRule } from "./disguised-ad-flag";
import { encodedPayloadRedactRule } from "./encoded-payload-redact";
import { footerRedactRule } from "./footer-redact";
import { formPrefillAnnotateRule } from "./form-prefill-annotate";
import { hiddenAffiliateSanitizeRule } from "./hidden-affiliate-sanitize";
import { hiddenFeeAnnotateRule } from "./hidden-fee-annotate";
import { hiddenTextStripRule } from "./hidden-text-strip";
import { htmlCommentStripRule } from "./html-comment-strip";
import { irrelevantSectionsRedactRule } from "./irrelevant-sections-redact";
import { jsonLdSanitizeRule } from "./json-ld-sanitize";
import { linkSpoofAnnotateRule } from "./link-spoof-annotate";
import { metaInjectionStripRule } from "./meta-injection-strip";
import { newsletterModalHideRule } from "./newsletter-modal-hide";
import { noscriptStripRule } from "./noscript-strip";
import { piiRedactRule } from "./pii-redact";
import { promptInjectionRedactRule } from "./prompt-injection-redact";
import { reviewsRedactRule } from "./reviews-redact";
import { roachMotelAnnotateRule } from "./roach-motel-annotate";
import { scarcityRedactRule } from "./scarcity-redact";
import { schemaTrustSanitizeRule } from "./schema-trust-sanitize";
import { searchUrlHelperRule } from "./search-url-helper";
import { secretsRedactRule } from "./secrets-redact";
import { socialEmbedRedactRule } from "./social-embed-redact";
import { svgSpriteStripRule } from "./svg-sprite-strip";
import { svgTextStripRule } from "./svg-text-strip";
import { trustBadgeAnnotateRule } from "./trust-badge-annotate";
import type { Rule } from "./types";
import { unicodeInvisiblesStripRule } from "./unicode-invisibles-strip";
import { webdriverProbeAnnotateRule } from "./webdriver-probe-annotate";

// Catalog of every rule's runtime (apply/teardown). Adding a rule: create the
// file, add the import above, append below, then update
// `data/rule-defaults.json` and rerun `bun run build-rule-defaults`.
//
// `RuleId` and `RULE_IDS` are the canonical id set, and they live in
// `rule-defaults.generated.ts` so service-worker consumers (`lib/storage.ts`,
// `background.ts`) can import them without pulling any rule file's top-level
// DOM access into the worker bundle. The catalog invariants test verifies
// `RULES.map(r => r.id)` matches `RULE_IDS` exactly.
//
// The inner tuple is `as const` so TypeScript preserves each rule's literal
// `id` for downstream consumers (`Map<RuleId, Rule>(RULES.map(...))` etc.);
// the exported `RULES` is widened to `readonly Rule[]` so consumers see the
// full Rule shape (optional `available`, `teardown`, `unavailableReason`).
const RULES_TUPLE = [
  piiRedactRule,
  secretsRedactRule,
  reviewsRedactRule,
  commentsRedactRule,
  promptInjectionRedactRule,
  countdownTimerRedactRule,
  scarcityRedactRule,
  confirmshameSanitizeRule,
  footerRedactRule,
  checkoutCheckboxSanitizeRule,
  cookieBannerHideRule,
  chatWidgetHideRule,
  htmlCommentStripRule,
  hiddenTextStripRule,
  unicodeInvisiblesStripRule,
  noscriptStripRule,
  jsonLdSanitizeRule,
  metaInjectionStripRule,
  attributeInjectionSanitizeRule,
  newsletterModalHideRule,
  svgSpriteStripRule,
  svgTextStripRule,
  socialEmbedRedactRule,
  adsHideRule,
  cartAddonAnnotateRule,
  linkSpoofAnnotateRule,
  trustBadgeAnnotateRule,
  searchUrlHelperRule,
  roachMotelAnnotateRule,
  irrelevantSectionsRedactRule,
  crossOriginFrameRedactRule,
  schemaTrustSanitizeRule,
  disguisedAdFlagRule,
  encodedPayloadRedactRule,
  webdriverProbeAnnotateRule,
  closedShadowRootAnnotateRule,
  hiddenFeeAnnotateRule,
  formPrefillAnnotateRule,
  hiddenAffiliateSanitizeRule,
] as const satisfies readonly Rule[];

export type RuleId = (typeof RULES_TUPLE)[number]["id"];
export const RULES: readonly Rule[] = RULES_TUPLE;
export const RULE_IDS: readonly RuleId[] = RULES_TUPLE.map((rule) => rule.id);

export type { Rule } from "./types";
