---
status: Current
last_reviewed: 2026-06-09
---

# Debug trace

## Purpose

A dev-mode recorder that captures every rule-driven mutation (selector, kind,
before/after `outerHTML`, segment id) and persists it to IndexedDB so operators
and rule authors can investigate **false positives** — "the shield hid, masked,
or rewrote something it shouldn't have." Off by default; retrieved via the
popup's *Export* button or, for CDP-driven harnesses, via
`window.__abs_dumpTrace()`.

## Problem

Rules that hide, mask, or rewrite page content fail in two directions: they can
cross-fire on legitimate content (false positive — the user notices something
missing), or they can miss real injections (false negative — the agent quietly
follows attacker text). Without a per-rule trace of "what selector matched, on
which element, with what text before and after," neither failure mode is
actionable: users can't reproduce reports beyond "the shield ate my form," and
rule authors can't tell a tunable heuristic from a hard bug. The trace turns
vague reports into evidence.

## User stories

### Human users

- As a **person who reported "the page looks broken"**, I want to dump a JSONL
  trace and replay the recorded `outerHTML` before/after pair on a clean page,
  so that the false positive is reproducible without me needing to re-stage the
  bug.
- As a **rule author tuning a new pattern**, I want a footprint report of every
  selector match the rule made on a page, so that I can decide whether the
  rule's scope is right before merging.

### AI agents

- As a **CDP-driven harness operator (Browserbase, Hermes, browser-use,
  OpenClaw)**, I want a build-time-default option for `debugTrace: true`, so
  that every session ships with the recorder on without a human flipping a
  per-session toggle.
- As a **Playwright or raw-CDP client**, I want to retrieve the trace mid-flow
  via `Runtime.evaluate("(async () => await window.__abs_dumpTrace())()")`, so
  that I can pull the record without driving the popup UI.

## Functional requirements

### Recorder

- **FR-1.** The recorder is **off by default**. Three paths turn it on for the
  lifetime of `chrome.storage`:
  1. Build-time default `debugTrace: true` in an overrides file (spec
     [0011](./0011-build-time-customization.md), FR-3).
  2. Popup toggle in the *Debug trace* section.
  3. Programmatic `chrome.storage` write (used in tests).
- **FR-2.** When the recorder is on, every rule-driven mutation is appended to
  the IndexedDB store via the background worker. Each record carries the `tabId`
  and `frameId` it was recorded against.
- **FR-3.** The store caps each tab at **2000 events**; older events are dropped
  first.

### Event schema

