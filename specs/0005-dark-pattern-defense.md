---
status: Current
last_reviewed: 2026-06-09
---

# Dark-pattern defense

## Purpose

Block manipulative UI patterns that mislead humans and (sometimes more acutely)
browser-use agents — scarcity, urgency, sneaking, preselection, confirmshaming,
roach-motel signup flows, and nagging. Rules act on the DOM the agent reads
rather than running a heuristic over the rendered pixels.

## User stories

### Human users

- As a **person delegating checkout to an agent**, I want pre-checked add-ons
  cleared, sneaky cart line items flagged, and pre-populated form fields
  surfaced, so that the agent doesn't silently inherit choices I never made.
- As a **person whose subscription is hard to cancel**, I want the agent warned
  at signup time, so that I find out the cancellation path *before* I commit.
- As a **person who clicks decline on a confirmshame button**, I want the agent
  to do the same without being pushed away by guilt-tripping copy.

### AI agents

- As a **browser-use agent on a checkout flow**, I want a `[abs: …]` chip
  appended to add-on line items and drip-pricing fees, so that I can reason
  about which lines to remove rather than treating every chip as legitimate.
- As a **browser-use agent on a signup or subscription page**, I want a
  screen-reader-only landmark carrying a normalized cancellation-difficulty
  grade and the cancel URL, so that I can warn the user before completing
  signup.
- As a **browser-use agent reading scarcity or countdown text**, I want the
  manipulative claim hidden behind a placeholder, so that I'm not pressured into
  faster or worse decisions by fabricated time pressure.
- As a **browser-use agent reading a decline button**, I want the guilt-tripping
  label rewritten to a neutral "No thanks", so that the accessibility-tree
  representation reflects the actual action.

## Functional requirements

### Urgency

- **FR-1.** `countdown-timer-redact` (default **on**) hides running countdown
  timers. Detection snapshots timer-shaped text and confirms the value strictly
  decreased after 1.5s; re-scans on subtree mutations to catch lazy-loaded
  sections. Timers that reset on each tick or render via `<canvas>`/WebGL are
  not detected.

### Scarcity

