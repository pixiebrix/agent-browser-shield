---
status: accepted
date: 2026-06-05
---

# Scrub the data carrier; do not detach framework-rendered DOM

## Context and Problem Statement

Four `strip` rules (`meta-injection-strip`, `noscript-strip`,
`html-comment-strip`, `hidden-text-strip`) called `.remove()` on DOM nodes the
page framework had rendered and was tracking for unmount. When React Router (and
equivalents in Vue / Svelte / Astro / htmx head-merge) tried to reconcile those
nodes out on route change, "`removeChild` threw inside the commit phase and
stranded the route mid-render." (PR #176 §"Summary")

User-visible symptom on the demo site: clicking the RiverMart logo from a
product detail page updated the URL but never repainted the home content,
"because React 19 hoists `<title>` and three `<meta>` tags from
`ProductDetail.tsx` into `<head>`, `meta-injection-strip` detached them on
match, and React's next commit tried to `removeChild` nodes whose `parentNode`
was already `null`." (PR #176 §"Summary")

## Decision Drivers

- Defenses against prompt-injection / cross-origin trickery should not break the
  page's framework reconciliation, since that's a guaranteed regression on every
  navigation.
- The `strip` verb's contract needs to be safe for SPA frameworks by default
  (`AGENTS.md` §"Rule ID naming": "Most strip rules blank the data carrier
  (attribute value, text node, comment data) rather than detach the element, so
  SPA frameworks (React 19 metadata, Vue Teleport, Astro view transitions) keep
  live references to the rendered node and reconcile cleanly on route change.").

## Considered Options

- Keep calling `element.remove()` on matched carriers (the prior behavior).
- Blank the carrier data in place (attribute value, `textContent`, or `Text`
  node data); leave the element attached.
- Detach only when the rule's target is a node the page framework does not own
  (e.g., inline SVG sprite definitions).

## Decision Outcome

Chosen option: **blank the carrier; do not detach framework-rendered nodes.**

- `meta-injection-strip` blanks `content=""` on matching `<meta>` (was
  `element.remove()`) (PR #176 §"Summary").
- `noscript-strip` blanks `<noscript>` children via `textContent = ""` (was
  `element.remove()`) (PR #176 §"Summary").
- `html-comment-strip` blanks `comment.data` only when the data matches
  `INJECTION_PATTERNS` (was: unconditional removal of every comment outside
  `<script>` / `<style>` / `<noscript>`) (PR #176 §"Summary"). "The
  injection-match gate naturally preserves React Suspense markers (`$`, `/$`,
  `$?`, …) without an explicit allowlist." (PR #176 §"Summary")
- `hidden-text-strip` walks `SHOW_TEXT` and blanks each Text node's `data` (was
  `element.remove()`) (PR #176 §"Summary").

Carve-out: `svg-sprite-strip` continues to detach its targets because "its
targets are inline sprite definitions the page framework does not own"
(`AGENTS.md` §"Rule ID naming").

### Consequences

- Good, because navigation crashes from `removeChild` on detached carriers are
  eliminated for React 19, Vue Teleport, Astro view transitions, and equivalent
  frameworks (PR #176 §"Summary"; `AGENTS.md`).
- Bad (coverage trade-offs explicitly enumerated in PR #176 §"Coverage
  trade-offs"):
  1. `meta-injection-strip` — in-place `content` rewrites land on a node the
     rule has already blanked; the subtree watcher observes `id` / `class` only,
     so a later poisoned write is visible until the next subtree change
     re-triggers a scan.
  2. `noscript-strip` — in-place children replacement inside a kept `<noscript>`
     is not detected because `stripNoscript`'s `querySelectorAll` walks downward
     only.
  3. `html-comment-strip` — comments not matching `INJECTION_PATTERNS` survive.
     Novel injection phrasings, off-pattern prose, and any benign-looking
     comments carrying instruction-shaped text that used to be removed now stay
     visible.
  4. `hidden-text-strip` — non-text payloads inside hidden subtrees survive.
     `image alt`, `aria-label`, `title`, SVG `<title>` / `<desc>`, and `data-*`
     attributes are no longer caught by the wholesale wrapper removal.
- Memory: the project policy is "Remove over annotate for adversarial content"
  (per the contributor memory `feedback_defense_remove_over_annotate.md`). This
  ADR narrows the policy to "remove the content from the carrier, but leave the
  carrier where the framework put it" rather than weakening the policy itself.

### Confirmation

- Property tests pin the load-bearing invariants and would fail any drift back
  to detachment:
  - `html-comment-strip.property.test.ts` — "across all known injection
    fixtures, comments are blanked but stay attached; across the framework
    marker set (`$`, `/$`, `$?`, `$!`, `[`, `]`, build stamps, license headers,
    dev TODOs), comments are left untouched. Catches any future widening of
    `INJECTION_PATTERNS` that would re-introduce the navigation crash via a
    different path." (PR #176 §"Property-based tests")
  - `hidden-text-strip.property.test.ts` — "across the cross-product of
    hidden-CSS triggers × child-subtree shapes, descendant text is blanked AND
    every element node inside the hidden box stays attached. Drift back to
    `element.remove()` or `replaceChildren()` would fail this as a class, not
    just one specific case." (PR #176 §"Property-based tests")
- Follow-up issues track the explicit coverage gaps:
  - Issue [#177](https://github.com/pixiebrix/agent-browser-shield/issues/177) —
    meta-injection-strip / noscript-strip coverage gaps (closed by PR #180).
  - Issue [#178](https://github.com/pixiebrix/agent-browser-shield/issues/178) —
    open: "Decide: restore html-comment-strip broad sweep with framework-marker
    allowlist".
  - Issue [#179](https://github.com/pixiebrix/agent-browser-shield/issues/179) —
    INJECTION_PATTERNS coverage on attribute-targeted rules post-#176.

## Pros and Cons of the Options

### Keep `.remove()` on matched carriers

- Bad, because React 19 metadata hoisting (and equivalents in other modern
  frameworks) detaches behavior crashes navigation (PR #176 §"Summary").

### Blank the carrier in place

- Good, because "the element references the framework holds stay valid;
  agent-readable content still goes to empty." (PR #176 §"Summary")
- Bad, because narrower coverage on several axes (PR #176 §"Coverage
  trade-offs", items 1–4).

### Detach when the framework does not own the node

- Good, because rules such as `svg-sprite-strip` target inline definitions the
  framework does not own; detaching is safe there (`AGENTS.md` §"Rule ID
  naming").

## More Information

- PR
  [#176 — Fix: scrub instead of detach for framework-rendered DOM](https://github.com/pixiebrix/agent-browser-shield/pull/176)
- [`AGENTS.md`](../AGENTS.md) §"Rule ID naming" — `strip` verb taxonomy entry
- Issue
  [#177 — Close meta-injection-strip / noscript-strip coverage gaps from #176 scrub-don't-detach refactor](https://github.com/pixiebrix/agent-browser-shield/issues/177)
- Issue
  [#178 — Decide: restore html-comment-strip broad sweep with framework-marker allowlist](https://github.com/pixiebrix/agent-browser-shield/issues/178)
- Issue
  [#179 — Audit INJECTION_PATTERNS coverage on attribute-targeted rules post-#176](https://github.com/pixiebrix/agent-browser-shield/issues/179)
