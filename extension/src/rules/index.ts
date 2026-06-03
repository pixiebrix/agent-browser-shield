// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { adsHideRule } from "./ads-hide";
import { attributeInjectionScrubRule } from "./attribute-injection-scrub";
import { cartAddonFlagRule } from "./cart-addon-flag";
import { chatWidgetHideRule } from "./chat-widget-hide";
import { checkoutCheckboxClearRule } from "./checkout-checkbox-clear";
import { commentsHideRule } from "./comments-hide";
import { confirmshameNeutralizeRule } from "./confirmshame-neutralize";
import { cookieBannerHideRule } from "./cookie-banner-hide";
import { countdownTimerHideRule } from "./countdown-timer-hide";
import { crossOriginFrameHideRule } from "./cross-origin-frame-hide";
import { footerHideRule } from "./footer-hide";
import { hiddenTextStripRule } from "./hidden-text-strip";
import { htmlCommentStripRule } from "./html-comment-strip";
import { irrelevantSectionsHideRule } from "./irrelevant-sections-hide";
import { jsonLdSanitizeRule } from "./json-ld-sanitize";
import { metaInjectionStripRule } from "./meta-injection-strip";
import { newsletterModalHideRule } from "./newsletter-modal-hide";
import { noscriptStripRule } from "./noscript-strip";
import { piiMaskRule } from "./pii-mask";
import { promptInjectionHideRule } from "./prompt-injection-hide";
import { reviewsHideRule } from "./reviews-hide";
import { roachMotelFlagRule } from "./roach-motel-flag";
import { scarcityHideRule } from "./scarcity-hide";
import { searchUrlHelperRule } from "./search-url-helper";
import { secretsMaskRule } from "./secrets-mask";
import { socialEmbedHideRule } from "./social-embed-hide";
import { svgSpriteSuppressRule } from "./svg-sprite-suppress";
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
  piiMaskRule,
  secretsMaskRule,
  reviewsHideRule,
  commentsHideRule,
  promptInjectionHideRule,
  countdownTimerHideRule,
  scarcityHideRule,
  confirmshameNeutralizeRule,
  footerHideRule,
  checkoutCheckboxClearRule,
  cookieBannerHideRule,
  chatWidgetHideRule,
  htmlCommentStripRule,
  hiddenTextStripRule,
  unicodeInvisiblesStripRule,
  noscriptStripRule,
  jsonLdSanitizeRule,
  metaInjectionStripRule,
  attributeInjectionScrubRule,
  newsletterModalHideRule,
  svgSpriteSuppressRule,
  socialEmbedHideRule,
  adsHideRule,
  cartAddonFlagRule,
  searchUrlHelperRule,
  roachMotelFlagRule,
  irrelevantSectionsHideRule,
  crossOriginFrameHideRule,
] as const satisfies readonly Rule[];

export type RuleId = (typeof RULES_TUPLE)[number]["id"];
export const RULES: readonly Rule[] = RULES_TUPLE;
export const RULE_IDS: readonly RuleId[] = RULES_TUPLE.map((rule) => rule.id);

export type { Rule } from "./types";
