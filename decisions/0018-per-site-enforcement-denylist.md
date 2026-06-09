---
status: proposed
date: 2026-06-09
---

# Per-site enforcement denylist authored from the popup; stored as URL Pattern strings

## Context and Problem Statement

Today the only enforcement scoping a user has is the global on/off toggle
(`enforcement.ts`, spec 0010 FR-5). When a rule misfires on a specific site —
breaks layout, hides content the user actually wants, blocks a workflow — the
choices are:

1. Turn off enforcement globally, lose protection on every other tab.
2. Turn off the offending rule globally from the Options page, lose its
   protection on every other site.
3. Live with the misfire.

Spec 0010 §"Future work" calls out the gap: *"Per-host enable/disable for
specific rules from the popup — only per-host kill-switches today are baked into
rule files."* Peer privacy extensions (uBlock Origin, Privacy Badger, Adblock
Plus, DuckDuckGo Privacy Essentials, Ghostery) all converged on the same
affordance: a one-click *"disable on this site"* toggle in the toolbar popup.
None of them ask the user to author a match pattern; the pattern is inferred
from the active tab's host.

The two open shape questions:

1. **Per-rule on a host, or all rules on a host?** uBO and ABP support per-rule
   exceptions through their full filter syntax (authored in the dashboard, not
   the popup); the popup itself is a single toggle. Privacy Badger and DDG skip
   the per-rule axis entirely.
2. **Storage syntax — URL Pattern, Chrome match-pattern, or hostname strings?**
   The codebase already uses the URLPattern API (`urlpattern-polyfill`) inside
   `lib/checkout-url.ts` and rule-file URL gating, so the same syntax in the
   denylist keeps one matching primitive across the project.

## Decision Drivers

- The user surface that authors the denylist is the popup, not a config file.
  Whatever syntax we store has to be derivable from the active tab URL with no
  user editing on the hot path.
- Power users will look at the Options page to audit what they've disabled and
  occasionally edit a pattern (broaden a host wildcard, drop an entry). The
  syntax must be human-readable when displayed flat.
- The matching primitive should be the same one rule files already use, so there
  is one place to learn URL matching for this codebase
  (`extension/src/lib/checkout-url.ts` already imports `urlpattern-polyfill`).
- The denylist's effective behaviour must compose cleanly with the existing
  global enforcement toggle (spec 0002 FR-14): global-off remains the master
  kill-switch; the denylist is a per-tab refinement evaluated only when global
  enforcement is on.
- Per-rule per-host control is **out of scope for this ADR**. Privacy Badger and
  DDG ship without it; the popup affordance reduces to a single toggle and
  storage stays one-dimensional. The "per-rule per-host" future work entry in
  spec 0010 §"Future work" is preserved separately.

## Considered Options

- **A. URL Pattern strings in an array, popup writes `<scheme>://<host>/*`.**
  Storage: `string[]`. Popup *"Disable on this site"* reads the active tab's
  `URL`, writes the scheme-and-host pattern, and adds it to the array.
  *"Re-enable on this site"* removes every pattern in the array that matches the
  active URL.
- **B. Chrome match patterns (`*://*.example.com/*`).** Same array shape, but
  the matcher is the manifest match-pattern grammar (scheme wildcard built in).
  Different syntax from rule files.
- **C. Hostname strings only (`mail.google.com`).** Simplest authoring; cannot
  scope by scheme or path. eTLD+1 vs full hostname becomes an extra question.
- **D. Per-rule per-host map** — `Record<RuleId, string[]>` of patterns per
  rule. Subsumes A but multiplies UI complexity in both popup and Options page.

## Decision Outcome

Chosen option: **A — URL Pattern strings in an array, popup writes
`<scheme>://<host>/*`**.

- Storage shape: `string[]`, persisted under
  `agent-browser-shield.site-denylist` in `chrome.storage.local`. Each string is
  a URL Pattern string accepted by `new URLPattern(string)`.
- Popup affordance: *"Disable on this site"* button writes
  `` `${activeUrl.protocol}//${activeUrl.host}/*` `` to the array — preserving
  scheme and the host as it appears in the URL bar (no eTLD+1 inference, no port
  stripping). Authoring is a single click; the resulting pattern is
  human-readable in the Options-page list.
- Re-enable affordance: when one or more patterns in the denylist match the
  active tab's top-frame URL, the popup shows *"Re-enable on this site"*.
  Clicking it removes **every** pattern from the array whose `URLPattern.test`
  returns true for the active URL. The intent of the click is "I want rules to
  run here"; partial removal would not achieve that. The full list remains
  visible on the Options page for users who want finer control.
- Effective enforcement is computed per tab as:
  `globalEnforcement && !matchesAnyDenylistPattern(topFrameUrl)`. Global
  enforcement (spec 0002 FR-14) remains the master kill-switch; toggling it off
  pauses every tab regardless of the denylist. Toggling it back on restores both
  the per-rule selection and any denylist scoping.
