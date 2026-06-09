---
title: Debug trace
description: Investigate false positives — record every rule-driven mutation the shield makes and scrape the trace from the popup or over CDP via window.__abs_dumpTrace.
---

Turn on the debug-trace recorder when you need to investigate a **false
positive** — a rule hid, masked, or rewrote content that should have been left
alone, and you want to know which rule fired, what it matched, and what the page
looked like before and after. The recorder captures every rule-driven mutation
(selector, mutation kind, before/after `outerHTML`, segment id) and persists it
to IndexedDB at the extension origin so you can pull the record after the fact
and reproduce the diagnosis offline.

Typical scenarios:

- **An agent failed a task and you suspect the shield got in the way.** Compare
  the trace to what the agent's accessibility-tree dump showed —
  rule-application entries tell you exactly which DOM nodes were rewritten
  between the page load and the agent's read.
- **A user reported "the page looks broken."** The trace's `outerHTML`
  before/after pair shows the exact mutation; you can replay it on a clean page
  locally to confirm the false positive and craft a regression test.
- **You're tuning a new rule and want a footprint report.** Run the page through
  the recorder, dump the trace, and review every selector match before deciding
  whether the rule's scope is right.

The recorder is **off by default**. Turn it on for the runs you want to inspect;
leave it off everywhere else (the recorder has both a runtime cost and exposes a
`window.__abs_*` global, see [Caveats](#caveats)).

## Turning the recorder on

Two paths, depending on how the extension was installed:

- **Build-time default** — pass `debugTrace: true` in your overrides file when
  running `bun run build --defaults <file>`. See the
  [`debugTrace`](/agent-browser-shield/install/#build-time-defaults) bullet on
  Install. Right for CDP-driven harnesses (Browserbase, Hermes, browser-use,
  OpenClaw) that ship the extension with the recorder always on so no human has
  to flip a toggle per session.
- **Popup toggle** — open the extension popup and flip **Debug trace**. Right
  for Chrome Web Store installs where the user enables tracing on demand. The
  toggle persists in `chrome.storage` for the profile. Pages already open when
  the toggle flips need a reload before the `window.__abs_dumpTrace()` bridge
  appears (the dynamic content-script registration only takes effect on
  subsequent navigations).

Both paths flip the same underlying `debugTraceStorage` value — the bridge
behaves identically either way.

## Retrieving the trace

### From the popup

Open the extension popup on the tab you want to inspect and click **Export**.
The popup downloads a JSONL file with one stored event per line, ordered
chronologically across all frames for that tab.

### From CDP

When the recorder is on, the extension exposes `window.__abs_dumpTrace()` in the
top frame's MAIN world. The async function returns the same stored-event shape
as the JSONL export, scoped to the calling tab. Any CDP client can call it via
`Runtime.evaluate`.

#### Playwright

```python
trace = page.evaluate("async () => await window.__abs_dumpTrace()")
```

#### Raw CDP

```python
result = client.send("Runtime.evaluate", {
    "expression": "(async () => await window.__abs_dumpTrace())()",
    "awaitPromise": True,
    "returnByValue": True,
})
entries = result["result"]["value"]
```

#### Feature-detection

```python
present = page.evaluate("typeof window.__abs_dumpTrace === 'function'")
```

The function is absent on tabs where the recorder is off and on builds where the
bridge was never registered (no `debugTrace: true` default and no popup toggle
flip).

## Event shape

Each entry returned by the dump (and each JSONL line in the export) matches the
schema in
[`extension/data/debug-trace.schema.json`](https://github.com/pixiebrix/agent-browser-shield/blob/main/extension/data/debug-trace.schema.json).
The three top-level entry types are:

- **`segment`** — bookkeeping marker emitted at initial load, route changes,
  modal opens, and large mutation bursts. Subsequent rule-application entries
  carry the active segment id so consumers can group events by user-visible
  phase.
- **`rule-application`** — a single rule-driven mutation. Carries the rule id,
  mutation kind (`hide` / `mask` / `strip` / `sanitize` / `flag` / `embed`), the
  matched selector, and `outerHTML` before/after the mutation. CSS-only matches
  (the rule installed a stylesheet but didn't write to the element) set
  `cssOnly: true` and have identical before/after HTML.
- **`navigation`** — emitted by the background service worker on every top-level
  loading transition. Lets a single trace span multiple page loads in the same
  tab.

The store caps each tab at 2000 events; older events are dropped first.

## Caveats

- **Top frame only.** `window.__abs_dumpTrace()` is exposed only on the top
  frame. The response includes events from every frame on the tab (each carries
  its `frameId`), so a CDP caller asking from the top frame still sees the full
  picture.
- **The page can see it too.** When the bridge is installed, any page-world
  script in the tab can call `window.__abs_dumpTrace()`. Don't enable the
  recorder on a CWS profile you use for browsing untrusted sites.
- **Reload required for already-open tabs.** Toggling the popup switch on
  doesn't retroactively expose the bridge on tabs you already had open. The next
  navigation in that tab picks it up.
- **Recorder cost.** When on, the recorder serializes `outerHTML` around every
  rule mutation. Cheap on most pages, but visibly slower on chatty SPAs that
  re-render constantly. Leave the recorder off in production.
