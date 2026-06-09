# Specifications

This directory holds the **golden specs** for `agent-browser-shield` — living
descriptions of what the system does today. They are organized by capability
area and kept in lockstep with the shipped behavior: every functional
requirement here is backed by code, tests, or user-facing docs; every gap is
called out under **Future work**.

Specs are distinct from [Architecture Decision Records](../decisions/README.md):

| Specs (this directory)                               | ADRs (`decisions/`)                                |
| ---------------------------------------------------- | -------------------------------------------------- |
| **What** the system does and **why each one exists** | **Why** we chose a particular implementation path  |
| Updated as behavior changes                          | Immutable once accepted (or marked superseded)     |
| Problem + user stories + acceptance criteria         | Context, drivers, considered options, consequences |
| Forward-pointing: "future work" calls out gaps       | Backward-looking: cites PRs, issues, doc passages  |

Both kinds of doc carry a "why" — specs name the **product** why (the problem
solved), ADRs name the **implementation** why (the path chosen). A spec
shouldn't litigate alternative architectures; an ADR shouldn't restate the
problem at user-story granularity.

When a spec changes, check whether the change implies a new decision worth
recording as an ADR.

## Index

| #                                             | Title                                  | Status  |
| --------------------------------------------- | -------------------------------------- | ------- |
| [0001](./0001-extension-distribution.md)      | Extension distribution                 | Current |
| [0002](./0002-rule-engine.md)                 | Rule engine                            | Current |
| [0003](./0003-prompt-injection-defense.md)    | Prompt-injection defense               | Current |
| [0004](./0004-sensitive-data-masking.md)      | Sensitive-data masking                 | Current |
| [0005](./0005-dark-pattern-defense.md)        | Dark-pattern defense                   | Current |
| [0006](./0006-context-pollution-reduction.md) | Context-pollution reduction            | Current |
| [0007](./0007-visual-identity-and-trust.md)   | Visual identity and trust verification | Current |
| [0008](./0008-cross-origin-and-shadow-dom.md) | Cross-origin and shadow-DOM coverage   | Current |
| [0009](./0009-agent-shortcuts.md)             | Agent shortcuts                        | Current |
| [0010](./0010-extension-ui-and-controls.md)   | Extension UI and controls              | Current |
| [0011](./0011-build-time-customization.md)    | Build-time customization               | Current |
| [0012](./0012-debug-trace.md)                 | Debug trace                            | Current |
| [0013](./0013-privacy-and-egress.md)          | Privacy and network egress             | Current |
| [0014](./0014-non-functional-requirements.md) | Non-functional requirements            | Current |

## Conventions

### File naming

`NNNN-kebab-case-title.md`. Numbers are stable; new specs append at the end of
the index.

### Status

A spec carries one of:

- **Current** — describes the shipped behavior. Default.
- **Draft** — proposed capability not yet shipped. Use sparingly; prefer
  recording the proposal as an issue and adding the spec on merge.
- **Superseded by spec-NNNN** — split, merged, or replaced.
- **Deprecated** — capability still present but planned for removal; pairs with
  a future-work entry pointing at the tracking issue.

### Section order

Every spec follows the template at [`_template.md`](./_template.md):

1. **Purpose** — one paragraph: what this capability is and where it sits.
2. **Problem** — the harm, friction, or risk this capability addresses. Phrased
   so a reader can answer "what would go wrong without it?" The **product** why;
   implementation choices belong in an ADR.
3. **User stories** — separated into **Human users** and **AI agents** (the two
   reader classes the extension serves). Stories follow
   `As a … I want … so that …`.
4. **Functional requirements** — numbered acceptance criteria. Each is a
   verifiable statement about current behavior (FR-1, FR-2, …).
5. **Non-functional requirements** — qualities the capability holds itself to
   (NFR-P/S/O/U/M for performance, security, observability, usability,
   maintainability). Defer to [0014](./0014-non-functional-requirements.md) for
   cross-cutting bars.
6. **Current implementation** — file pointers into the repo that back each
   requirement.
7. **Future work** — concrete gaps in current behavior, each tied to a tracking
   issue or a documented decision to defer. **No aspirational features without a
   tracking link.**
8. **Related** — links to ADRs, docs, and other specs.

### Citation discipline

Every functional requirement must be traceable to **one of**:

- a file in the repo (rule module, library file, schema),
- a test in `extension/src/**/__tests__/`,
- a passage in `docs/src/content/docs/**.md` or the README/AGENTS.md.

If none of those back a claim, the claim does not belong in a spec — file an
issue first.

### User-story discipline

The "AI agent" story isn't a polite second copy of the human story. It names
**what an agent reading the page or accessibility tree gets** that it wouldn't
get without this capability — fewer poisoned tokens, a placeholder it can act
on, a landmark surfacing a known blind spot, etc. If the agent story collapses
to "an agent benefits the same way a human does," the capability is probably
agent-incidental and doesn't need its own story.

### Future-work discipline

A bullet under **Future work** must either:

- link to a GitHub issue with the work scoped (e.g.
  [#121](https://github.com/pixiebrix/agent-browser-shield/issues/121) for
  `form-prefill-annotate` enhancements), or
- cite an ADR section that records the deliberate scope cut (e.g. closed shadow
  roots in [ADR-0008](../decisions/0008-shadow-dom-coverage.md)).

This keeps the section from drifting into vague roadmap material.