- Matching is evaluated against the **top-frame** URL only. Subframes inherit
  the tab's enforcement state from the background, so a denylisted top-frame
  pauses every frame in the tab. Frame-by-frame matching would create surprising
  splits (e.g., a cross-origin iframe escaping a top-frame denylist) that don't
  match the user's "this site" mental model.
- Validation: invalid patterns are dropped on read (parsed via
  `new URLPattern(string)` in a try/catch), mirroring the silent-degrade
  behaviour of `EXTENSION_DEFAULT_OVERRIDES` (ADR-0009). The popup's add path
  can never produce an invalid pattern because it composes the string from a
  parsed `URL`; the only way to get an invalid entry is hand-editing via the
  export / import round-trip on the Options page, where loud failure is
  appropriate.
- The denylist applies **only to URL-scheme tabs** (http/https/file). For
  `chrome://`, `about:`, `view-source:`, and other non-content tabs the popup
  affordance is shown disabled with a hint; the content script doesn't run on
  those pages anyway.
- Build-time seeding: the build-time overrides file
  ([spec 0011](../specs/0011-build-time-customization.md) FR-3) gains a reserved
  `siteDenylist` key whose value is `string[]`. Each entry must parse via
  `new URLPattern(entry)`; invalid entries fail the build with a path-qualified
  message (spec 0011 FR-4 — loud-failure path). The validated list is injected
  through a new `process.env.EXTENSION_DEFAULT_DENYLIST` define, parallel to
  `EXTENSION_DEFAULT_OVERRIDES`. `site-denylist.ts` reads it at module init and
  feeds it into `siteDenylistStorage`'s `defaultValue`, so it only affects fresh
  `chrome.storage` (spec 0011 FR-6); a user with any entries already in their
  denylist keeps theirs on rebuild. The same `siteDenylist` key round-trips
  through the Options-page *Export configuration* / *Apply configuration* (spec
  0010 FR-10b), so a JSON exported from a tuned extension can be fed straight
  back into the next build.
- Per-rule per-host control is **not** part of this decision. Adding it later
  would change the storage shape to either (D) or a sidecar
  `Record<RuleId, string[]>`; the migration is straightforward (the current
  single-axis denylist becomes the `__all__` row of the per-rule map) and is not
  a reason to over-design v1.

### Consequences

- Good, because the popup gets the affordance users expect from privacy
  extensions: one click to scope an exception to the site they're on, one click
  to undo it.
- Good, because the URL Pattern matcher is already in the codebase
  (`urlpattern-polyfill` in `package.json`, `lib/checkout-url.ts` uses it); no
  new dependency, no new matching grammar to learn.
- Good, because the Options-page surface (list of patterns with a remove button
  each, optional add-by-pattern input for power users) is a straightforward
  render of `string[]` plus an audit affordance — it surfaces exactly what is
  enforced, no derived state to reconcile.
- Good, because the denylist composes orthogonally with the existing global
  enforcement toggle: global-off still wins, and the per-rule selection
  preserved by spec 0002 FR-14 is untouched.
- Neutral, because matching is host-and-scheme specific by default. A user who
  disables on `https://mail.google.com/*` and then visits
  `https://docs.google.com` is not covered — the popup will offer *"Disable on
  this site"* again. This matches uBO's hostname-default; power users who want a
  wildcard subdomain pattern (`https://*.google.com/*`) can author it in the
  Options page.
- Neutral, because the denylist applies to the whole rule set, not per rule. A
  user with one specific rule misfiring on a site has to either accept the
  trade-off (silence every rule there) or globally disable just that rule. The
  per-rule-per-host gap remains as future work; this ADR addresses the
  common-case "ABS is breaking this site, get it off this site only."
- Bad, because http vs https are stored as separate entries when the user wants
  both. The popup defaults to the scheme of the active tab; if the user needs
  both they author the second entry by visiting the other-scheme URL once or
  editing the pattern in Options. We chose this over Chrome match-pattern syntax
  to stay consistent with the rest of the codebase (driver: same matching
  primitive everywhere).
- Bad, because re-enable removes *every* matching pattern. A user who has both
  `https://*.example.com/*` and `https://mail.example.com/*` in the denylist,
  viewing `https://mail.example.com`, will lose both when they click *"Re-enable
  on this site"*. The Options-page list mitigates this: the user can see exactly
  what they had and re-add what they want. The alternative (asking the user to
  disambiguate) negates the one-click affordance the popup is built around.

### Confirmation

