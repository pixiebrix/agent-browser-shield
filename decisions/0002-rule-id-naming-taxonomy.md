---
status: accepted
date: 2026-06-03
---

# Rule ID naming taxonomy (`<target>-<verb>`, five canonical verbs)

## Context and Problem Statement

Rule IDs had drifted to "10 verbs across 28 rules" — `hide`, `mask`, `flag`,
`scrub`, `suppress`, `neutralize`, `clear`, `redact`, `sanitize`, `strip` — with
no shared definition of what each verb meant. PR #105 called this "verb
proliferation" and PR #95 §"Summary" notes there was "no canonical naming
reference for the 24th" rule when the count reached that point.

The most load-bearing piece is the surface-level "hide" semantics:
`selector-hide-rule.ts` already toggled between two distinct mechanisms via
`removeEntirely`. Nine rules called `replaceWithBlockPlaceholder` (detach +
reveal placeholder); four called `removeEntirely: true` (in-place
`display: none`). They shared the `-hide` suffix even though they did different
things (PR #105 §"What changed").

## Decision Drivers

- "Collapse the verb proliferation in rule IDs (10 verbs across 28 rules) into a
  five-verb canonical taxonomy that names the DOM operation, not the intent."
  (PR #105 §"Summary")
- The verb has to describe what the rule does to the DOM, not the threat it
  addresses, so a contributor can pick the verb correctly from the rule's
  implementation (PR #105 §"Summary"; `CONTRIBUTING.md` §"Rule ID naming").
- `-helper` is reserved for non-defensive agent affordances such as
  `search-url-helper` (`CONTRIBUTING.md` §"Rule ID naming"; `AGENTS.md` §"Rule
  ID naming").

## Considered Options

- Keep the ad-hoc verb set (10 verbs).
- Adopt a five-verb canonical taxonomy: `annotate`, `hide`, `redact`,
  `sanitize`, `strip`.

## Decision Outcome

Chosen option: **five-verb canonical taxonomy**, applied to every existing rule
via the renames listed in PR #105.

| Verb       | Semantics                                                                                                                                                                  |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `annotate` | Add agent-facing info; page content unchanged.                                                                                                                             |
| `hide`     | Visually conceal with `display: none`; element stays in DOM.                                                                                                               |
| `redact`   | Replace content with a click-to-reveal placeholder block/token.                                                                                                            |
| `sanitize` | Element stays; clean attributes / text / state.                                                                                                                            |
| `strip`    | Remove the agent-readable content from the DOM (usually by blanking the data carrier — attribute value, text node, comment data — so SPA framework references stay valid). |

The hide-vs-redact split follows the implementation: four `removeEntirely: true`
rules keep `-hide`; nine `replaceWithBlockPlaceholder` rules became `-redact`
(PR #105 §"What changed"). `-helper` (e.g. `search-url-helper`) sits outside the
verb set because it "adds capability rather than remove[s] a problem"
(`CONTRIBUTING.md` §"Rule ID naming").

### Consequences

- Good, because a single verb taxonomy gives contributors and agents a decision
  rule for every new rule, with an explicit hide-vs-redact decision rule keyed
  on whether the user could "meaningfully act on the element when it's gone"
  (`CONTRIBUTING.md` §"Rule ID naming").
- Bad, because `storage.normalize()` "drops keys not in `RULE_IDS`, so any rule
  a user explicitly disabled under its old ID will revert to the default on
  upgrade." (PR #105 §"Caveat: stored user toggles"). PR #105 notes that
  "default-enabled rules stay default-on, default-off stay default-off — so the
  visible effect is limited to users who intentionally disabled a now-renamed
  rule" and that a migration map could close the gap as a follow-up.

### Confirmation

- Custom ESLint rule `agent-browser-shield/rule-id-matches-filename` enforces
  that on-disk filename matches the declared `id` (`CONTRIBUTING.md` §"Adding a
  new rule"; PR #29 §"Summary").
- `extension/src/rules/__tests__/catalog.test.ts` enforces parity between
  `rule-metadata.ts` and `rules/index.ts` (`AGENTS.md` §"Rule defaults").

## Pros and Cons of the Options

### Keep 10 ad-hoc verbs

- Bad, because there was "no canonical naming reference for the 24th [rule]" (PR
  #95 §"Summary").
- Bad, because related rules (e.g. `pii-mask`, `secrets-mask`,
  `prompt-injection-hide`, `comments-hide`) used different verbs for the same
  DOM operation (PR #105 §"What changed").

### Five-verb canonical taxonomy

- Good, because rules with the same DOM operation share a verb, including the
  previously inconsistent placeholder-swap family (`comments`, `footer`,
  `reviews`, `irrelevant-sections`, `countdown-timer`, `scarcity`,
  `social-embed`, `cross-origin-frame`, `prompt-injection`) (PR #105 §"What
  changed").
- Good, because the taxonomy is mechanically discoverable from the rule's code
  (PR #105 §"Summary"; `AGENTS.md` §"Rule ID naming").

## More Information

- PR
  [#105 — Standardize rule-ID verbs (hide / redact / sanitize / strip / annotate)](https://github.com/pixiebrix/agent-browser-shield/pull/105)
- [`AGENTS.md`](../AGENTS.md) §"Rule ID naming"
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) §"Rule ID naming"
- PR
  [#29 — Add ESLint with unicorn plugin and custom rule infrastructure](https://github.com/pixiebrix/agent-browser-shield/pull/29)
  — `rule-id-matches-filename` custom ESLint rule
