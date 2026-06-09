---
status: accepted
date: 2026-05-30
---

# Run rule engine in all frames

## Context and Problem Statement

The content script originally injected into the top frame only. Rules such as
PII/secrets redaction, prompt-injection hiding, ads-hide, hidden-text-strip, and
the comments/reviews family did not "actually reach" content rendered inside
iframes — Disqus, Trustpilot, AdSense, and third-party comment widgets were
unprotected (PR #4 §"Summary").

## Decision Drivers

- Reach iframe-embedded content so defenses apply uniformly (PR #4 §"Summary").
- Cover `about:blank` / `about:srcdoc` subframes that default injection rules
  don't match (PR #4 §"Summary").
- Avoid duplicating page-wide chrome (e.g., the floating options badge) once per
  frame (PR #4 §"Summary").

## Considered Options

- Top-frame only (the previous behavior).
- All frames, with a per-rule opt-in to skip subframes.

## Decision Outcome

Chosen option: **all frames, with a per-rule `topFrameOnly` opt-in.**

- Manifest enables `all_frames: true` plus `match_origin_as_fallback` so
  `about:blank` / `about:srcdoc` iframes are also covered (PR #4 §"Summary").
- The `Rule` type gains an opt-in `topFrameOnly` flag. Rules whose targets are
  "inherently page-wide" carry it so they don't fire pointlessly in subframes:
  `footer-hide`, `cookie-banner-hide`, `newsletter-modal-hide`,
  `chat-widget-hide`, `search-url-helper`, `irrelevant-sections-hide` (PR #4
  §"Summary").
- The floating options badge is gated to the top frame only — "no more N badges
  per page" (PR #4 §"Summary").
- `lib/frame.ts` is the single source of truth for "are we the top frame", with
  a defensive `try/catch` around the cross-origin `window.top` access (PR #4
  §"Summary").

### Consequences

- Good, because frame-gating is a per-rule decision; the default is full
  coverage (PR #4 §"Summary").
- Good, because no new host permissions are required: `<all_urls>` in `matches`
  already covers every origin the script needs to inject into (PR #4 §"Notes").
- Bad, because `ads-hide` deliberately runs in subframes — many ad networks
  render the actual ad content inside their iframe — which carries a "Per-frame
  stylesheet cost (~600KB CSS text per frame) [as] a known tradeoff worth a
  follow-up perf pass." (PR #4 §"Notes").

### Confirmation

- `extension/src/lib/__tests__/rule-engine.test.ts` covers "the three
  frame-gating branches (top-frame + frame-agnostic rule applied, top-only rule
  skipped in subframes, unavailable rule never applied)" (PR #4 §"Summary").
- The manifest-permission-diff CI workflow (ADR-0005? no — added in PR #56)
  flags any future widening of `permissions`, `host_permissions`, or `matches`
  so frame coverage cannot quietly broaden without review (PR #56 §"Summary").

## Pros and Cons of the Options

### Top-frame only

- Bad, because iframe-embedded comment widgets, ad networks, and similar content
  are never seen by any rule (PR #4 §"Summary").

### All frames + `topFrameOnly` opt-in

- Good, because frame-gating is a per-rule decision (PR #4 §"Summary").
- Bad, because the EasyList stylesheet has to be present per-frame for in-iframe
  ads to be hidden (PR #4 §"Notes").

## More Information

- PR
  [#4 — Run rule engine in all frames](https://github.com/pixiebrix/agent-browser-shield/pull/4)
- PR
  [#56 — Add knip, codegen-freshness, and manifest-permission-diff CI checks](https://github.com/pixiebrix/agent-browser-shield/pull/56)
  — permission-diff workflow
- Source: `extension/src/lib/frame.ts`,
  `extension/src/lib/__tests__/rule-engine.test.ts`