- **FR-2.** `scarcity-redact` (default **on**) hides scarcity- and
  activity-based urgency messages ("Only 3 left", "Selling fast", "12 viewing
  now"). Out-of-stock indicators and bestseller badges are kept visible because
  they convey real purchaseability or preference information.

### Sneaking

- **FR-3.** `cart-addon-annotate` (default **on**, top-frame only by effect of
  checkout-URL gating) prepends a visible `[abs: likely cart add-on]` chip to
  line items matching common sneak-into-basket patterns (protection plans,
  extended warranties, AppleCare/SquareTrade/Asurion, insurance,
  donation/round-up, gift wrap, carbon offset, shipping/package protection,
  Route, Seel, Navidium, driver tips). The line item is **not** removed.
- **FR-4.** `hidden-fee-annotate` (default **on**) prepends a visible
  `[abs: drip-pricing fee]` chip to order-summary line items whose label matches
  a curated mandatory-fee phrase set and that sit beside a currency amount.
  Layered shape gates: whole-string regex on a small leaf-ish label,
  order-summary ancestor (`<table>`, `[role="region"]` with order-summary
  labeling, `<aside>`/`<section>` with cart-shaped class/id, or
  `schema.org/Order` microdata), adjacent currency amount, and a
  single-item-cart skip (utility-bill portals, court e-filing, DMV). The row is
  **not** removed.
- **FR-5.** `hidden-affiliate-sanitize` (default **on**) clears `value` on
  `<input type="hidden">` whose `name` matches a curated affiliate/UTM/ referral
  attribution allowlist (`utm_source`, `utm_medium`, `utm_campaign`, `aff`,
  `aff_id`, `affiliate_id`, `ref`, `referral_code`, `source_id`, `campaign_id`,
  `partner_code`, `click_id`, `gclid`, `fbclid`, `msclkid`). The input is
  preserved; only the value is cleared.

### Preselection

- **FR-6.** `checkout-checkbox-sanitize` (default **on**) unchecks every
  pre-checked `<input type="checkbox">` on checkout-like URLs (`/cart`,
  `/checkout`, `/basket`, `/bag`, `/payment`, `/order`). The cleared state is
  held against framework re-renders that would otherwise silently restore
  pre-selected values from component state. A genuine user (or WebDriver-driven)
  click releases the lock; programmatic re-checks from the page itself are
  reverted. `role="checkbox"` widgets and radio groups are out of scope.
- **FR-7.** `form-prefill-annotate` (default **on**) prepends a visible
  `[abs: pre-populated …]` chip to form controls shipping with a server-rendered
  default the agent might silently inherit: text / email / tel / number / url
  inputs with a non-empty `value` attribute, `<select>` whose
  explicitly-`selected` option is not the first one, and radio groups with an
  initially-`checked` option. Layered FP gates: recognized autofill
  `autocomplete` tokens skipped, geo `<select>` skipped, focused controls
  skipped, disabled/readonly skipped, per-form chip cap. Required-selection
  radio groups stay submittable. Hidden inputs are out of scope (FR-5 covers
  them).

### Confirmshaming

- **FR-8.** `confirmshame-sanitize` (default **on**) rewrites guilt-tripping
  decline labels to a neutral `No thanks` so the accessibility-tree
  representation reflects the available action. The underlying control is
  preserved; only the visible label and any matching `aria-label` / `title` are
  rewritten. Coverage spans monetary, health and safety, loyalty-downgrade,
  gamified progress-loss, imperative self-commands, sarcastic acceptance, and
  reverse-positive ("Yes, … pay full price") framings. **English-only by
  design.** Plain decline labels are left alone.

### Roach motel

- **FR-9.** `roach-motel-annotate` (default **on**, top-frame only) embeds a
  screen-reader-only landmark on signup, subscription, and checkout pages of
  sites documented to make cancellation difficult. The landmark carries a
  normalized grade (`hard`, `very-hard`, `impossible`), the canonical
  cancel/delete URL when known, and a short note. Two data sources back the
  rule: a hand-curated list under `extension/data/sites/` (FTC-defendant and
  well-documented friction cases) and a vendored JustDeleteMe snapshot
  (`extension/src/rules/justdeleteme.generated.ts`, MIT, Robb Lewis &
  contributors), filtered to `hard`/`impossible` entries and gated to
  signup-shaped pathnames.

### Nagging

- **FR-10.** `newsletter-modal-hide` (default **on**, top-frame only) removes
  interstitial newsletter signup modals that cover the page. Detects
  fixed-position dialogs containing signup language and an email input. Standard
  login modals, paywalls, and small toasts are kept visible.

## Non-functional requirements

- **NFR-S-1.** Annotate-don't-remove for visible content the user has a right to
  see (sneaking, hidden fees, form prefills, roach-motel warnings). Remove only
  when the carrier is itself the dark pattern (scarcity, countdown, newsletter
  modals).
- **NFR-S-2.** Hidden-affiliate sanitization preserves a hard
  CSRF/session/cart/order/nonce/state/signature denylist (`csrf`, `nonce`,
  `signature`, `hmac`, `secret`, `session`, `antiforgery`, etc.) — these win
  over the affiliate allowlist by name shape, because a silently rejected submit
  is strictly worse than the dark pattern. The input must live inside an
  enclosing `<form>` (descendant or `form` attribute reference); free-floating
  hidden inputs are JS-only data carriers we leave alone.
- **NFR-S-3.** Promo/coupon/discount hidden inputs (`promo`, `coupon`,
  `discount_code`, etc.) are intentionally **not** in the affiliate allowlist —
  clearing them would silently strip a user-acquired discount.
- **NFR-O-1.** `roach-motel-annotate` and `webdriver-probe-annotate` are
  surfaced through the popup's *Heads up* card section (spec 0010) in addition
  to the rule-count badge, since site-level context is worth reading per visit.
- **NFR-M-1.** Per-host kill-switches exist for rules with higher false-positive
  risk (`hidden-affiliate-sanitize`, `hidden-fee-annotate`) so a misfire can be
  addressed by PR without a full rule disable.

## Current implementation

- FR-1: `extension/src/rules/countdown-timer-redact.ts`,
  `extension/src/rules/__tests__/countdown-timer-redact.test.ts`.
- FR-2: `extension/src/rules/scarcity-redact.ts`,
  `extension/src/rules/__tests__/scarcity-redact.test.ts`.
- FR-3: `extension/src/rules/cart-addon-annotate.ts`,
  `extension/src/rules/__tests__/cart-addon-annotate.test.ts`.
- FR-4: `extension/src/rules/hidden-fee-annotate.ts`,
  `extension/src/rules/__tests__/hidden-fee-annotate.test.ts`,
  `extension/src/rules/__tests__/hidden-fee-annotate.property.test.ts`.
- FR-5: `extension/src/rules/hidden-affiliate-sanitize.ts`,
  `extension/src/rules/__tests__/hidden-affiliate-sanitize.test.ts`,
  `extension/src/rules/__tests__/hidden-affiliate-sanitize.property.test.ts`.
- FR-6: `extension/src/rules/checkout-checkbox-sanitize.ts`,
  `extension/src/lib/checkout-checkbox-defense-*.ts`,
  `extension/src/rules/__tests__/checkout-checkbox-sanitize*.test.ts`.
- FR-7: `extension/src/rules/form-prefill-annotate.ts`,
  `extension/src/rules/__tests__/form-prefill-annotate*.test.ts`.
- FR-8: `extension/src/rules/confirmshame-sanitize.ts`,
  `extension/src/checkout-checkbox-defense.ts` (page-world wrap),
  `extension/src/rules/__tests__/confirmshame-sanitize.test.ts`.
- FR-9: `extension/src/rules/roach-motel-annotate.ts`,
  `extension/data/sites/*.yaml`,
  `extension/src/rules/justdeleteme.generated.ts`,
  `extension/src/rules/__tests__/roach-motel-annotate.test.ts`.
- FR-10: `extension/src/rules/newsletter-modal-hide.ts`,
  `extension/src/rules/__tests__/newsletter-modal-hide.test.ts`.

## Future work

- `form-prefill-annotate` enhancements tracked in
  [#121](https://github.com/pixiebrix/agent-browser-shield/issues/121):
  optionally include the prefilled value in the chip; synthetic `blur`/`change`
  after annotation; sanitize-mode toggle for `<select>` defaults on
  sneaking-prone fields (shipping speed, tip percent, donation amount, insurance
  plan).
- Localized confirmshame phrasings — English-only today (FR-8); no tracking
  issue.
- Canvas/WebGL countdown timers — not detectable via DOM text snapshot (FR-1);
  fundamental limitation.

## Related

- ADRs: [ADR-0002](../decisions/0002-rule-id-naming-taxonomy.md) (verb taxonomy
  — sneaking uses annotate-not-remove deliberately).
- Docs: [`docs/src/content/docs/rules.md`](../docs/src/content/docs/rules.md)
  §"Dark patterns".
- Specs: [0002](./0002-rule-engine.md),
  [0010](./0010-extension-ui-and-controls.md) (popup *Heads up* section).
