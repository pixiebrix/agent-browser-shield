---
status: accepted
date: 2026-06-05
---

# Pierce open shadow roots; document closed shadow roots as out of scope

## Context and Problem Statement

Until issue #164 was closed, "the rule engine and every rule scan the **light
DOM only**. Content rendered inside an open shadow root is invisible to nearly
every rule; closed shadow roots are opaque to everything." Issue #164 calls this
"a systemic blind spot, not a per-rule bug — the asymmetry the injection-defense
rules exist to close (DOM is readable to agents but invisible to humans) is
exactly what an attacker gets for free by mounting payloads inside a shadow
root." (Issue #164 §"Summary")

Three structural facts caused this:

1. `rule.apply()` was only ever called with `document.body` (issue #164 §"Why it
   happens").
2. The shared subtree watcher attached `MutationObserver` to `document.body` /
   `document.head`; "MutationObserver does **not** cross shadow boundaries even
   with `subtree:true`." (Issue #164 §"Why it happens")
3. `querySelectorAll` / `closest` / `TreeWalker` stop at shadow boundaries
   (issue #164 §"Why it happens").

## Decision Drivers

- The high-asymmetry rules (`prompt-injection-redact`, `hidden-text-strip`,
  `attribute-injection-sanitize`, `encoded-payload-redact`,
  `unicode-invisibles-strip`, `svg-text-strip`, `svg-sprite-strip`,
  `html-comment-strip`, `meta-injection-strip`) are entirely defeated by a
  trivial bypass — wrapping a payload in `<div>.attachShadow({mode:"open"})` —
  if the engine doesn't pierce open roots (Issue #164 §"What's affected").
- Closed shadow roots "are opt-out of all external JavaScript access by spec —
  `host.shadowRoot` is null, `MutationObserver` and `adoptedStyleSheets` don't
  cross the boundary, and no supported API undoes that." (PR #168 §"Summary")
- "Trying to read closed shadow roots" is listed explicitly as a non-goal:
  "There's no supported way; even devtools shadow inspection is gated." (Issue
  #164 §"Non-goals")

## Considered Options

- Leave shadow content out of scope (the prior behavior).
- Walk shadow roots from rule code (per-rule changes).
- Push shadow-awareness into the shared plumbing (watcher + walker + stylesheet)
  so per-rule code stays as-is.

## Decision Outcome

Chosen option: **push shadow-awareness into the shared plumbing for open roots
only; document closed roots as out of scope.**

The fix landed across four PRs, tracked under issue #164:

- **#164 Tier 1 — PR #165 — Shadow-aware subtree watcher.** Patches
  `Element.prototype.attachShadow` at content-script entry to keep a
  `Set<ShadowRoot>` of open roots; the shared subtree watcher attaches a
  per-shadow-root `MutationObserver` and fans events into the same subscriber
  set. "No rule-code changes — every `createSubtreeWatcher` /
  `createSelectorHideRule` rule now reaches content rendered inside open shadow
  trees." (PR #165 §"Summary"). "Closed shadow roots stay opaque by design." (PR
  #165 §"Summary"; explicit skip in `shadow-roots.ts`.)
- **#164 Tier 2 — PR #166 — Shadow-piercing text walkers.** Replaces the default
  `TreeWalker` with one that recursively descends shadow trees.
- **#164 Tier 3 — PR #167 — Shadow-scoped stylesheets via
  `adoptedStyleSheets`.** EasyList and placeholder CSS apply inside open shadow
  roots.
- **#164 Docs — PR #168 — "Docs: closed shadow roots are not protected".** Adds
  a Coverage Scope subsection to the Rules reference page so users running into
  a sealed widget understand the gap.

PR #169 adds a heuristic detector for closed shadow roots (extension/data
pattern), but the closed-root content itself remains out of reach by spec.

### Consequences

- Good, because "the majority of the catalog" — every selector-hide family rule,
  every text-walk rule, and every per-element rule listed in issue #164 — gains
  shadow-DOM coverage with no rule-code changes (issue #164 §"Recommended
  sequencing" PR 1; PR #165 §"Summary").
- Good, because `adoptedStyleSheets` is "the right primitive — single source of
  truth, cheap to attach. Same approach would fix placeholder styling inside
  shadow roots." (Issue #164 §"Tier 3")
- Bad, because closed shadow roots stay opaque: `host.shadowRoot` is null and
  there is "no supported API" to undo it (PR #168 §"Summary"; Issue #164
  §"Non-goals").

### Confirmation

- "`shadow-roots.test.ts` (new) — unit tests for the hook + discovery contract."
  (PR #165 §"What changed")
- `shadow-roots.property.test.ts` covers three invariants with fast-check,
  including "closed shadow roots never enter the open-tracker, for any random
  tree shape" and "the subtree watcher's dispatch payload covers every
  open-shadow element and excludes every closed-shadow element, across nested
  forests." (PR #165 §"What changed")
- `subtree-watcher.test.ts` adds a `describe("shadow DOM", …)` block covering
  pre-existing shadow content, post-start attachments, mutations inside shadows,
  nested shadow roots, late-joining subscribers, the placeholder skip,
  head-vs-body router isolation, and closed-shadow opacity (PR #165 §"What
  changed").
- A `ShadowDomEmbed` was added to the demo home page that "mounts a chat-widget
  marker and an `ins.adsbygoogle` block inside an open shadow root so reviewers
  can confirm the dispatcher actually reaches them." (PR #165 §"Summary")
- Documentation: `docs/src/content/docs/rules.md` Coverage Scope section (PR
  #168 §"What changed").

## Pros and Cons of the Options

### Leave shadow content out of scope

- Bad, because every injection-defense rule is bypassable by mounting the
  payload inside a shadow root (Issue #164 §"What's affected").

### Per-rule shadow-walking

- Bad, because every rule has to change, and new rules have to remember to opt
  in (rejected as the implicit form by Tier 1's "no rule-code changes" framing;
  Issue #164 §"Non-goals": "Changing every rule's scan signature.").

### Shadow-aware shared plumbing

- Good, because shadow coverage extends to every existing
  `createSelectorHideRule` / `createSubtreeWatcher` rule and to future ones
  automatically (PR #165 §"Summary").
- Good, because `adoptedStyleSheets` consolidates style injection into one
  mechanism that works for both light and shadow scopes (Issue #164 §"Tier 3").
- Bad, because closed shadow roots remain out of reach; this is documented as a
  limitation rather than worked around (PR #168 §"Summary").

## More Information

- Issue
  [#164 — Audit: rules are blind to content inside shadow roots](https://github.com/pixiebrix/agent-browser-shield/issues/164)
- PR
  [#165 — Feat: shadow-aware subtree watcher (#164 Tier 1)](https://github.com/pixiebrix/agent-browser-shield/pull/165)
- PR
  [#166 — Feat: shadow-piercing text walkers (#164 Tier 2)](https://github.com/pixiebrix/agent-browser-shield/pull/166)
- PR
  [#167 — Feat: shadow-scoped stylesheets via adoptedStyleSheets (#164 Tier 3)](https://github.com/pixiebrix/agent-browser-shield/pull/167)
- PR
  [#168 — Docs: closed shadow roots are not protected (#164 follow-up)](https://github.com/pixiebrix/agent-browser-shield/pull/168)
- PR
  [#169 — Feat: heuristic detector for closed shadow roots (#164 follow-up)](https://github.com/pixiebrix/agent-browser-shield/pull/169)
- PR
  [#217 — Fix: main-world shadow-root probe for definitive closed-shadow detection (#203)](https://github.com/pixiebrix/agent-browser-shield/pull/217)
