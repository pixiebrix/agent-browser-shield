---
status: Current
last_reviewed: YYYY-MM-DD
---

# {Capability name}

## Purpose

One paragraph. What this capability is, who it serves, and where it sits in the
overall threat model or value proposition. No marketing copy — name the concrete
user surface (a rule group, a UI control, a build flag).

## Problem

One paragraph (or 2–4 bullets). The harm, friction, or risk this capability
exists to address — phrased so a reader can answer "what would go wrong without
it?" Architectural rationale ("why we chose React over Lit") belongs in an ADR,
not here; this section is the **product** why, not the **implementation** why.

## User stories

### Human users

- As a **person installing the extension on my own browser**, I want …, so that
  ….
- As a **person tuning the extension for my workflow**, I want …, so that ….

### AI agents

- As a **browser-use agent reading the page**, I want …, so that ….
- As a **browser-use agent acting on the page**, I want …, so that ….

Drop a class of story if it doesn't apply (e.g. a build-time-only capability has
no agent-runtime story).

## Functional requirements

- **FR-1.** {testable statement of current behavior}.
- **FR-2.** {…}.

Each FR is a single verifiable claim. When the claim depends on a list (covered
hosts, blocked attributes, etc.), reference the source-of-truth file instead of
duplicating the list inline.

## Non-functional requirements

Cite the cross-cutting bars in [0014](./0014-non-functional-requirements.md)
where applicable; only list capability-specific ones here.

- **NFR-P-1.** Performance: ….
- **NFR-S-1.** Security: ….
- **NFR-O-1.** Observability: ….
- **NFR-U-1.** Usability: ….
- **NFR-M-1.** Maintainability: ….

## Current implementation

Point each FR at the file(s) and test(s) that back it. Avoid restating the
behavior — just name the location.

- FR-1: `extension/src/…`, tested in `extension/src/…/__tests__/…`.
- FR-2: ….

## Future work

Bullets only. Each one links to an issue or cites an ADR that records the
deliberate deferral.

- {gap} — [#NNN](https://github.com/pixiebrix/agent-browser-shield/issues/NNN).
- {scope cut} — see [ADR-NNNN](../decisions/NNNN-%E2%80%A6.md) §"…".

## Related

- ADRs: [ADR-NNNN](../decisions/NNNN-%E2%80%A6.md).
- Docs: [`docs/src/content/docs/…`](../docs/src/content/docs/%E2%80%A6).
- Specs: [NNNN](./NNNN-%E2%80%A6.md).
