---
status: Current
last_reviewed: 2026-06-09
---

# Extension UI and controls

## Purpose

The user-facing surfaces of the extension: the toolbar action with its badge and
popup, the Options page, the optional floating on-page options button, and the
rule-state storage that backs them.

## Problem

A defensive extension has to be transparent and tunable, or it loses the user's
trust the first time it gets in the way. Without a per-tab badge, users can't
tell whether the shield is doing anything. Without a popup that lists which
rules fired and how often, they can't reproduce a complaint to file a bug.
Without fine-grained per-rule toggles backed by persistent storage, "the shield
broke my page" turns into "I uninstalled the shield" — defenses are
all-or-nothing, and users pick "nothing."

## User stories

### Human users

- As a **person who wants to see what the shield did on this page**, I want a
  badge with a per-tab activity count and a popup listing per-rule footprint, so
  that I can verify protection is working at a glance.
- As a **person who can't remember whether I paused the shield here**, I want
  the toolbar icon itself to go grey with an *off* badge when enforcement is off
  — globally or just on this site — so that "am I protected on this tab?" is
  answerable without opening the popup.
- As a **person hitting a false positive**, I want a one-click enforcement pause
  that disables every rule for every tab without losing my per-rule selections,
  so that I can finish my task and restore protection later.
- As a **person whose shield is breaking one specific site**, I want a one-click
  *disable on this site* toggle in the popup that scopes the kill-switch to the
  active tab's host, so that I keep protection everywhere else without editing a
  config file.
- As a **person auditing what I've scoped off**, I want the Options page to list
  every site I've disabled the shield on, with a remove control per entry, so
  that I can see and undo exceptions I no longer want.
- As a **person tuning the rule set**, I want an Options page with each rule's
  label, description, and a toggle, so that I can pick exactly the defenses I
  want.
- As a **person who needs to share configuration with a coworker**, I want to
  export my rule states as JSON and import a JSON string, so that configuration
  is portable across profiles.

### AI agents

- As a **browser-use agent that should not click the floating shield button by
  mistake**, I want the on-page options button off by default on sparse pages,
  so that it doesn't dominate the accessibility tree as a misleading target.
- As a **browser-use agent reading a "Heads up" landmark**, I want site-level
  detection context surfaced separately from per-rule activity counts, so that I
  can act on roach-motel, webdriver-probe, and closed-shadow-root signals at
  decision time.

## Functional requirements

### Toolbar action and badge

- **FR-1.** The toolbar action shows a per-tab badge: a numeric count of the
  cross-frame rule footprint on the active tab. Counts above 999 render as
  `999+`.
- **FR-2.** The badge color encodes detection state. Default blue (`#2563eb`)
  means activity counts only; amber (`#f59e0b`) means the tab has a detection
  worth opening the popup for (roach-motel-annotate, webdriver-probe-annotate,
  closed-shadow-root-annotate). When a detection is present without an activity
  count, the badge text falls back to `!` so the badge stays visible.
