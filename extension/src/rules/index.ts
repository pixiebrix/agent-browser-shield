// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { adsHideRule } from "./ads-hide";
import { attributeInjectionSanitizeRule } from "./attribute-injection-sanitize";
import { cartAddonAnnotateRule } from "./cart-addon-annotate";
import { chatWidgetHideRule } from "./chat-widget-hide";
import { checkoutCheckboxSanitizeRule } from "./checkout-checkbox-sanitize";
import { commentsRedactRule } from "./comments-redact";
import { confirmshameSanitizeRule } from "./confirmshame-sanitize";
import { cookieBannerHideRule } from "./cookie-banner-hide";
import { countdownTimerRedactRule } from "./countdown-timer-redact";
import { crossOriginFrameRedactRule } from "./cross-origin-frame-redact";
import { footerRedactRule } from "./footer-redact";
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
import { searchUrlHelperRule } from "./search-url-helper";
import { secretsRedactRule } from "./secrets-redact";
import { socialEmbedRedactRule } from "./social-embed-redact";
import { svgSpriteStripRule } from "./svg-sprite-strip";
import type { Rule } from "./types";
import { unicodeInvisiblesStripRule } from "./unicode-invisibles-strip";

// Single source of truth for the rule catalog. RULE_IDS, RuleId, defaults, and
// availability are all derived from this array. Adding a rule: create the
// file, add the import above, append below — no other registration needed.
//
// The inner tuple is `as const` so `RuleId` can be the union of literal ids;
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
  socialEmbedRedactRule,
  adsHideRule,
  cartAddonAnnotateRule,
  linkSpoofAnnotateRule,
  searchUrlHelperRule,
  roachMotelAnnotateRule,
  irrelevantSectionsRedactRule,
  crossOriginFrameRedactRule,
] as const satisfies readonly Rule[];

export type RuleId = (typeof RULES_TUPLE)[number]["id"];
export const RULES: readonly Rule[] = RULES_TUPLE;
export const RULE_IDS: readonly RuleId[] = RULES_TUPLE.map((rule) => rule.id);

export type { Rule } from "./types";
