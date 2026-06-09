---
status: Current
last_reviewed: 2026-06-09
---

# Agent shortcuts

## Purpose

Inject hints that let browser-use agents reach what they need without navigating
the human-facing UI — currently URL recipes for searches, filters, sorts, and
direct lookups on a curated set of hosts. The agent reads the hint from the
accessibility tree and decides whether to use it.

## User stories

### Human users

- As a **person watching an agent fumble through a search box on Amazon**, I
  want the agent to navigate by URL instead, so that the task completes faster
  and with fewer wrong clicks.
- As a **sighted user**, I want the shortcut hint to be invisible to me, so that
  it doesn't clutter the rendered page or compete with the site's UI.

### AI agents

- As a **browser-use agent landing on a covered host**, I want a
  screen-reader-only landmark at the top of the page describing how to run
  searches, filters, sorts, and direct lookups via URL, so that I can issue a
  navigation instead of typing into search boxes.
- As a **browser-use agent reading the landmark**, I want the URL templates to
  be composable — every `{variable}` placeholder should be fillable from the
  runtime intent, the page tree, or an inline vocabulary baked into the landmark
  — so that I don't have to guess what value to interpolate.

## Functional requirements

- **FR-1.** `search-url-helper` (default **on**, top-frame only) embeds a
  screen-reader-only landmark at the top of the page describing how to run
  searches, filters, sorts, and direct lookups via URL on a curated set of
  hosts.
- **FR-2.** Covered hosts span shopping, search, news, reference, dev tools,
  travel, and government/civic destinations. The authoritative current set is
  the YAML directory `extension/data/sites/*.yaml`; sites are added by dropping
  in a new YAML, not by editing this spec.
- **FR-3.** Per-host recipes live in `extension/data/sites/*.yaml`, validated at
  build time by the zod schema at `extension/data/site-rules.schema.ts`, and
  emitted into `extension/src/rules/site-data.generated.ts` via
  `extension/scripts/build-site-data.ts`. Rule files import the generated TS;
  the YAML is the editable source-of-truth.
- **FR-4.** Recipe templates are **composable**: each `{variable}` placeholder
  must be fillable from one of:
  1. **runtime intent** — values the agent already has from the user's task,
  2. **the page tree** — values present in the DOM the agent is reading (the
     URL, breadcrumbs, visible labels), or
  3. **an inline vocabulary** — an enumerated set baked into the landmark text
     (e.g. allowed sort values).
- **FR-5.** The landmark uses the standard screen-reader-only envelope. It is
  preserved by `hidden-text-strip` via the `sr-only` class allowlist (spec
  [0003](./0003-prompt-injection-defense.md), FR-11), so the shortcut and the
  hidden-text defense don't fight each other.
- **FR-6.** No visible affordance is rendered. The landmark surfaces in the
  accessibility tree but not in the rendered layout.

## Non-functional requirements

- **NFR-M-1.** Templates must remain composable (FR-4). A `{variable}` derived
  from benchmark task wording — not from intent, page tree, or inline vocabulary
  — is not allowed.
- **NFR-M-2.** Recipe changes flow through the YAML → codegen pipeline; rule
  files don't inline per-host strings.
- **NFR-O-1.** The rule reports per-frame mutation counts via the standard
  rule-count reporter so operators see how often a covered host is visited and
  the landmark fires.

## Current implementation

- FR-1, FR-2, FR-5, FR-6: `extension/src/rules/search-url-helper.ts`,
  `extension/src/rules/__tests__/search-url-helper.test.ts`,
  `extension/src/lib/sr-only.ts`.
- FR-3: `extension/data/sites/*.yaml`, `extension/data/site-rules.schema.ts`,
  `extension/scripts/build-site-data.ts`,
  `extension/src/rules/site-data.generated.ts`,
  `extension/src/rules/__tests__/site-data.test.ts`.
- FR-4: enforced by code review; recipe authoring guidance lives in the
  `agent-browser-shield-site-rules` skill at
  `skills/agent-browser-shield-site-rules/SKILL.md`.

## Future work

- Beyond URL recipes: form-filling helpers (e.g. landmark surfacing the
  canonical filter form's parameter names) — not shipped today; would use the
  same composable-templates discipline.
- Expanding host coverage — adding a host is one YAML file plus a test;
  prioritized by real-world usage patterns observed in benchmark and user
  feedback rather than predefined roadmap.

## Related

- ADRs: [ADR-0002](../decisions/0002-rule-id-naming-taxonomy.md) (`-helper`
  reserved for non-defensive agent affordances).
- Docs: [`docs/src/content/docs/rules.md`](../docs/src/content/docs/rules.md)
  §"Agent shortcuts".
- Skills:
  [`skills/agent-browser-shield-site-rules/SKILL.md`](../skills/agent-browser-shield-site-rules/SKILL.md).
- Specs: [0002](./0002-rule-engine.md).
