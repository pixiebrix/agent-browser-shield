// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Clear `value` on `<input type="hidden">` whose `name` matches a
// curated affiliate / UTM / referral attribution allowlist on checkout
// pages, so the agent doesn't silently submit third-party attribution
// metadata that routes commission or biases downstream pricing.
//
// Scope is attribution only — `promo` / `coupon` / `discount` names
// are intentionally NOT in the allowlist. Hidden promo-code inputs
// commonly carry a legitimate user-acquired discount (email promo
// link, sticky session promo, "apply coupon" UI that writes to a
// hidden field at submit time), and clearing them would silently
// strip the user's discount with no visible recourse. Attribution
// (UTM, gclid, affiliate refs) has the opposite asymmetry: clearing
// it is invisible to the user and only costs the marketing trail.
// See PR #188 for the discussion.
//
// Companion to `form-prefill-annotate` (issue #121): annotation is the
// wrong tool for hidden inputs — the value is submitted regardless of
// any chip, and the agent never reads hidden inputs into a snapshot.
// Sanitize-and-forget is the only useful action.
//
// Posture is intentionally narrow:
//   - Allowlist-only — anything outside the curated affiliate set is
//     preserved. The set is short enough to property-test exhaustively.
//   - Hard denylist on top — CSRF / session / cart / order / nonce /
//     state / signature shapes are never cleared even if they slip past
//     the allowlist by name overlap. Failure mode for those is a
//     silently-rejected submit (worse than the original dark pattern).
//   - URL gate via `isCheckoutUrl` — never fires off checkout-shape
//     paths.
//   - Form-scoped — the input must live inside an enclosing `<form>`.
//     Hidden inputs floating outside forms are JS-only data carriers
//     for tracking pixels; clearing them risks breaking the page's own
//     analytics without changing what the agent submits (the agent
//     submits via the form anyway).
//   - Per-host kill-switch (empty at launch) for known loyalty / Apple
//     Pay / 1-Click flows where saved attribution is the user intent.
//
// Set-once semantics: when we clear a value we stamp the input with
// `CLEARED_ATTR`. We do NOT observe attribute mutations, so a page
// script that re-writes the value after our scan keeps the new value.
// That's intentional — getting into a re-clear fight loop with the
// page's own JS would be worse than the original dark pattern.

import { isCheckoutUrl } from "../lib/checkout-url";
import { HIDDEN_AFFILIATE_CLEARED_ATTR as CLEARED_ATTR } from "../lib/dom-markers";
import { createRuleLogger } from "../lib/log";
import { createScanRule } from "../lib/scan-rule";
import { traceMutation } from "../lib/trace-mutation";

const RULE_ID = "hidden-affiliate-sanitize" as const;
const log = createRuleLogger(RULE_ID);

// Curated attribution name patterns. Whole-name regex match against
// `input.name` (case-insensitive). Each entry pulls double duty in the
// property tests as both a positive example and an invariant input.
// Additions go through PR review — keep the set tight so the surface
// stays small enough to reason about and so we can property-test
// exhaustively against the denylist.
//
// Attribution only — patterns that could carry a legitimate
// user-acquired discount (`promo`, `coupon`, `discount`, `promotion`)
// are intentionally absent. See the file header.
//
// Trailing/leading word-boundary classes (`[_-]?id`) capture common
// suffix conventions:
//   - `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`
//   - `aff`, `aff_id`, `affid`, `affiliate_id`
//   - `ref`, `referrer`, `ref_id`, `refid`, `referral_code`
//   - `source_id`, `campaign_id`, `partner_code`
//   - `click_id`, `gclid`, `fbclid`, `msclkid`
const AFFILIATE_NAME_RE = new RegExp(
  [
    `^utm[_-]?(?:source|medium|campaign|term|content|id)$`,
    `^aff(?:[_-]?(?:id|iliate|iliate[_-]?id))?$`,
    `^affiliate[_-]?(?:id|code|source)?$`,
    `^ref(?:[_-]?(?:id|code|errer|erral|erral[_-]?code))?$`,
    `^referr?al[_-]?(?:id|code|source)?$`,
    `^source[_-]?(?:id|code)$`,
    `^campaign[_-]?(?:id|code|source)$`,
    `^partner[_-]?(?:id|code|source)$`,
    `^click[_-]?id$`,
    `^gclid$`,
    `^fbclid$`,
    `^msclkid$`,
  ].join("|"),
  "i",
);

