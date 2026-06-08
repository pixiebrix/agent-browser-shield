// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Rewrite "confirmshaming" decline buttons to a neutral label so an agent
// reading the DOM/a11y tree isn't pushed away from the decline option by
// guilt-tripping copy ("I'd rather pay full price", "I don't want to save
// money", "I hate discounts", "Maybe never").
//
// Strategy: in-place text rewrite, NOT a placeholder. The agent still needs
// to click the underlying control — only the visible label and any
// confirmshame-styled aria-label / title are neutralized. The original text
// is stashed on the element so teardown can restore the page exactly.
//
// Detection is intentionally narrow: every pattern requires a self-deprecating
// or benefit-rejecting clause, so plain decline labels ("No thanks",
// "Decline", "Maybe later", "Skip", "Close", "Continue as guest") never
// match. The cost of a false negative (one confirmshame button survives) is
// much lower than the cost of a false positive (a benign decline gets
// re-labeled and the agent is confused about which button does what).
//
// Limitation: React-controlled buttons may re-render their text from
// component state, restoring the original copy. The subtree watcher catches
// new button nodes via childList mutations, but not in-place
// characterData updates on a text node already inside a known button. In
// practice confirmshame copy is set when the modal opens and doesn't change
// after, so this is a deliberate trade-off vs. observing characterData
// globally.
//
// TODO: if we hit a site that re-renders confirmshame copy in place after
// our rewrite, extend createSubtreeWatcher to optionally observe
// characterData on the rewritten subtree (or watch for the stash data-attr
// being clobbered) and re-neutralize.

import {
  CONFIRMSHAME_ORIGINAL_ARIA_ATTR as ORIGINAL_ARIA_ATTR,
  CONFIRMSHAME_ORIGINAL_TEXT_ATTR as ORIGINAL_TEXT_ATTR,
  CONFIRMSHAME_ORIGINAL_TITLE_ATTR as ORIGINAL_TITLE_ATTR,
  CONFIRMSHAME_ORIGINAL_VALUE_ATTR as ORIGINAL_VALUE_ATTR,
} from "../lib/dom-markers";
import { createRuleLogger } from "../lib/log";
import { createSubtreeWatcher } from "../lib/subtree-watcher";
import { traceMutation } from "../lib/trace-mutation";
import type { Rule } from "./types";

const RULE_ID = "confirmshame-sanitize" as const;
const log = createRuleLogger(RULE_ID);

// Decline label that replaces confirmshame copy. "No thanks" reads as a
// plain refusal in every context this rule fires in (modals, signup forms,
// exit-intent overlays). "Cancel" was rejected because it implies an
// in-flight action; "Decline" was rejected as slightly clinical.
const NEUTRAL_LABEL = "No thanks";

// Confirmshame copy is short. Capping prevents matching inside paragraph
// prose that happens to live inside a [role="button"] wrapper or a giant
// custom-component button.
const MAX_BUTTON_TEXT_LENGTH = 240;