- **FR-2a.** The toolbar action reflects per-tab **protection state** so a
  protected page and an unprotected page never look identical. A tab is *off*
  when global enforcement is off (FR-5) **or** the active tab's top-frame URL
  matches the per-site denylist (FR-7c). On an *off* tab the action shows the
  greyed icon variant (`icons/icon-off-*.png`), an `off` badge in neutral grey
  (`#6b7280` — deliberately not the amber detection color, so the three badge
  meanings stay distinct), and a tooltip naming the scope (*"enforcement off
  (all tabs)"* vs *"enforcement off on this site"*). The signal is recomputed
  when enforcement toggles, the denylist changes, or the tab navigates; the
  icon/tooltip are only re-issued when the on/off state flips, while the count
  badge still refreshes on every rule-count message. The greyed icon is the
  primary signal; the badge and tooltip reinforce it.
- **FR-3.** Top-level navigation drops stale per-frame counts so the new
  document starts from zero; content scripts in the new document report fresh
  numbers as rules run.

### Popup

- **FR-4.** The popup renders a master **Enforcement** toggle, a **Site
  disable** control (FR-7a), a **Configure rules** button that opens the Options
  page, a **Heads up** detections section, a **Per-rule activity** section, a
  **Debug trace** toggle, and an **Export** button (visible when the debug-trace
  recorder is on).
- **FR-5.** Toggling enforcement off pauses every rule for every tab. The
  per-rule selection is preserved in `chrome.storage` and restored when
  enforcement turns back on. The popup shows a hint when enforcement is off
  explaining the behavior.
- **FR-6.** The *Heads up* section renders one card per detection surfaced by
  the background worker — roach-motel-annotate's grade and cancel URL,
  webdriver-probe-annotate's capability note, closed-shadow-root-annotate's
  blind-spot note. Detections are cleared when their producing rule is toggled
  off mid-session.
- **FR-7.** The *Per-rule activity* section lists rules whose footprint on the
  active tab is non-zero, sorted by count descending and breaking ties by rule
  ID for stable render across reopens. Rule labels are read from
  `extension/src/popup/rule-labels.ts`, which is kept in lockstep with rule
  labels by the `catalog.test.ts` invariant *"popup labels match each rule's own
  label"*.

### Per-site enforcement denylist

- **FR-7a.** The popup shows a *Disable on this site* button when the active
  tab's top-frame URL is a content scheme (http/https/file) **and** no entry in
  the site denylist matches that URL. Clicking it appends the pattern
  `` `${activeUrl.protocol}//${activeUrl.host}/*` `` to the denylist storage. On
  non-content tabs (`chrome://`, `about:`, `view-source:`) the control is
  rendered disabled with a hint explaining why.
- **FR-7b.** When at least one denylist entry matches the active tab's top-frame
  URL, the popup shows a *Re-enable on this site* button in place of FR-7a.
  Clicking it removes **every** denylist entry whose `URLPattern.test` returns
  true for the active URL. The popup surfaces the count of matching entries
  removed (e.g. *"Removed 2 patterns"*) so a user who had a wildcard plus a
  specific entry knows both were dropped; the Options page (FR-10a) is the place
  to re-add individual patterns.
- **FR-7c.** Effective per-tab enforcement is
  `globalEnforcement && !matchesAnyDenylistPattern(topFrameUrl)`. Global
  enforcement (FR-5 / spec 0002 FR-14) remains the master kill-switch: toggling
  it off pauses every tab regardless of denylist content, and toggling it back
  on restores both per-rule selections and denylist scoping. The denylist
  applies to the whole rule set; per-rule per-host scoping is not in scope (see
  *Future work*).
- **FR-7d.** Matching is evaluated against the **top-frame** URL only, and the
  per-tab effective-enforcement signal is computed in the background worker and
  pushed to every frame in the tab. Subframes inherit the tab's enforcement
  state rather than matching their own URL against the denylist, so a denylisted
  top-frame pauses every frame regardless of cross-origin embedding.

### Options page

- **FR-8.** The Options page renders all rules grouped by category (mirrors
  `rule-groups.ts` and the `docs/src/content/docs/rules.md` taxonomy). Each rule
  shows its label, description, and an enable/disable toggle. Unavailable rules
  show as disabled with the rule's `unavailableReason` text.
- **FR-9.** Per-rule toggles persist in `chrome.storage` under
  `agent-browser-shield.rules`. Defaults come from
  `extension/src/rules/rule-metadata.ts`, optionally layered with build-time
  `EXTENSION_DEFAULT_OVERRIDES`. Build-time overrides only affect fresh
  `chrome.storage`; existing user toggles persist on rebuild.
- **FR-10.** The Options page exposes:
  - **Apply configuration** — paste a JSON object mapping rule IDs to booleans;
    click Apply.
  - **Export configuration** — download the current rule states as
    `agent-browser-shield-config.json`. Export shape matches the build-time
    overrides format so the same JSON works in both places.
  - **Sites with enforcement disabled** — see FR-10a.
  - **Placeholder display** — choose between label and icon-only modes for
    click-to-reveal placeholders. Persisted in storage and applied via the
    `data-abs-placeholder-mode` attribute on `<html>`. Also exposes *Adaptive
    placeholder palette* (default **off**, experimental — defaults and storage
    key may change between releases while the visual heuristic is tuned): when
    on, each placeholder samples its ancestor backgrounds at insert time and
    stamps `data-abs-placeholder-palette="dark"` when the surrounding chrome
    reads dark, so the placeholder stylesheet swaps to a dark stripe palette via
    CSS variables. The toggle's value is also accepted as the
    `placeholderAdaptivePalette` reserved key in the build-time defaults file
    (spec [0011](./0011-build-time-customization.md) FR-3).
  - **On-page options button** — toggle the optional floating shield button.
  - **Inactive tabs** — toggle whether the subtree-watcher keeps observing while
    the tab is hidden.
  - **OpenAI API key** — input for the key that backs
    `irrelevant-sections-redact`. When a key is already bundled at build time
    (`HAS_BUILT_IN_OPENAI_KEY`), the field acts as an override.

### Site denylist on the Options page

- **FR-10a.** The Options page includes a *Sites with enforcement disabled*
  section that:
  - Lists every pattern in the denylist, sorted alphabetically. Each row has a
    *Remove* button.
  - Provides an *Add pattern* input that validates the string with
    `new URLPattern(input)` and rejects invalid entries with a user-visible
    error before saving. Power users can author patterns the popup wouldn't
    write (subdomain wildcards, path scopes).
  - Renders empty-state copy when the denylist has no entries.
- **FR-10b.** The denylist is included in the *Export configuration* JSON
  (FR-10) under a reserved `siteDenylist` key, and *Apply configuration* reads
  the same key. The round-trip preserves both rule states and denylist patterns;
  unknown reserved keys are surfaced with a parse-message rather than silently
  dropped.

### Floating on-page options button

- **FR-11.** The on-page options button (default **off**) renders a floating
  shield in the bottom-right corner of every page. Clicking it opens the
  extension's options page. Default off because on sparse pages (JSON viewers,
  error screens, interstitials) it dominates the accessibility tree and becomes
  a misleading target for browser-use agents.