// Hard denylist: never clear these names, even if the allowlist would
// match. Failure mode for CSRF / session / cart / order / nonce / state
// / signature is a silently-rejected submit — worse than the original
// dark pattern. Substring-match by design: any input whose name
// contains `signature`, `csrf`, `nonce`, `session`, etc. is a security
// primitive we must not touch even if a future allowlist addition
// happens to name-overlap (e.g. a hypothetical `affiliate_nonce` would
// be caught by the `nonce` substring).
//
// Token boundary uses `[^A-Za-z]` (not `\b`) because hidden-input
// names commonly use snake/kebab/leading-underscore (`_csrf`,
// `csrf-token`, `__authenticity_token`) where `\b` doesn't fire — `_`
// is a JS word character.
const DENY_TOKENS: readonly string[] = [
  "csrf",
  "nonce",
  "signature",
  "hmac",
  "secret",
  "session",
  "cartid",
  "orderid",
  "antiforgery",
  "authenticity",
  "verification",
  "verify",
  "requesttoken",
  "xtoken",
  // Bare `token` and `state` are listed in `DENY_WHOLE_NAMES` below
  // rather than here — substring "token" is too noisy to substring
  // safely (every framework's CSRF / antiforgery / session-id field
  // ends in `_token`, but so could a benign field name that escapes
  // our review). `tok` is too short to substring safely.
];
const DENY_WHOLE_NAMES: ReadonlySet<string> = new Set([
  "state",
  "token",
  "_token",
  "x_token",
  "x-token",
  "csrf",
  "_csrf",
  "csrf_token",
  "csrf-token",
  "authenticity_token",
  "authenticity-token",
  "cart_id",
  "cart-id",
  "order_id",
  "order-id",
  "session",
  "session_id",
  "session-id",
  "sig",
  "hash",
]);

// Per-host kill-switch — hostnames where saved attribution / referral
// metadata IS the user intent (Amazon 1-Click affiliate flows, Apple
// Pay shopper-id passthroughs, loyalty programs). Empty at launch;
// populate via PR review when real-world activity counts surface a
// host where the affiliate id is load-bearing for the user. Same
// governance posture as `roach-motel-annotate`'s curated list and
// `hidden-fee-annotate`'s host denylist.
const HOST_KILL_SWITCH: ReadonlySet<string> = new Set<string>();

export function isAffiliateName(name: string): boolean {
  return AFFILIATE_NAME_RE.test(name);
}

export function isDenylistedName(name: string): boolean {
  const lower = name.toLowerCase();
  if (DENY_WHOLE_NAMES.has(lower)) {
    return true;
  }
  // Strip non-letter characters for substring search so `_csrf` and
  // `csrf-token` both surface their `csrf` token. We keep the lowered
  // form's separators only as boundary cues for `DENY_WHOLE_NAMES`
  // above.
  const stripped = lower.replaceAll(/[^a-z]/g, "");
  for (const token of DENY_TOKENS) {
    if (stripped.includes(token)) {
      return true;
    }
  }
  return false;
}

// Exported so the property tests can confirm disjointness — no name in
// the affiliate allowlist should also match the denylist, and vice
// versa.
export function shouldClearName(name: string): boolean {
  if (name.length === 0) {
    return false;
  }
  if (isDenylistedName(name)) {
    return false;
  }
  return isAffiliateName(name);
}

function isKillSwitchedHost(href: string): boolean {
  try {
    const parsed = new URL(href);
    return HOST_KILL_SWITCH.has(parsed.hostname);
  } catch {
    return false;
  }
}

// React/Vue track `value` internally; setting `.value` directly skips
// their value-tracker, so any subsequent re-render with the same prop
// would not detect a change. Going through the prototype's native
// setter lets the framework observe the change. Same pattern as
// `checkout-checkbox-sanitize` uses for `checked`.
//
// Resolved lazily on first `apply` so this module is safe to import in
// DOM-less contexts (service worker, codegen). Touching
// `HTMLInputElement.prototype` at module top level would crash the
// background-worker bundle — see scripts/check-background-purity.ts.
let cachedNativeValueSetter:
  | ((this: HTMLInputElement, value: string) => void)
  | null
  | undefined;

