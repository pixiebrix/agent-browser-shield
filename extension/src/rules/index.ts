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
import type { RuleId } from "./rule-metadata";
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
// file, add the import above, append below, then add an entry to
// `rule-metadata.ts`.
//
// `RuleId` and `RULE_IDS` are the single canonical id set, defined in
// `rule-metadata.ts` so service-worker consumers (`lib/storage.ts`,
// `background.ts`) can import them without pulling any rule file's top-level
// DOM access into the worker bundle. This module does NOT re-derive the type
// or the id list — it re-exports both from `rule-metadata.ts` and instead
// *constrains* its runtime tuple against them (see below), so the two stay one
// source of truth rather than two coincidentally-equal ones.
//
// Author-time agreement (replaces the old runtime-only catalog checks):
//   - `satisfies readonly { id: RuleId }[]` makes registering a rule here
//     without a `RULE_DEFAULTS` entry a compile error (forward direction).
//     This only bites if each rule preserves its literal `id` type — a plain
//     `satisfies Rule` widens `id` back to `string` (Rule.id is `string`), so
//     rule files pin the id with `as const` / a generic factory. (The chained
//     `satisfies readonly Rule[]` keeps the full-Rule-shape check too.)
//   - `_assertEveryRuleIdHasRuntime` below makes declaring a `RuleId` in
//     `rule-metadata.ts` without a runtime here a compile error (reverse).
// Together they pin `RULES_TUPLE`'s id set equal to `RuleId` at type-check
// time; the catalog test's id-set assertions are now belt-and-suspenders.
//
// The inner tuple is `as const` so TypeScript preserves each rule's literal
// `id` for the reverse assertion and downstream consumers; the exported
// `RULES` is widened to `readonly CatalogRule[]` so consumers see the full Rule
// shape (optional `available`, `teardown`, `unavailableReason`) with `id`
// narrowed to `RuleId`.
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
] as const satisfies readonly Rule[] satisfies readonly { id: RuleId }[];

// Reverse of the `satisfies` above: every declared `RuleId` must have a
// registered runtime in `RULES_TUPLE`. If one doesn't, `Missing` is its
// literal and the `true` assignment fails to type-check, naming the offender.
type AssertEveryRuleIdHasRuntime<
  Missing = Exclude<RuleId, (typeof RULES_TUPLE)[number]["id"]>,
> = [Missing] extends [never]
  ? true
  : {
      error: "RuleId(s) missing a runtime in rules/index.ts";
      missing: Missing;
    };
const _assertEveryRuleIdHasRuntime: AssertEveryRuleIdHasRuntime = true;

// A catalog rule: a `Rule` whose `id` is narrowed to a known `RuleId`. Use it
// as the parameter type when a helper indexes a `RuleId`-keyed map (RuleStates,
// RuleAvailabilityStates) by `rule.id` — plain `Rule.id` is `string` and won't
// index those maps.
export type CatalogRule = Rule & { id: RuleId };

// Typed as `CatalogRule` (not plain `Rule`) so `rule.id` reads as a `RuleId`
// for consumers that index `RuleId`-keyed maps; the element type is otherwise
// the full Rule shape.
export const RULES: readonly CatalogRule[] = RULES_TUPLE;

export type { RuleId } from "./rule-metadata";
// Single canonical id set + type live in `rule-metadata.ts`; re-exported here
// so `from "../rules"` import sites keep working without a second definition.
export { RULE_IDS } from "./rule-metadata";
export type { Rule } from "./types";