- A new `extension/src/lib/site-denylist.ts` exposes `siteDenylistStorage` (a
  `chrome-storage-value` of `string[]`) plus `matchesDenylist(url, patterns)`
  and `addHostPattern(url)` / `removeMatchingPatterns(url)` helpers. The
  storage's `normalize` drops entries that fail `new URLPattern(entry)` so a
  corrupted store can't crash consumers.
- `extension/src/popup/Popup.tsx` gains a *"Disable on this site"* / *"Re-enable
  on this site"* control that reads the active tab URL, calls `URLPattern` for
  the current-tab match check, and toggles the storage. The control is disabled
  (with a hint) on non-URL-scheme tabs.
- `extension/src/options/Options.tsx` gains a *Sites with enforcement disabled*
  section listing every pattern with a *Remove* button per entry and an *Add
  pattern* input that validates against `new URLPattern(input)` before saving.
- `extension/src/lib/rule-engine.ts` reads its effective enforcement state from
  a per-tab derived signal (background-computed) instead of directly subscribing
  to `enforcementStorage`. The background module `extension/src/background.ts`
  subscribes to both `enforcementStorage` and `siteDenylistStorage`, recomputes
  per-tab enforcement on `chrome.tabs.onUpdated`, and pushes the per-tab boolean
  to content scripts via `chrome.tabs.sendMessage` or a per-tab session-storage
  entry the content scripts subscribe to (implementation choice deferred to PR).
- A property test (per the project's "include property tests for rule matchers"
  guideline) exercises `matchesDenylist` against arbitrary URLs and patterns to
  assert: a pattern derived from a URL via `addHostPattern` always matches that
  URL; removing every matching pattern leaves no pattern matching the URL.
- The build-time loader (`extension/scripts/load-default-overrides.ts`)
  validates `siteDenylist` entries — every entry must parse via
  `new URLPattern(entry)`; build fails with a path-qualified message otherwise.
  Tested in `extension/scripts/__tests__/load-default-overrides.test.ts` with a
  valid list, an invalid-pattern entry, and a non-array value.

## Pros and Cons of the Options

### A. URL Pattern strings, scheme-and-host inferred from active tab (chosen)

- Good, because the matcher is already in the codebase; one matching primitive
  across rule files, checkout-URL gating, and the denylist.
- Good, because the storage shape is a flat array — trivially auditable on the
  Options page, trivially export/importable.
- Good, because the popup affordance is a single click; the user is never asked
  to author a pattern.
- Bad, because scheme-and-host specificity means http/https and
  subdomain-vs-eTLD+1 expansions require power-user editing in Options.

### B. Chrome match patterns

- Good, because the `*://` scheme wildcard handles http+https in one entry,
  closer to user intent.
- Bad, because the codebase has no match-pattern matcher today — every other URL
  gate uses URLPattern. Introducing a second grammar splits the mental model for
  rule authors.
- Bad, because match patterns have well-known asymmetries (`*` matches the whole
  host, not a label; `*.example.com` doesn't match `example.com`) that generate
  support questions. URLPattern's behaviour is closer to what users expect.

### C. Hostname strings only

- Good, because authoring is the simplest possible — a string the user can read
  off the URL bar.
- Bad, because there's no way to scope by path or scheme. A user who wants ABS
  off on `example.com/admin` but on everywhere else can't express that even at
  the Options-page level.
- Bad, because it diverges from the matching primitive used elsewhere in the
  codebase, forcing a parallel matcher.

### D. Per-rule per-host map

- Good, because it subsumes the v1 affordance and adds the per-rule axis uBO and
  ABP support.
- Bad, because the popup affordance grows from "one toggle" to "one toggle per
  rule on this site" — a control surface the popup doesn't have room for, and
  which peer extensions reserve for their full dashboard.
- Bad, because most user reports of "ABS is breaking this site" want the whole
  shield off here, not a rule-by-rule audit. Solving the common case first and
  adding the per-rule axis later as additive future work is the right sequence.

## More Information

- Spec
  [0010 — Extension UI and controls](../specs/0010-extension-ui-and-controls.md)
  §"Future work" — the gap this ADR fills.
- Spec [0002 — Rule engine](../specs/0002-rule-engine.md) FR-14 — the existing
  global enforcement kill-switch the denylist composes with.
- ADR-0009 — the build-time override loader's silent-degrade behaviour, which
  `siteDenylistStorage.normalize` mirrors on read.
- `extension/src/lib/checkout-url.ts` — existing URLPattern usage in the
  codebase, demonstrating the matching primitive this ADR adopts.
- `extension/src/lib/enforcement.ts` — the existing global enforcement storage;
  the denylist is stored separately so toggling enforcement on/off doesn't churn
  the denylist listener path (mirrors the same split between enforcement and
  rule states).
- Privacy Badger source (`pb-storage.ts`, `disabled-sites`) — the closest
  peer-extension analogue: per-site list, host-keyed, single toggle in the
  popup.