### Inactive-tab observation

- **FR-12.** `runOnInactiveTabs` (default **off**) controls whether the shared
  subtree-watcher keeps observing while the tab is hidden. Off by default — a
  hidden tab gets no observer callbacks, avoiding work the user can't see.
  Operators flip it on when something else reads the page in the background
  (chat copilots, accessibility-tree agents, sidebar extensions).

### Rule storage and reconciliation

- **FR-13.** Rule states are normalized on read: unknown keys are dropped,
  missing keys default per `rule-metadata.ts` (with overrides layered). The
  `chrome.storage.onChanged` listener fans changes to every subscribed surface —
  the rule engine, the popup, the Options page — via `chrome-storage-value.ts`.
- **FR-14.** The catalog test in `extension/src/rules/__tests__/catalog.test.ts`
  enforces that every rule appears in exactly one group (FR-8 grouping is
  exhaustive and non-overlapping), and that every rule has a popup label
  matching its own `Rule.label`.
- **FR-15.** The site denylist is persisted as a `string[]` under
  `agent-browser-shield.site-denylist` in `chrome.storage.local`. On read,
  entries that fail `new URLPattern(entry)` are dropped silently — mirroring the
  silent-degrade behaviour of the rule-state and build-time-overrides loaders
  (ADR-0009). The popup's write path can never produce an invalid entry because
  it composes the pattern from a parsed `URL`; loud failure belongs on the
  Options-page *Add pattern* input (FR-10a) and on the build-time defaults
  loader (spec 0011).

## Non-functional requirements

- **NFR-U-1.** The popup loads in under one frame on a warm storage read —
  `useChromeStorageValue` reads synchronously from a cached value once the first
  round-trip resolves. A "Loading…" state shows only on the cold first open.
- **NFR-U-2.** The Options page is `open_in_tab: true` so users can keep it
  pinned alongside the page being tuned.
- **NFR-S-1.** The Options page's *Apply configuration* JSON input is parsed via
  `parseConfig` (`extension/src/options/parse-config.ts`), which validates types
  and rejects unknown keys with a user-visible message.

## Current implementation

- FR-1, FR-2, FR-3: `extension/src/background.ts` (`refreshBadge`,
  `recordFrameRuleCounts`, `recordDetection`, `clearTab`).
