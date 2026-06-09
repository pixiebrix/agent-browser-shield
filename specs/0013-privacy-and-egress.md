---
status: Current
last_reviewed: 2026-06-09
---

# Privacy and network egress

## Purpose

The extension's privacy posture: zero telemetry, one explicitly opt-in outbound
call, and per-storage discipline that keeps user data on the device. This spec
is the authoritative statement of what leaves the browser and under what
conditions.

## Problem

A defensive extension installed to keep data away from agents must not itself
become an exfiltration channel. The extension runs a `<all_urls>` content script
that sees every page, holds API keys and per-tab detection state, and could
plausibly phone home for "analytics" or "model improvement." Without a hard,
inspectable zero-telemetry posture — written into the README, the docs, the
Chrome Web Store listing, and the code — users have no way to verify the shield
doesn't trade their data for the same reason they installed it. The bar is high
precisely because the access is total.

## User stories

### Human users

- As a **person installing the extension**, I want to confirm that no analytics,
  usage telemetry, or page content is sent off-device by default, so that I can
  use the shield on whatever pages I browse without a separate privacy review.
- As a **person who wants the LLM-driven rule**, I want to provide my own OpenAI
  API key explicitly, so that I'm in control of the outbound call and can revoke
  or change the key at any time.

### AI agents

- As a **CDP harness operator**, I want a single documented endpoint
  (`api.openai.com`) for the only outbound call the extension can make, so that
  network egress allowlists are easy to scope.

## Functional requirements

- **FR-1.** The extension does not collect, store, or send any telemetry,
  analytics, or usage data. Rule processing runs locally in the browser; nothing
  is reported back to PixieBrix or any other server.
- **FR-2.** The single exception is the optional `irrelevant-sections-redact`
  rule (default **off**), which sends a compressed page tree to OpenAI's API for
  classification when:
  1. the rule is enabled, **and**
  2. an OpenAI API key is configured (either bundled at build time via
     `OPENAI_API_KEY` or saved on the extension's options page). Until both
     conditions hold, the rule shows as Unavailable on the Options page and
     makes no network calls.
- **FR-3.** The compressed page tree sent to OpenAI carries DOM structure with
  stable refs (so the LLM can choose the right granularity for redaction) and
  labels interactive elements (search, cart, checkout, login) as protected so
  they're not flagged for redaction. The exact payload shape lives in
  `extension/src/lib/page-tree.ts`.
- **FR-4.** The API key is stored in `chrome.storage` under
  `agent-browser-shield.openai-api-key`. The Options page reads and writes it
  via the `apiKeyStorage` accessor. A build-time bundled key
  (`HAS_BUILT_IN_OPENAI_KEY`) is treated as a fallback the user can override via
  the Options page.
- **FR-5.** Per-tab rule footprint counts and detection payloads (roach-motel,
  webdriver-probe, closed-shadow-root) are held in background-worker memory only
  and cleared on tab close, top-level navigation, and enforcement-off
  transitions. They are not persisted beyond the service-worker process
  lifetime.
- **FR-6.** Per-tab debug-trace records live in IndexedDB at the extension
  origin (spec [0012](./0012-debug-trace.md)). They are not network-exposed;
  export is user-driven (popup *Export* button or the `window.__abs_dumpTrace()`
  bridge the page can call when the recorder is on).
- **FR-7.** The per-rule activity counts the background worker aggregates are
  sanitized at receipt — unknown rule IDs and non-positive counts are dropped,
  so a misbehaving content script can't poison the popup or badge.

## Non-functional requirements

- **NFR-S-1.** The privacy statement is reproduced verbatim in
  [`README.md`](../README.md) §"Privacy" and
  [`docs/src/content/docs/index.mdx`](../docs/src/content/docs/index.mdx). Drift
  between the two is caught by review. See
  [ADR-0010](../decisions/0010-no-telemetry.md).
- **NFR-S-2.** The Chrome Web Store listing must reflect the no-telemetry
  posture; no analytics SDKs may be added to the extension without updating both
  the docs and the listing.
- **NFR-S-3.** The `irrelevant-sections-redact` rule does not log the raw page
  content or model response to any persistent store beyond the debug-trace
  recorder (when on), and the trace is local to the user's browser.
- **NFR-O-1.** The extension's `host_permissions: ["<all_urls>"]` is needed
  because the content script runs on every page. The background worker uses no
  other permissions beyond `storage` and `scripting`.

## Current implementation

- FR-1, FR-2: `extension/src/rules/irrelevant-sections-redact.ts`,
  `extension/src/lib/llm-background.ts`, `extension/src/lib/llm-client.ts`.
- FR-3: `extension/src/lib/page-tree.ts`.
- FR-4: `extension/src/lib/api-key-storage.ts`,
  `extension/src/options/Options.tsx`.
- FR-5: `extension/src/background.ts` (`tabRuleCounts`, `tabDetections`,
  `clearTab`, `chrome.tabs.onRemoved`, `chrome.tabs.onUpdated`).
- FR-6: `extension/src/lib/debug-trace-store.ts` (IndexedDB).
- FR-7: `extension/src/background.ts` (sanitization in the `rule-count` message
  handler).

## Future work

- Multi-provider LLM backend so users can keep the LLM rule on without involving
  OpenAI specifically — out of scope today; OpenAI is the only supported
  provider.

## Related

- ADRs: [ADR-0010](../decisions/0010-no-telemetry.md).
- Docs: [`README.md`](../README.md) §"Privacy",
  [`docs/src/content/docs/index.mdx`](../docs/src/content/docs/index.mdx).
- Specs: [0006](./0006-context-pollution-reduction.md) (FR-7,
  `irrelevant-sections-redact`), [0010](./0010-extension-ui-and-controls.md),
  [0012](./0012-debug-trace.md).
