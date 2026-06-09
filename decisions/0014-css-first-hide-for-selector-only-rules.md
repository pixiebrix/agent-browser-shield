---
status: accepted
date: 2026-06-05
---

# CSS-first hide for selector-only `removeEntirely` rules

## Context and Problem Statement

The `selector-hide-rule` family's "removeEntirely: true" rules toggled
`display: none` via a JS path: throttled `MutationObserver`, full-document
`querySelectorAll` against the union of selectors, outermost filter, then a
per-element marker write. Issue #150 (Tier 2 #13) proposed lifting static
selectors into an injected stylesheet. PR #173 lifted the first such rule —
`chat-widget-hide` — and introduced a shared helper for the inject-and- adopt
pattern.

## Decision Drivers

- "Each chat widget injection triggered a throttled MutationObserver batch →
  `selectorsFor(url)` → full-document QSA against the union → outermost filter →
  per-element marker checks → inline `display:none` + `HIDDEN_ATTR` write." (PR
  #173 §"Perf characteristics")
- "Stylesheet hides matches as soon as the browser parses them. No observer
  fire, no QSA per batch, no per-element JS. Lazily-injected widgets (HubSpot's
  conversations-embed, Intercom's loader) hide at parse time." (PR #173 §"Perf
  characteristics")
- Issue #150 documents that uBO / AdGuard ExtendedCss / Brave / Ghostery all
  converge on "CSS does the hiding, JS only does dispatch and dynamic
  decoration" (issue #150 §"How major OSS blockers handle this").

## Considered Options

- Keep all selector-hide rules on the JS path.
- Lift every selector-hide rule into CSS at once.
- Lift only rules whose selectors are static (no `candidateFilter`); keep the JS
  path for rules whose hide decision depends on runtime inspection.

## Decision Outcome

Chosen option: **lift static selector-only rules into CSS; `chat-widget-hide` is
the first.**

- `chat-widget-hide` "is the only `removeEntirely: true` rule with **no
  `candidateFilter`** — every selector targets a vendor-specific id, class
  prefix, or iframe attribute (Intercom, Drift, Zendesk, Crisp, Tawk.to,
  HubSpot, Olark, LiveChat, Freshchat, Zopim). That makes it a clean lift into
  pure CSS." (PR #173 §"Why this rule first")
- New shared helper `lib/css-hide-stylesheet.ts` "encapsulates the
  inject-and-adopt pattern that `ads-hide` was previously doing inline." (PR
  #173 §"Summary")
- Stylesheet is also adopted into open shadow roots, satisfying ADR-0008's
  shadow-DOM contract (PR #173 §"Summary").
- "`cookie-banner-hide` and `newsletter-modal-hide` both depend on
  `candidateFilter` (`isOverlay` checks computed position;
  `looksLikeNewsletterModal` checks viewport area + text content + presence of
  an `<input type='email'>`), so they stay on the JS path for now. A follow-up
  could split their vendor-specific selectors out to CSS-first while keeping the
  generic patterns on JS — but it's a per-selector judgment call worth its own
  PR." (PR #173 §"Why this rule first")
- Counting trade-off: `placeholder-count` previously queried
  `.placeholder-class, [data-abs-hidden]`; CSS-first hides set neither. PR #173
  added `registerCssFirstSelectors(union)` so CSS-first hides are counted via
  "one extra `querySelectorAll(union).length` per 250ms throttle window, added
  to the count. Marginal cost, badge stays accurate." (PR #173 §"Counting
  trade-off")
- EasyList (in `ads-hide`) "remains uncounted — that's the existing behavior and
  unchanged here; lifting its 13k selectors into the badge total would be a
  separate decision (the count would dwarf everything else)." (PR #173
  §"Counting trade-off")

### Consequences

- Good, because lazily-injected vendor widgets are hidden at parse time, without
  an observer/QSA cycle (PR #173 §"Perf characteristics").
- Good, because the helper consolidates an inject-and-adopt pattern that
  previously lived inline in `ads-hide` (PR #173 §"Summary").
- Neutral, because the toolbar-badge count is preserved via an added
  union-selector QSA per throttle window (PR #173 §"Counting trade-off").
- Neutral, because future rule lifts to CSS-first are a per-rule judgment: only
  static-selector `removeEntirely` rules qualify; rules with runtime
  `candidateFilter` stay on the JS path until their vendor-specific selectors
  can be split out (PR #173 §"Why this rule first").

### Confirmation

- "Existing `chat-widget-hide.test.ts` rewritten to assert via
  `getComputedStyle().display === 'none'` (and stylesheet injection presence)
  instead of `HIDDEN_ATTR` / inline `display`" (PR #173 §"Test plan").
- Stylesheet adoption into open shadow roots is exercised by the shadow-aware
  subtree watcher's tests (ADR-0008; PR #165 §"What changed").

## Pros and Cons of the Options

### Keep all selector-hide rules on the JS path

- Bad, because each chat widget injection re-enters the observer → QSA → filter
  → marker-write pipeline (PR #173 §"Perf characteristics").

### Lift every selector-hide rule to CSS at once

- Bad, because rules with runtime `candidateFilter` (e.g., `isOverlay`,
  `looksLikeNewsletterModal`) can't be encoded in pure CSS (PR #173 §"Why this
  rule first").

### Lift selector-only rules; keep filtered rules on JS

- Good, because the lift is per-rule and reversible: static selectors get the
  CSS path, filtered ones stay on JS (PR #173 §"Why this rule first").

## More Information

- Issue
  [#150 — Perf: speed up rule application during fast infinite scroll and SPA route transitions](https://github.com/pixiebrix/agent-browser-shield/issues/150)
  — Tier 2 idea #13 "CSS-first hiding for static selectors"
- PR
  [#173 — Perf: CSS-first hide for chat-widget-hide (#150 Tier 2 #13)](https://github.com/pixiebrix/agent-browser-shield/pull/173)
- Source: `extension/src/lib/css-hide-stylesheet.ts`