- FR-2a: `extension/src/lib/toolbar-protection.ts` (pure
  `computeProtectionState` / `actionTitle` / appearance constants, tested in
  `extension/src/lib/__tests__/toolbar-protection.test.ts`),
  `extension/src/background.ts` (`applyProtectionAppearance`, `refreshAllTabs`,
  the `tabUrls` cache, and the enforcement/denylist subscriptions that drive
  it), `extension/icons/icon-off.svg` (rendered to PNGs by
  `extension/scripts/build-icons.ts`).
- FR-4, FR-5, FR-6, FR-7: `extension/src/popup/Popup.tsx`,
  `extension/src/popup/PerRuleCountsSection.tsx`,
  `extension/src/popup/DetectionsSection.tsx`,
  `extension/src/popup/DebugTraceSection.tsx`,
  `extension/src/popup/rule-labels.ts`,
  `extension/src/popup/use-tab-detections.ts`.
- FR-7a, FR-7b, FR-7c, FR-7d: `extension/src/popup/Popup.tsx` (*Disable on this
  site* / *Re-enable on this site* control),
  `extension/src/lib/site-denylist.ts` (storage + `matchesDenylist` matcher),
  `extension/src/background.ts` (per-tab effective enforcement computation +
  broadcast). See
  [ADR-0018](../decisions/0018-per-site-enforcement-denylist.md).
- FR-8, FR-9, FR-10: `extension/src/options/Options.tsx`,
  `extension/src/options/Section.tsx`, `extension/src/options/parse-config.ts`,
  `extension/src/lib/RuleList.tsx`, `extension/src/lib/storage.ts`,
  `extension/src/lib/placeholder-display.ts`,
  `extension/src/lib/placeholder-adaptive-palette.ts`,
  `extension/src/lib/api-key-storage.ts`, `extension/src/options/__tests__/`.
- FR-10a, FR-10b: `extension/src/options/Options.tsx` (*Sites with enforcement
  disabled* section), `extension/src/options/parse-config.ts` (`siteDenylist`
  key in apply/export round-trip).
- FR-11: `extension/src/lib/options-button-toggle.ts`,
  `extension/src/lib/options-badge.ts`.
- FR-12: `extension/src/lib/run-on-inactive-tabs.ts`,
  `extension/src/lib/subtree-watcher.ts`.
- FR-13, FR-14: `extension/src/lib/chrome-storage-value.ts`,
  `extension/src/lib/rule-groups.ts`,
  `extension/src/rules/__tests__/catalog.test.ts`.
- FR-15: `extension/src/lib/site-denylist.ts` (`siteDenylistStorage.normalize`
  drops invalid entries), tested in
  `extension/src/lib/__tests__/site-denylist.test.ts` (alongside a `fast-check`
  property test that round-trips `addHostPattern` / `removeMatchingPatterns`
  against arbitrary URLs).

## Future work

- Detection promotion: when a detection-producing rule is off, surface a hint
  that turning it on would catch this kind of pattern. Not implemented;
  detections only render when their producing rule is on.
- **Per-rule** per-host enable/disable from the popup — the v1 site denylist
  (FR-7a, FR-7c, [ADR-0018](../decisions/0018-per-site-enforcement-denylist.md))
  scopes the whole rule set, not individual rules. A user with one specific rule
  misfiring on a site has to either silence every rule there or globally disable
  just that rule. Per-host kill-switches *baked into* specific rule files
  (`hidden-affiliate-sanitize`, `hidden-fee-annotate`) remain independent of the
  user-facing denylist.

## Related

- ADRs: [ADR-0009](../decisions/0009-rule-defaults-and-build-time-overrides.md),
  [ADR-0013](../decisions/0013-background-worker-purity-canary.md),
  [ADR-0018](../decisions/0018-per-site-enforcement-denylist.md).
- Docs:
  [`docs/src/content/docs/install.md`](../docs/src/content/docs/install.md)
  §"Customizing defaults at build time".
- Specs: [0002](./0002-rule-engine.md),
  [0008](./0008-cross-origin-and-shadow-dom.md),
  [0011](./0011-build-time-customization.md), [0012](./0012-debug-trace.md).
