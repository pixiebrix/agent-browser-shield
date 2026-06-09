---
status: accepted
date: 2026-06-02
---

# Re-scan SPA-mutated subtrees via a shared subtree watcher

## Context and Problem Statement

Rules' `apply()` runs once at `document_idle`. Client-side route changes in SPAs
(React Router, Vue Router, etc.) swap subtrees in and out without a new page
load, so anything that only ran in `apply` will never see post-navigation
content — and many target classes (PII, secrets, scarcity badges, hidden text)
are exactly the kind of late-mounted content SPAs are built on (`AGENTS.md`
§"Rule authoring: re-scan SPA mutations").

PR #87 surfaced the gap concretely: "`pii-mask` and `secrets-mask` were the only
DOM-mutating rules without a `createSubtreeWatcher`, so on SPAs they only
scanned the initial `document_idle` snapshot. The demo site's `/checkout` view
(and any client-side route swap) rendered card numbers, SSNs, and API keys that
the rules never saw." (PR #87 §"Summary")

## Decision Drivers

- Late-mounted content (SPAs, infinite scroll) must be covered as reliably as
  initial-render content (PR #87 §"Summary"; `AGENTS.md` §"Rule authoring:
  re-scan SPA mutations").
- The watcher must not loop on its own placeholder insertions (PR #87
  §"Summary": "the rule does not loop on its own placeholder insertion.").

## Considered Options

- Per-rule, ad-hoc `MutationObserver` plumbing.
- Shared `createSubtreeWatcher` factory from
  `extension/src/lib/subtree-watcher.ts`, with `skipPlaceholderSubtrees: true`
  for rules that insert placeholders.

## Decision Outcome

Chosen option: **shared `createSubtreeWatcher`, wired into any rule that mutates
the DOM.** Default to it. "Mirror the pattern used in `pii-redact`,
`secrets-redact`, `scarcity-redact`, `hidden-text-strip`, etc.: a shared
`scanAndX(root)` function called by both `apply` and the watcher's `onSubtrees`,
plus a `teardown` that calls `watcher.stop()`. Skip the watcher only when there
is nothing to re-scan after initial load — e.g., a one-shot landmark injection —
and call that out in a comment." (`AGENTS.md` §"Rule authoring: re-scan SPA
mutations")

`skipPlaceholderSubtrees: true` is the standard option for rules that insert
placeholders, so the watcher does not loop on the rule's own output (PR #87
§"Summary").

### Consequences

- Good, because new DOM-mutating rules default to the shared watcher, which
  makes SPA coverage the floor rather than the ceiling (`AGENTS.md` §"Rule
  authoring: re-scan SPA mutations").
- Good, because the recommendation is captured in `AGENTS.md` so future coding
  agents and contributors find it without searching for a precedent.

### Confirmation

- "Adds lazy-load tests for both rules: masks content appended after `apply`,
  `teardown` stops the observer, and the rule does not loop on its own
  placeholder insertion." (PR #87 §"Summary")
- Manual reproduction documented for the demo site's `/checkout` view (PR #87
  §"Test plan").

## Pros and Cons of the Options

### Per-rule, ad-hoc `MutationObserver`

- Bad, because earlier coverage gaps existed precisely because the two redaction
  rules predated a shared utility (PR #87 §"Summary").

### Shared `createSubtreeWatcher`

- Good, because the placeholder-loop guard, throttling, and other shared
  concerns are implemented once.
- Good, because `AGENTS.md` captures the rule of thumb so future rule authors do
  not rediscover it.

## More Information

- PR
  [#87 — Re-scan SPA-mutated subtrees in pii-mask and secrets-mask](https://github.com/pixiebrix/agent-browser-shield/pull/87)
- [`AGENTS.md`](../AGENTS.md) §"Rule authoring: re-scan SPA mutations"
- Source: `extension/src/lib/subtree-watcher.ts`
- Related: issue
  [#150 — Perf: speed up rule application during fast infinite scroll and SPA route transitions](https://github.com/pixiebrix/agent-browser-shield/issues/150)
  — Tier 1S "Route-change signal" and "Pause-and-batch around route transitions"
  build on this contract.