- **FR-4.** Each record matches the schema at
  [`extension/data/debug-trace.schema.json`](../extension/data/debug-trace.schema.json).
  The `type` discriminator picks one of three shapes:
  - **`segment`** — bookkeeping marker emitted at initial load, route changes,
    modal opens, and large mutation bursts. Subsequent rule-application entries
    carry the active segment id so consumers can group events by user-visible
    phase.
  - **`rule-application`** — a single rule-driven mutation. Carries the rule ID,
    mutation kind (`hide` / `mask` / `strip` / `sanitize` / `flag` / `embed`),
    the matched selector, and `outerHTML` before/after the mutation. CSS-only
    matches (a rule installed a stylesheet but didn't write to the element) set
    `cssOnly: true` and have identical before/after HTML.
  - **`navigation`** — emitted by the background service worker on every
    top-level loading transition. Lets a single trace span multiple page loads
    in the same tab.

### Retrieval — popup Export

- **FR-5.** When the recorder is on, the popup shows an **Export** button in the
  *Debug trace* section. Clicking it downloads a JSONL file with one stored
  event per line, ordered chronologically across all frames for the active tab.

### Retrieval — CDP bridge

- **FR-6.** When the recorder is on and the background worker has registered the
  page-world bundle, `window.__abs_dumpTrace()` is exposed on the **top frame's
  MAIN world**. The async function returns the same stored-event shape as the
  JSONL export, scoped to the calling tab.
- **FR-7.** The bridge is exposed only on the top frame; the response includes
  events from every frame on the tab (each carries its `frameId`), so a CDP
  caller asking from the top frame sees the full picture across subframes.
- **FR-8.** Pages already open when the popup toggle flips need a reload before
  the `window.__abs_dumpTrace()` bridge appears — the dynamic content-script
  registration only takes effect on subsequent navigations. Builds with
  `debugTrace: true` register the bundle at startup so this caveat doesn't
  apply.

### Lifecycle

- **FR-9.** Navigation does **not** clear the trace; instead a `navigation`
  event is appended so a single export can span multiple page loads in the same
  tab. Navigation entries are gated on the same recorder toggle that gates
  content-script emission.
- **FR-10.** Closing a tab clears its trace data from IndexedDB.

## Non-functional requirements

- **NFR-P-1.** When the recorder is off, the per-mutation cost is zero —
  emission paths are gated on the `debugTraceStorage` toggle before any
  `outerHTML` serialization runs. When on, the recorder visibly slows chatty
  SPAs that re-render constantly. The docs explicitly direct operators to leave
  the recorder off in production.
- **NFR-S-1.** The page can see `window.__abs_dumpTrace()` when the bridge is
  installed — any page-world script in the tab can call it. Documented in
  [`docs/src/content/docs/debug-trace.md`](../docs/src/content/docs/debug-trace.md)
  §"Caveats" with the warning: don't enable the recorder on a CWS profile used
  for browsing untrusted sites.
- **NFR-O-1.** The export schema is versioned via
  `extension/data/debug-trace.schema.json` and is the public wire contract for
  both the JSONL export and the CDP bridge response. Internal IDB bookkeeping
  fields (`addedAt`) are stripped before export.

## Current implementation

- FR-1: `extension/src/lib/debug-trace.ts` (`debugTraceStorage`),
  `extension/src/popup/DebugTraceSection.tsx`.
- FR-2, FR-3: `extension/src/lib/debug-trace-store.ts` (`appendEvent`,
  `clearTab`), background message handlers in `extension/src/background.ts`.
- FR-4: `extension/data/debug-trace.schema.json`,
  `extension/src/lib/debug-trace.ts`, `extension/src/lib/debug-trace-export.ts`,
  `extension/src/lib/detection-messages.ts`,
  `extension/src/lib/segment-tracker.ts`, `extension/src/lib/trace-mutation.ts`.
- FR-5: `extension/src/popup/DebugTraceSection.tsx`,
  `extension/src/popup/use-tab-debug-trace.ts`.
- FR-6, FR-7, FR-8: `extension/src/dump-trace-bridge.ts`,
  `extension/src/lib/dump-trace-bridge-source.ts`,
  `extension/src/lib/dump-trace-bridge-registration.ts`,
  `extension/src/lib/dump-trace-content-bridge.ts`.
- FR-9, FR-10: `extension/src/background.ts` (`chrome.tabs.onUpdated` and
  `chrome.tabs.onRemoved` handlers).

## Future work

- Compaction strategy beyond the 2000-event cap — older events are dropped first
  today; a sampling or rule-id-aware retention policy could keep coverage for
  low-frequency rules longer. No tracking issue.
- Streaming export for very chatty pages — JSONL export today buffers in memory
  before download.

## Related

- ADRs: [ADR-0009](../decisions/0009-rule-defaults-and-build-time-overrides.md)
  (`debugTrace` reserved key).
- Docs:
  [`docs/src/content/docs/debug-trace.md`](../docs/src/content/docs/debug-trace.md),
  [`docs/src/content/docs/install.md`](../docs/src/content/docs/install.md).
- Skills:
  [`skills/agent-browser-shield-diagnose/SKILL.md`](../skills/agent-browser-shield-diagnose/SKILL.md).
- Specs: [0010](./0010-extension-ui-and-controls.md),
  [0011](./0011-build-time-customization.md).