function getNativeValueSetter():
  | ((this: HTMLInputElement, value: string) => void)
  | null {
  if (cachedNativeValueSetter !== undefined) {
    return cachedNativeValueSetter;
  }
  // `set` is unbound here by design — we invoke it via `.call(input, …)`
  // below so `this` is the input element, not the descriptor.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  cachedNativeValueSetter = setter ?? null;
  return cachedNativeValueSetter;
}

function clearValue(input: HTMLInputElement): void {
  traceMutation({ ruleId: RULE_ID, kind: "sanitize", target: input }, () => {
    getNativeValueSetter()?.call(input, "");
    // No input/change event dispatch. Hidden inputs aren't observed by
    // listeners the user would have wired up for visible-control
    // interactions, and firing one here could trip totals-recalculation
    // handlers that re-fetch attribution from the same source. The
    // agent submits via the form anyway; a downstream listener that
    // genuinely needs the field non-empty will see the cleared value
    // at submit time and can do whatever fallback the page intended
    // for "user didn't come from a tracked source".
    input.setAttribute(CLEARED_ATTR, "");
  });
}

function isFormScopedHidden(input: HTMLInputElement): boolean {
  if (input.type.toLowerCase() !== "hidden") {
    return false;
  }
  // `input.form` is the live association — works for both the
  // enclosing-form case and the `form` attribute pointing at a form id.
  return input.form !== null;
}

function tryClearInput(
  input: HTMLInputElement,
  outcome: { cleared: number; names: string[] },
): void {
  if (input.hasAttribute(CLEARED_ATTR)) {
    return;
  }
  if (!input.isConnected) {
    return;
  }
  if (!isFormScopedHidden(input)) {
    return;
  }
  const name = input.name;
  if (!shouldClearName(name)) {
    // Stamp non-empty-name rejections so re-scans don't re-check the
    // same node. Unnamed hidden inputs we leave unstamped since
    // they're rare and the next scan's no-op cost is negligible.
    if (name.length > 0) {
      input.setAttribute(CLEARED_ATTR, "skipped");
    }
    return;
  }
  // Use the attribute value, not just live `.value`, to detect the
  // "value never set" case where there's nothing to clear and we
  // can short-circuit.
  if (input.value.length === 0) {
    input.setAttribute(CLEARED_ATTR, "already-empty");
    return;
  }
  clearValue(input);
  outcome.cleared++;
  outcome.names.push(name);
}

function scanAndClear(root: ParentNode): void {
  if (!isCheckoutUrl(location.href)) {
    return;
  }
  if (isKillSwitchedHost(location.href)) {
    return;
  }
  const outcome = { cleared: 0, names: [] as string[] };
  // querySelectorAll only walks descendants. When the subtree watcher
  // delivers a single `<input type="hidden">` appended directly to an
  // existing form, the input itself is the root and would slip past
  // the loop below. Check the root explicitly first — same pattern as
  // `attribute-injection-sanitize` and `confirmshame-sanitize`.
  if (root instanceof HTMLInputElement) {
    tryClearInput(root, outcome);
  }
  // The selector keeps the loop body tight by pre-filtering type and
  // CLEARED_ATTR. We still need to re-verify form-scope / denylist /
  // allowlist per element below — those don't translate cleanly to CSS.
  const candidates = root.querySelectorAll<HTMLInputElement>(
    `input[type="hidden"]:not([${CLEARED_ATTR}])`,
  );
  for (const input of candidates) {
    tryClearInput(input, outcome);
  }
  if (outcome.cleared > 0) {
    log.info("hidden affiliate values cleared", {
      count: outcome.cleared,
      names: outcome.names,
      url: location.href,
    });
  }
}

export const hiddenAffiliateSanitizeRule = createScanRule({
  id: RULE_ID,
  scan: scanAndClear,
  label: "Scrub Hidden Affiliate Metadata",
  description:
    "On checkout pages, clear `value` on hidden inputs whose name matches a curated affiliate / UTM / referral attribution allowlist. Promo / coupon / discount names are preserved (legitimate user discount). CSRF, session, cart, order, nonce, signature, and state fields are also preserved.",
});
