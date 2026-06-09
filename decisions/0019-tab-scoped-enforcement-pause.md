---
status: proposed
date: 2026-06-09
---

# Tab-scoped, non-persistent enforcement pause for fast recovery

## Context and Problem Statement

When a rule blanks content the user actually wants, the recovery paths today are
both bad:

1. Hunt for the per-element click-to-reveal placeholder — fine for one element,
   useless when a rule ate a whole region or the page needs many reveals.
2. *Disable on this site* (FR-7a,
   [ADR-0018](./0018-per-site-enforcement-denylist.md)) — writes a **permanent**
   denylist entry to `chrome.storage.local`. A daily driver who just wants to
   get through one checkout ends up with a denylist entry they will never clean
   up, silently unprotected on that site forever.

There is no "reveal this page now" panic button and no "let me through for the
next 15 minutes" snooze. Both are table-stakes affordances for a defensive
extension that wants to stay installed (spec 0010's framing: *"the shield broke
my page" turns into "I uninstalled the shield"*).

The shape questions:

1. **Where does the pause state live**, given it must be tab-scoped, survive an
   MV3 service-worker eviction, but vanish on browser restart with zero cleanup
   debt — and be readable by the toolbar (background) and popup, and
   *actionable* by content scripts that can't read it directly?
2. **How does a timed snooze end** without yanking content back while the user
   is mid-task?
3. **How is the reveal actually performed** — new code, or can it reuse the
   existing global-enforcement teardown?

## Decision Drivers

- Recovery must be **distinct from** the persistent denylist: tab-scoped, and
  forgotten on its own (on navigation, on expiry, on tab close, on browser
  restart) so it never becomes stale unprotected state.
- The reveal must be the same observable behaviour as turning enforcement off,
  so there is one teardown path to reason about and test.
- A timed snooze expiring must not surprise the user by re-hiding content they
  are looking at; protection should come back on the next page, not mid-page.
- Reuse the storage primitive the codebase already standardizes on
  (`webext-storage`) rather than hand-rolling `chrome.storage` access.
- No new permissions, no new background machinery (alarms) unless a requirement
  genuinely needs them.

## Considered Options

### State location

- **A. `chrome.storage.session` via webext-storage `StorageItemMap`, keyed by
  tabId.** Durable across SW restarts, auto-cleared on browser restart. Popup
  and background read/write directly; content scripts reached by message.
- **B. In-memory `Map` in the background worker.** Simplest, but an MV3 service
  worker is evicted aggressively — a pause would silently drop on the next
  eviction, un-revealing a page the user paused.
- **C. `chrome.storage.local` with manual cleanup.** Persists across browser
  restart, reintroducing exactly the stale-state problem the denylist already
  has and this feature is trying to avoid.

### Snooze expiry

- **D. Lazy expiry + content-side latch.** Liveness is `expiresAt > now`,
  evaluated at content-script init. A timed expiry produces no event; the open
  page stays revealed until its next navigation re-reads fresh state.
- **E. `chrome.alarms` at the deadline.** Fires an event that re-enforces the
  open page immediately — accurate to the second, but re-hides content mid-task
  and needs the `alarms` permission.

### Performing the reveal

- **F. Third input to `effective-enforcement.ts`.** The pause joins
  `global && !denylist` as a third factor; when it flips the boolean false the
  rule engine already runs `revealAll(ruleId)` + `teardown()` for every rule.
- **G. Bespoke "reveal everything" routine in the content script.** Duplicates
  the teardown logic the engine already has on the enforcement-off path.

## Decision Outcome

Chosen: **A + D + F.**

- **Storage (A).** A `webext-storage` `StorageItemMap<TabPause>` on
  `area: "session"` under `agent-browser-shield.tab-pause`, secondary key =
  `String(tabId)`.
  `TabPause = { scope: "page" | "tab"; expiresAt: number | null }`.
  - *Reveal everything on this page* → `{ scope: "page", expiresAt: null }`.
  - *Pause for this tab* → `{ scope: "tab", expiresAt: null }`.
  - *15 min* / *1 hour* → `{ scope: "tab", expiresAt: Date.now() + ms }`.
  - `isPauseActive(pause, now)` = pause exists AND (`expiresAt` null OR
    `> now`). A malformed `expiresAt` resolves to not-active (fail-open to
    protected).
- **Scope semantics.** `page` is the panic button: cleared on the tab's next
  top-frame navigation. `tab` survives navigation within the tab (so a
  multi-page checkout stays unblocked) until `expiresAt` or tab close.
- **Expiry (D).** Liveness is computed lazily from `expiresAt`; there are **no
  alarms**. The content script seeds `cachedTabPaused` at rule-engine init and
  thereafter only changes it on an explicit popup edit (a `tab-pause-changed`
  push). A *timed* expiry writes nothing and pushes nothing, so the open page
  stays revealed until its next navigation re-reads fresh state at init — this
  is the "resume on next navigation" behaviour (FR-7g). *Manual* "Resume now"
  does write (a `remove`), so it re-enforces the open page immediately, which is
  the desired confirmation of a deliberate action.
- **Reveal (F).** The pause is a third input to `effective-enforcement.ts`:
  `global && !denylist && !tabPaused`. Flipping it false routes through the
  engine's existing `subscribeEffectiveEnforcement → reconcile` path, which
  calls `revealAll(ruleId)` + `rule.teardown()` per rule. No new reveal code.
- **Content bridge.** Content scripts can't read the `session` area, and —
  unlike the denylist, which they match by URL — a pause is keyed by a tabId
  they don't know. So the background resolves it: a `get-tab-pause` message at
  init returns the resolved boolean for `sender.tab.id`, and the background
  pushes `tab-pause-changed` (carrying the resolved boolean) to every frame in
  the tab whenever the map changes. The popup and background, being privileged
  contexts, read/write the map directly — mirroring the denylist flow (popup
  writes storage; background reacts via `onChanged`).
- **Lifecycle clearing.** The background clears a tab's entry on tab close
  (`tabs.onRemoved`), clears `page`-scoped entries and reaps expired entries on
  top-frame navigation (`tabs.onUpdated` loading), and keeps an in-memory
  `tabPauses` cache (hydrated from the map at startup, kept current via
  `onChanged`) so `refreshBadge` stays synchronous.
- **Toolbar.** `ProtectionState` gains a `"paused"` reason → the existing greyed
  icon + `off` badge (FR-2a), tooltip *"protection paused on this tab"*. A
  denylisted-and-paused tab reports the more durable `site` reason; in practice
  the popup only offers the pause when the tab isn't denylisted, so they don't
  overlap.
- **No new permissions.** `chrome.storage.session` is covered by the existing
  `storage` permission; no `alarms`.

### Consequences

- Good, because the reveal is literally the enforcement-off teardown scoped to a
  tab — one code path, already tested, no duplicate "reveal everything" routine.
- Good, because `session` storage gives exactly the desired lifetime: survives
  SW eviction (so a paused page doesn't silently re-hide), auto-cleared on
  browser restart (so there is no persistent stale-state debt, unlike the
  denylist).
- Good, because dropping `chrome.alarms` removes a permission and a moving part;
  lazy expiry is sufficient and gives the resume-on-next-navigation UX for free.
- Good, because the storage primitive is the one the codebase already uses
  (`StorageItem` is wrapped in `chrome-storage-value.ts`; `StorageItemMap` is
  the keyed sibling), so there's no hand-rolled `chrome.storage.session`
  plumbing.
- Neutral, because a still-open page can briefly disagree with the toolbar after
  a timed expiry: the page stays revealed (by design) while the toolbar, next
  time `refreshBadge` runs, computes the pause as expired and flips back to
  protected. The next navigation reconciles them. This is the accepted cost of
  resume-on-next-navigation.
- Neutral, because the content bridge is message-based rather than a pure
  storage subscription (as the denylist is). The asymmetry is forced: content
  scripts can't observe `session` and don't know their tabId. Considered
  `chrome.storage.session.setAccessLevel(TRUSTED_AND_UNTRUSTED_CONTEXTS)` to let
  content read the map directly and rejected it — content would *still* need a
  round-trip to learn its tabId, so the message is unavoidable either way, and
  the access-level change widens session exposure for no benefit.
- Bad, because there is a small race: a popup edit that lands in the narrow
  window between a content script starting and its `initEffectiveEnforcement`
  resolving (when the `tab-pause-changed` listener is registered) is missed. The
  init fetch already captured the latest state, and the next edit or navigation
  reconciles, so the window is both narrow and self-healing.

### Confirmation

- `extension/src/lib/tab-pause.ts` exports the `StorageItemMap<TabPause>`
  (`area: "session"`), the snooze presets, and a pure
  `isPauseActive(pause, now)` — the latter covered by `tab-pause.test.ts` and a
  `fast-check` `tab-pause.property.test.ts` (deadline-vs-now invariant), per the
  project's "include property tests for matchers" guideline.
- `extension/src/lib/effective-enforcement.ts` adds `cachedTabPaused` as a third
  factor, seeded via `get-tab-pause` and updated via `tab-pause-changed`.
- `extension/src/lib/toolbar-protection.ts` adds the `"paused"` reason;
  `toolbar-protection.test.ts` asserts the new state, title, and appearance key.
- `extension/src/background.ts` mirrors the map into a `tabPauses` cache,
  bridges `onChanged` to the tab's frames, answers `get-tab-pause`, and clears
  entries on navigation / tab close.
- `extension/src/popup/RecoverySection.tsx` + `use-tab-pause.ts` render the
  panic button, the three snooze presets, and the active-pause status with a
  live countdown and *Resume now* — writing `tabPauseMap` directly, the way
  `SiteDisableSection` writes `siteDenylistStorage`.
- `extension/src/__test-mocks__/webext-storage.ts` gains an in-memory
  `StorageItemMap` stub so background/popup map code round-trips under Jest.

## Pros and Cons of the Options

### A. `chrome.storage.session` `StorageItemMap` (chosen)

- Good, survives SW eviction; auto-cleared on browser restart; keyed-map API
  already in the dependency.
- Bad, content scripts can't read it — needs the background bridge.

### B. In-memory background `Map`

- Good, trivial.
- Bad, MV3 evicts the worker; a paused page would re-hide on the next eviction.

### C. `chrome.storage.local`

- Good, survives everything.
- Bad, survives *too much* — reintroduces the persistent stale-unprotected-state
  problem this feature exists to avoid.

### D. Lazy expiry + latch (chosen)

- Good, no permission, no alarm; gives resume-on-next-navigation for free.
- Bad, brief toolbar/page disagreement after expiry until the next refresh.

### E. `chrome.alarms` at the deadline

- Good, second-accurate resume.
- Bad, needs the `alarms` permission and re-hides content mid-task — the
  surprise the chosen design specifically avoids.

### F. Third input to effective enforcement (chosen)

- Good, reuses the engine's reveal-all + teardown; nothing new to test.
- Bad, couples recovery to the enforcement signal — acceptable, since "reveal
  everything" *is* "enforcement off, for this tab".

### G. Bespoke reveal routine

- Bad, duplicates the teardown the engine already performs on enforcement-off,
  with a second code path to keep in sync.

## More Information

- Spec
  [0010 — Extension UI and controls](../specs/0010-extension-ui-and-controls.md)
  FR-7e–FR-7h (this feature), FR-2a (toolbar paused state), FR-5 (the global
  kill-switch whose teardown path this reuses).
- [ADR-0018](./0018-per-site-enforcement-denylist.md) — the *permanent* per-site
  denylist this feature is deliberately distinct from, and whose popup
  write-through-storage pattern it mirrors.
- [ADR-0007](./0007-scrub-instead-of-detach-for-framework-dom.md) — why reveal
  is non-destructive (the original node is preserved), which is what makes a
  reveal-everything pass safe.
- `extension/src/lib/chrome-storage-value.ts` — the existing `StorageItem`
  wrapper; `StorageItemMap` is the keyed sibling used here.
- `extension/src/lib/effective-enforcement.ts` — the composition point the pause
  plugs into as a third factor.