// Each pattern targets a confirmshame *signature*: self-deprecation
// ("I'm not smart enough"), benefit rejection ("I hate saving money"),
// guilt-by-comparison ("I'd rather pay full price"), forced-acceptance
// framing ("Yes, pay full price"), imperative self-commands ("Charge me
// extra"), sarcastic acceptance ("Whatever, take my money"), or topical
// guilt around health, family, loyalty status, and gamified progress
// ("I don't care about my family's safety", "Forfeit my XP"). Plain refusal
// text like "No thanks" or "Maybe later" must not match.
const CONFIRMSHAME_PATTERNS: RegExp[] = [
  // --- Monetary: pay more / forgo a discount ---

  // "I'd rather pay full price" / "I prefer paying more" / "I would rather pay extra"
  /\bi(?:'?d|\s+would)?\s+(?:rather|prefer(?:\s+to)?)\s+(?:keep\s+)?pay(?:ing)?\s+(?:full|more|extra|retail|the\s+full)/i,
  // "I'm fine / OK / happy paying more / spending more / without [the discount/savings/offer]"
  /\bi(?:'?m|\s+am)\s+(?:fine|ok(?:ay)?|happy|good)\s+(?:with\s+)?(?:paying|spending)\s+(?:full|more|extra|retail)/i,
  /\bi(?:'?m|\s+am)\s+(?:fine|ok(?:ay)?|happy|good)\s+without\s+(?:the\s+)?(?:discount|saving|offer|deal|coupon|reward|free)/i,
  // "I don't want / need to save money / get the discount / receive offers"
  /\bi\s+(?:do\s+not|don'?t)\s+(?:want|need)\s+to\s+(?:save|win|earn|get|receive|hear|learn|miss)\b.{0,30}(?:money|cash|discount|deal|offer|reward|coupon|saving|free|update|news)/i,
  // "I don't care about deals / love discounts / want updates"
  /\bi\s+(?:do\s+not|don'?t)\s+(?:care\s+(?:about|for)|like|love|want|need)\s+(?:any\s+)?(?:discounts?|deals?|offers?|rewards?|coupons?|savings?|bargains?|free\s+(?:stuff|gifts?|shipping|samples?)|updates?|news|promotions?)\b/i,
  // "I hate / dislike / don't like saving / discounts / deals / free shipping / good prices"
  /\bi\s+(?:hate|dislike|don'?t\s+like)\s+(?:saving|discounts|deals|bargains|rewards|coupons|free|good\s+prices)/i,
  // "I don't deserve [to save / a discount / Premium / ...]" — also catches
  // loyalty-tier confirmshame like "I don't deserve VIP".
  /\bi\s+(?:do\s+not|don'?t)\s+deserve\b/i,
  // "I love / enjoy paying full price / overpaying"
  /\bi\s+(?:love|enjoy|like)\s+(?:to\s+)?(?:pay(?:ing)?\s+(?:full|more|extra|retail)|overpaying)/i,
  // "Skip / Continue / Proceed and miss out / and lose / and pay full / without my discount"
  /\b(?:skip|continue|proceed|go\s+on)\b.{0,40}\b(?:and\s+miss|and\s+lose|and\s+pay\s+full|without\s+(?:my|the)\s+(?:discount|saving|offer|deal|coupon|reward))\b/i,
  // "I'm not smart / cheap / frugal / interested in saving"
  /\bi(?:'?m|\s+am)\s+not\s+(?:smart|cheap|frugal|interested\s+in\s+saving)/i,
  // "Maybe never" (strictly stronger than "maybe later" and effectively always confirmshame)
  /\bmaybe\s+never\b/i,

  // --- Health / safety / family / privacy guilt ---
  // Common on insurance, security, password-manager, identity-theft,
  // parental-control, and antivirus apps.

  // "I don't want / need to protect my [family/account/data/...]"
  /\bi\s+(?:do\s+not|don'?t)\s+(?:want|need)\s+to\s+protect\s+(?:my|our)\b/i,
  // "I don't care about my family / safety / security / privacy / health"
  /\bi\s+(?:do\s+not|don'?t)\s+care\s+about\s+(?:my\s+|our\s+|the\s+)?(?:family|kids?|children|safety|security|privacy|health|future|home|identity|data|account|password|finances?)\b/i,
  // "I'd rather be unsafe / vulnerable / exposed / at risk / hacked"
  /\bi(?:'?d|\s+would)?\s+rather\s+be\s+(?:unsafe|vulnerable|exposed|unprotected|at\s+risk|in\s+danger|hacked|breached)/i,
  // "I'm fine being vulnerable / unsafe / at risk"
  /\bi(?:'?m|\s+am)\s+(?:fine|ok(?:ay)?|happy)\s+(?:being\s+|with\s+being\s+)(?:unsafe|vulnerable|exposed|unprotected|at\s+risk|in\s+danger|hacked)/i,

  // --- Loyalty / membership downgrade framing ---

  // "Downgrade to basic" / "Downgrade my plan" — never a positive action when
  // worded as a button label on a retention/upsell modal.
  /\bdowngrade\s+(?:to\s+|me\s+|my\s+(?:account|plan|membership|subscription|tier))/i,
  // "Remove / forfeit / give up / drop my [Gold/VIP/membership/benefits/perks/...]"
  /\b(?:remove|forfeit|give\s+up|drop|lose)\s+my\s+(?:gold|silver|platinum|bronze|vip|pro|premium|plus|elite|membership|benefits|perks|status|rewards|points)\b/i,

  // --- Gamification / streak / progress loss ---
  // Duolingo, Habitica, fitness, language, and other gamified apps. "Reset"
  // alone is intentionally excluded — it's a legitimate settings action;
  // require an unambiguous loss verb.

  // "Lose / forfeit / abandon / sacrifice / throw away my streak / progress / XP / ..."
  /\b(?:lose|forfeit|abandon|destroy|sacrifice|throw\s+away|give\s+up)\s+(?:my|all\s+(?:my|of\s+my))\s+(?:streak|progress|xp|points?|coins?|gems?|rank|level|score|badges?|achievements?|stats?|hard[\s-]?earned)/i,
  // "Yes, lose / reset / forfeit my streak / 30 days of progress / XP /
  // ..." — the "yes" affirmative reframes "reset" as confirmshame.
  /\byes,?\s+(?:lose|reset|forfeit|sacrifice)\b.{0,20}\b(?:streak|progress|xp|points?|rank|score|days?|years?|months?)\b/i,

  // --- Imperative self-commands (ordering bad treatment) ---

  // "Make / let / force me [to] pay full / more / extra / retail"
  /\b(?:make|let|force)\s+me\s+(?:to\s+)?pay\s+(?:full|more|extra|retail)\b/i,
  // "Charge me more / extra / full / 20% more / $5 more"
  /\bcharge\s+me\s+(?:more|extra|full|retail|the\s+full|\$\d|\d+\s*%)/i,
  // "Stop helping me save / win / find / ..."
  /\bstop\s+(?:trying\s+to\s+)?help(?:ing)?\s+me\s+(?:save|win|earn|find|get|with)/i,
  // "Don't help me save / win / earn / find / protect"
  /\bdon'?t\s+help\s+me\s+(?:save|win|earn|find|get|protect)\b/i,

  // --- Sarcastic acceptance ---
  // Require the sarcastic opener AND a recognized confirmshame follow-up so
  // bare "Sure" / "Whatever" confirm buttons don't trigger.

  /\b(?:sure|whatever|fine|alright|of\s+course),?\s+(?:charge\s+me|take\s+my\s+(?:money|cash)|i\s+love\s+(?:spam|junk\s+mail|paying|overpaying))/i,

  // --- Reverse-positive ("Yes, [bad outcome]") ---
  // The confirmshame on confirmation dialogs that survives after the
  // upstream modal's decline button was already neutralized. The "yes"
  // makes the bad outcome read as an affirmation.

  // "Yes, skip / forfeit / lose / take away / remove my discount / savings / streak / ..."
  /\byes,?\s+(?:skip|forfeit|lose|take\s+away|remove|cancel|reject)\s+(?:my|the)\s+(?:saving|discount|deal|offer|coupon|reward|points?|streak|progress|benefits?|membership|access)/i,
  // "Yes, pay / charge me / spend full / more / extra / $X / X%"
  /\byes,?\s+(?:pay|charge\s+me|spend)\s+(?:full|more|extra|retail|the\s+full|\$\d|\d+\s*%)/i,
  // "Confirm: pay / skip / forfeit / lose / charge full / more / my / the ..."
  /\bconfirm\s*[:\-—]?\s*(?:pay|skip|forfeit|lose|charge)\s+(?:full|more|extra|my|the)/i,
  // "Yes, place [my] order without my / the discount / coupon / deal"
  /\byes,?\s+place\s+(?:my\s+)?order\s+without\s+(?:my|the)\s+(?:discount|coupon|deal|offer)/i,
];

export function isConfirmshameLabel(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.length > MAX_BUTTON_TEXT_LENGTH) {
    return false;
  }
  return CONFIRMSHAME_PATTERNS.some((pattern) => pattern.test(trimmed));
}

const BUTTON_SELECTOR = [
  "button",
  '[role="button"]',
  'input[type="button"]',
  'input[type="submit"]',
  'input[type="reset"]',
].join(",");

function alreadyRewritten(element: Element): boolean {
  return (
    element.hasAttribute(ORIGINAL_TEXT_ATTR) ||
    element.hasAttribute(ORIGINAL_VALUE_ATTR)
  );
}

function rewriteInput(input: HTMLInputElement): boolean {
  const original = input.value;
  if (!original || !isConfirmshameLabel(original)) {
    return false;
  }
  input.setAttribute(ORIGINAL_VALUE_ATTR, original);
  input.value = NEUTRAL_LABEL;
  return true;
}

function rewriteButtonLike(element: HTMLElement): boolean {
  const text = element.textContent;
  if (!isConfirmshameLabel(text)) {
    return false;
  }
  // Stash the visible text and overwrite via textContent. This drops any
  // nested icons / spans, which is an accepted trade-off — confirmshame
  // buttons are almost always plain text, and teardown restores the text
  // verbatim. Avoiding innerHTML round-trips keeps us off the rule's
  // attack-surface even on adversarial pages.
  element.setAttribute(ORIGINAL_TEXT_ATTR, text);
  element.textContent = NEUTRAL_LABEL;
  return true;
}

function rewriteAttribute(
  element: Element,
  attributeName: string,
  stashAttribute: string,
): void {
  const value = element.getAttribute(attributeName);
  if (value && isConfirmshameLabel(value)) {
    element.setAttribute(stashAttribute, value);
    element.setAttribute(attributeName, NEUTRAL_LABEL);
  }
}

function isConfirmshameCandidate(element: HTMLElement): boolean {
  if (element instanceof HTMLInputElement) {
    return Boolean(element.value) && isConfirmshameLabel(element.value);
  }
  return isConfirmshameLabel(element.textContent);
}

function neutralize(element: HTMLElement): boolean {
  if (alreadyRewritten(element)) {
    return false;
  }
  if (!isConfirmshameCandidate(element)) {
    return false;
  }
  return traceMutation(
    { ruleId: RULE_ID, kind: "sanitize", target: element },
    () => {
      const changed =
        element instanceof HTMLInputElement
          ? rewriteInput(element)
          : rewriteButtonLike(element);
      if (changed) {
        rewriteAttribute(element, "aria-label", ORIGINAL_ARIA_ATTR);
        rewriteAttribute(element, "title", ORIGINAL_TITLE_ATTR);
      }
      return changed;
    },
  );
}

function scanAndNeutralize(root: ParentNode): void {
  let count = 0;
  // querySelectorAll doesn't include the root itself — check it explicitly
  // so a freshly-inserted button-shaped subtree root is handled.
  if (
    root instanceof Element &&
    root.matches(BUTTON_SELECTOR) &&
    neutralize(root as HTMLElement)
  ) {
    count++;
  }
  const candidates = root.querySelectorAll<HTMLElement>(BUTTON_SELECTOR);
  for (const candidate of candidates) {
    if (!candidate.isConnected) {
      continue;
    }
    if (neutralize(candidate)) {
      count++;
    }
  }
  if (count > 0) {
    log.info("confirmshame buttons neutralized", { count });
  }
}

const watcher = createSubtreeWatcher({
  onSubtrees: (roots) => {
    for (const root of roots) {
      scanAndNeutralize(root);
    }
  },
});

function apply(root: ParentNode): void {
  scanAndNeutralize(root);
  watcher.start(root);
}

function restoreOne(element: Element): void {
  const text = element.getAttribute(ORIGINAL_TEXT_ATTR);
  if (text !== null) {
    element.textContent = text;
    element.removeAttribute(ORIGINAL_TEXT_ATTR);
  }
  const value = element.getAttribute(ORIGINAL_VALUE_ATTR);
  if (value !== null && element instanceof HTMLInputElement) {
    element.value = value;
    element.removeAttribute(ORIGINAL_VALUE_ATTR);
  }
  const aria = element.getAttribute(ORIGINAL_ARIA_ATTR);
  if (aria !== null) {
    element.setAttribute("aria-label", aria);
    element.removeAttribute(ORIGINAL_ARIA_ATTR);
  }
  const title = element.getAttribute(ORIGINAL_TITLE_ATTR);
  if (title !== null) {
    element.setAttribute("title", title);
    element.removeAttribute(ORIGINAL_TITLE_ATTR);
  }
}

function restoreAll(): void {
  const rewritten = document.querySelectorAll(
    `[${ORIGINAL_TEXT_ATTR}], [${ORIGINAL_VALUE_ATTR}]`,
  );
  for (const element of rewritten) {
    restoreOne(element);
  }
}

export const confirmshameSanitizeRule = {
  id: RULE_ID,
  label: "Neutralize Confirmshame Buttons",
  description:
    'Rewrite guilt-tripping decline buttons ("No, I\'d rather pay full price") to a neutral "No thanks" so the agent isn\'t pushed away from the decline option by manipulative copy.',
  apply,
  teardown: () => {
    watcher.stop();
    restoreAll();
  },
} satisfies Rule;
